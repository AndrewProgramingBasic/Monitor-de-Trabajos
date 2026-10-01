import json
import logging
from typing import Any
import pytz
import pywebpush
from pywebpush import WebPushException, webpush
from config import Config
from database import get_db_cursor

logger = logging.getLogger("vpti.notifier")


def send_web_push(subscription_info: dict, payload: dict) -> tuple[bool, int]:
    """
    Sends a single Web Push notification using pywebpush.
    Returns (success: bool, status_code: int).
    """
    if not Config.VAPID_PRIVATE_KEY or not Config.VAPID_SUBJECT:
        logger.warning("VAPID credentials not configured; skipping push dispatch.")
        return False, 0

    try:
        data_str = json.dumps(payload, ensure_ascii=False)
        response = webpush(
            subscription_info=subscription_info,
            data=data_str,
            vapid_private_key=Config.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": Config.VAPID_SUBJECT},
            timeout=10,
        )
        status_code = response.status_code if response else 200
        logger.debug(
            "Web Push delivered to endpoint %s (status %d)",
            subscription_info.get("endpoint"),
            status_code,
        )
        return True, status_code
    except WebPushException as ex:
        status_code = ex.response.status_code if ex.response is not None else 0
        logger.error(
            "WebPushException for endpoint %s: status=%d, message=%s",
            subscription_info.get("endpoint"),
            status_code,
            ex,
        )
        # HTTP 404 or 410 indicates endpoint has expired or unsubscribed
        if status_code in (404, 410):
            endpoint = subscription_info.get("endpoint")
            if endpoint:
                logger.info("Removing inactive push endpoint: %s", endpoint)
                try:
                    with get_db_cursor(commit=True) as cur:
                        cur.execute(
                            "DELETE FROM push_subscriptions WHERE endpoint = %s;",
                            (endpoint,),
                        )
                except Exception as db_exc:
                    logger.error(
                        "Failed to delete expired push subscription: %s", db_exc
                    )
        return False, status_code
    except Exception as exc:
        logger.error("Unexpected error delivering Web Push: %s", exc)
        return False, 500


def build_subscription_dict(sub_record: dict[str, Any]) -> dict:
    """Builds standard pywebpush subscription structure from a database row."""
    return {
        "endpoint": sub_record["endpoint"],
        "keys": {
            "p256dh": sub_record["p256dh_key"],
            "auth": sub_record["auth_key"],
        },
    }


def dispatch_push_to_user(user_id: int, payload: dict) -> dict:
    """
    Dispatches a push notification to all devices registered for a specific user.
    """
    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, user_id, device_label, endpoint, p256dh_key, auth_key 
            FROM push_subscriptions 
            WHERE user_id = %s;
            """,
            (user_id,),
        )
        subscriptions = cur.fetchall()

    sent = 0
    failed = 0
    for sub in subscriptions:
        sub_info = build_subscription_dict(sub)
        success, _ = send_web_push(sub_info, payload)
        if success:
            sent += 1
        else:
            failed += 1

    return {
        "total_targets": len(subscriptions),
        "sent": sent,
        "failed": failed,
    }


def dispatch_task_alert_to_all(task_record: dict[str, Any]) -> dict:
    f"""
    Dispatches the '{Config.ALERT_PREWARNING_MINUTES}'-minutes pre-execution alert to all registered subscribers.
    """
    start_dt = task_record["start_datetime"]
    tz = pytz.timezone(getattr(Config, "TIMEZONE", "America/Caracas"))
    if hasattr(start_dt, "tzinfo") and start_dt.tzinfo:
        start_dt = start_dt.astimezone(tz)
    start_time_str = (
        start_dt.strftime("%H:%M")
        if hasattr(start_dt, "strftime")
        else str(start_dt)
    )
    title = str(task_record.get("title", "Trabajo VPTI"))
    cdc = str(task_record.get("cdc_number") or "S/N")
    task_id = task_record["id"]

    start_iso = (
        start_dt.isoformat()
        if hasattr(start_dt, "isoformat")
        else str(start_dt)
    )

    payload = {
        "title": "ALERTA DE TRABAJO VPTI",
        "body": f"ALERTA EL TRABAJO {title} INICIA A LAS {start_time_str}",
        "data": {
            "taskId": task_id,
            "cdc": cdc,
            "startTime": start_iso,
        },
    }

    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, user_id, device_label, endpoint, p256dh_key, auth_key 
            FROM push_subscriptions;
            """
        )
        subscribers = cur.fetchall()

    logger.info(
        "Dispatching 1h alert for task #%d (%s) to %d subscriber(s)...",
        task_id,
        cdc,
        len(subscribers),
    )

    sent = 0
    failed = 0
    for sub in subscribers:
        sub_info = build_subscription_dict(sub)
        success, _ = send_web_push(sub_info, payload)
        if success:
            sent += 1
        else:
            failed += 1

    return {"subscribers": len(subscribers), "sent": sent, "failed": failed}
