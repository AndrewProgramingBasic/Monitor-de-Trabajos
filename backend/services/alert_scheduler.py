import atexit
import logging
import os
import sys
from datetime import datetime, timedelta
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from config import AppConfig
from database import get_db_cursor
from services.notifier import dispatch_task_alert_to_all

logger = logging.getLogger("vpti.alert_scheduler")

_scheduler: BackgroundScheduler | None = None
_lock_file_fd = None

VENEZUELA_TZ = pytz.timezone(AppConfig.TIMEZONE)


def get_pending_1h_alerts():
    """
    Selects tasks scheduled to start within the prewarning window (ALERT_PREWARNING_MINUTES)
    that have not had an alert sent, using existing columns alert_1h_sent and alert_sent_at.
    """
    # Current local time in Venezuela
    now_local = datetime.now(VENEZUELA_TZ)
    # Target window: tasks starting between now and now + ALERT_PREWARNING_MINUTES
    window_end = now_local + timedelta(minutes=AppConfig.ALERT_PREWARNING_MINUTES)

    query = """
        SELECT id, title, cdc_number, start_datetime, end_datetime
        FROM scheduled_tasks
        WHERE (alert_1h_sent IS FALSE OR alert_1h_sent IS NULL)
          AND (manual_status IS NULL OR manual_status NOT IN ('SUSPENDIDO', 'TERMINADO'))
          AND start_datetime >= %s
          AND start_datetime <= %s
        ORDER BY start_datetime ASC;
    """

    with get_db_cursor(commit=False) as cur:
        cur.execute(query, (now_local, window_end))
        pending = cur.fetchall()

    logger.info(
        f"[vpti.scheduler] Found {len(pending)} tasks pending {AppConfig.ALERT_PREWARNING_MINUTES}-minute alert between {now_local} and {window_end}"
    )
    return pending


def check_and_send_alerts():
    """
    Periodic job executed every SCHEDULER_INTERVAL_SECONDS.
    Selects tasks scheduled to start in the next ${AppConfig.ALERT_PREWARNING_MINUTES} minutes that have not had an alert sent,
    dispatches Web Push notifications to all active subscriptions, and marks tasks as alerted.
    """
    logger.debug("Checking for upcoming tasks starting within prewarning window...")
    try:
        pending_tasks = get_pending_1h_alerts()

        if not pending_tasks:
            logger.debug(f"No pending {AppConfig.ALERT_PREWARNING_MINUTES}-minutes task alerts found.")
            return

        logger.info(
            f"Found {len(pending_tasks)} pending task(s) needing {AppConfig.ALERT_PREWARNING_MINUTES}-minutes pre-execution alerts."
        )

        update_query = """
            UPDATE scheduled_tasks
            SET alert_1h_sent = TRUE,
                alert_sent_at = %s
            WHERE id = %s
        """

        for task in pending_tasks:
            task_id = task["id"]
            try:
                # Dispatch push alerts to all registered subscribers
                dispatch_task_alert_to_all(task)

                # Mark alert as sent in database
                alert_time = datetime.now(VENEZUELA_TZ)
                with get_db_cursor(commit=True) as cur:
                    cur.execute(update_query, (alert_time, task_id))
                logger.info(
                    "Task #%d alert sent and database flag updated (alert_1h_sent=TRUE).",
                    task_id,
                )
            except Exception as exc:
                logger.error(
                    "Failed processing alert for task #%d: %s", task_id, exc
                )

    except Exception as exc:
        logger.error("Error executing check_and_send_alerts job: %s", exc)


def _acquire_process_lock() -> bool:
    """
    Prevents duplicate scheduler execution in multi-worker environments (e.g. Gunicorn)
    or Flask debug reloader.
    """
    # 1. Flask debug reloader check: only run in main reloaded process
    if os.environ.get("FLASK_ENV") == "development" or os.environ.get("FLASK_DEBUG") == "1":
        if os.environ.get("WERKZEUG_RUN_MAIN") != "true":
            logger.debug("Skipping scheduler in Werkzeug reload monitor process.")
            return False

    # 2. File lock check for multi-worker WSGI
    global _lock_file_fd
    lock_file_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "scheduler.lock"
    )

    try:
        if sys.platform == "win32":
            import msvcrt
            _lock_file_fd = open(lock_file_path, "w")
            try:
                msvcrt.locking(_lock_file_fd.fileno(), msvcrt.LK_NBLCK, 1)
                _lock_file_fd.write(f"PID:{os.getpid()}\n")
                _lock_file_fd.flush()
                return True
            except OSError:
                logger.warning("Scheduler lock already held by another worker on Windows.")
                return False
        else:
            import fcntl
            _lock_file_fd = open(lock_file_path, "w")
            try:
                fcntl.flock(_lock_file_fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                _lock_file_fd.write(f"PID:{os.getpid()}\n")
                _lock_file_fd.flush()
                return True
            except (BlockingIOError, IOError):
                logger.warning("Scheduler lock already held by another worker on Unix.")
                return False
    except Exception as exc:
        logger.warning("Could not acquire scheduler file lock: %s. Proceeding cautiously.", exc)
        return True


def start_scheduler() -> BackgroundScheduler | None:
    """
    Initializes and starts the APScheduler background scheduler.
    Guarantees single execution across workers.
    """
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    if not _acquire_process_lock():
        logger.info("Scheduler initialization skipped for this worker.")
        return None

    logger.info(
        f"Starting VPTI Background Alert Scheduler (every {AppConfig.SCHEDULER_INTERVAL_SECONDS}s, prewarning={AppConfig.ALERT_PREWARNING_MINUTES}min)..."
    )
    _scheduler = BackgroundScheduler(
        timezone=AppConfig.TIMEZONE,
        daemon=True,
    )

    _scheduler.add_job(
        func=check_and_send_alerts,
        trigger="interval",
        seconds=AppConfig.SCHEDULER_INTERVAL_SECONDS,
        misfire_grace_time=AppConfig.SCHEDULER_MISFIRE_GRACE_TIME,
        id="check_vpti_task_alerts",
        name=f"Check and dispatch {AppConfig.ALERT_PREWARNING_MINUTES}-minute VPTI task alerts",
        replace_existing=True,
        max_instances=1,
    )

    _scheduler.start()
    logger.info("VPTI Background Alert Scheduler started successfully.")

    # Graceful shutdown handler
    def shutdown():
        global _scheduler, _lock_file_fd
        if _scheduler and _scheduler.running:
            logger.info("Shutting down background scheduler...")
            _scheduler.shutdown(wait=False)
        if _lock_file_fd:
            try:
                _lock_file_fd.close()
            except Exception:
                pass

    atexit.register(shutdown)
    return _scheduler

