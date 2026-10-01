import logging
import re
import urllib.parse
from contextlib import contextmanager
import bcrypt
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from config import Config

logger = logging.getLogger("vpti.database")

_connection_pool: pool.ThreadedConnectionPool | None = None


def parse_database_url(url: str) -> dict:
    """
    Robustly parses a PostgreSQL connection URL into kwargs for psycopg2.
    Handles special characters in passwords (e.g. #, ?, :, *, !) gracefully.
    """
    if not url:
        raise ValueError("DATABASE_URL is empty or not configured.")

    # Try standard URL parsing or regex extraction
    pattern = (
        r"^(?:postgres(?:ql)?://)?"
        r"(?:(?P<user>[^:]+)(?::(?P<password>.*))?@)?"
        r"(?P<host>[^:/]+)"
        r"(?::(?P<port>\d+))?"
        r"(?:/(?P<dbname>[^?]+))?"
    )
    match = re.match(pattern, url.strip().strip('"').strip("'"))
    if match:
        data = match.groupdict()
        params = {}
        if data.get("user"):
            params["user"] = urllib.parse.unquote(data["user"])
        if data.get("password") is not None:
            params["password"] = urllib.parse.unquote(data["password"])
        if data.get("host"):
            params["host"] = data["host"]
        if data.get("port"):
            params["port"] = int(data["port"])
        if data.get("dbname"):
            params["dbname"] = data["dbname"].strip("/")
        return params

    return {"dsn": url}


def get_pool() -> pool.ThreadedConnectionPool:
    """
    Returns the active connection pool, initializing it if necessary.
    """
    global _connection_pool
    if _connection_pool is None:
        init_pool()
    return _connection_pool


def init_pool(minconn: int = 1, maxconn: int = 20):
    """
    Initializes the ThreadedConnectionPool using configuration parameters.
    """
    global _connection_pool
    if _connection_pool is not None:
        return

    params = parse_database_url(Config.DATABASE_URL)
    logger.info(
        "Initializing PostgreSQL connection pool to host=%s, port=%s, db=%s",
        params.get("host"),
        params.get("port"),
        params.get("dbname"),
    )
    try:
        _connection_pool = pool.ThreadedConnectionPool(
            minconn=minconn,
            maxconn=maxconn,
            **params,
        )
        logger.info("PostgreSQL connection pool initialized successfully.")
    except Exception as exc:
        logger.error("Failed to initialize PostgreSQL connection pool: %s", exc)
        raise


def close_pool():
    """
    Closes all connections in the pool gracefully.
    """
    global _connection_pool
    if _connection_pool is not None:
        _connection_pool.closeall()
        _connection_pool = None
        logger.info("PostgreSQL connection pool closed.")


@contextmanager
def get_db_connection():
    """
    Context manager that checks out a connection from the pool,
    enforces America/Caracas timezone, and returns it to the pool on exit.
    """
    p = get_pool()
    conn = p.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET TIME ZONE '{Config.TIMEZONE}';")
        yield conn
    finally:
        p.putconn(conn)


@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Context manager that yields a RealDictCursor.
    Automatically rolls back on exception, commits on success if commit=True,
    and returns the connection to the pool.
    """
    p = get_pool()
    conn = p.getconn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"SET TIME ZONE '{Config.TIMEZONE}';")
            yield cur
        if commit:
            conn.commit()
    except Exception:
        if not conn.closed:
            conn.rollback()
        raise
    finally:
        p.putconn(conn)


def check_db_health() -> bool:
    """
    Pings the database to verify active connectivity.
    """
    try:
        with get_db_cursor(commit=False) as cur:
            cur.execute("SELECT 1 AS alive;")
            row = cur.fetchone()
            return bool(row and row.get("alive") == 1)
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        return False


SCHEMA_SQL = f"""
-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_user_id INTEGER REFERENCES users(id)
);

-- 2. Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    device_label VARCHAR(255),
    endpoint TEXT UNIQUE NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Committee sheets table
CREATE TABLE IF NOT EXISTS committee_sheets (
    id SERIAL PRIMARY KEY,
    committee_name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Scheduled tasks table
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id SERIAL PRIMARY KEY,
    sheet_id INTEGER REFERENCES committee_sheets(id),
    sheet_item_order INTEGER,
    title TEXT NOT NULL,
    cdc_number VARCHAR(100),
    justification TEXT,
    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    has_affectation VARCHAR(10) DEFAULT 'NO',
    affectation_start TIMESTAMP WITH TIME ZONE,
    affectation_end TIMESTAMP WITH TIME ZONE,
    affectation_details TEXT,
    vpti_committee_approval VARCHAR(100),
    managers_approval VARCHAR(100),
    is_rescheduled BOOLEAN DEFAULT FALSE,
    parent_task_id INTEGER REFERENCES scheduled_tasks(id),
    alert_1h_sent BOOLEAN DEFAULT FALSE,
    alert_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE,
    updated_by INTEGER REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_cdc ON scheduled_tasks(cdc_number);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_sheet ON scheduled_tasks(sheet_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_start ON scheduled_tasks(start_datetime);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_alert ON scheduled_tasks(alert_1h_sent, start_datetime);

-- 5. Unified View for Tasks Dashboard
CREATE OR REPLACE VIEW v_scheduled_tasks AS
SELECT 
    t.id,
    t.sheet_id,
    cs.committee_name,
    t.sheet_item_order,
    t.title,
    t.cdc_number,
    t.justification,
    t.start_datetime,
    t.end_datetime,
    t.has_affectation,
    t.affectation_start,
    t.affectation_end,
    t.affectation_details,
    t.vpti_committee_approval,
    t.managers_approval,
    t.is_rescheduled,
    t.parent_task_id,
    t.alert_1h_sent,
    t.alert_sent_at,
    t.created_at,
    t.created_by,
    t.updated_at,
    t.updated_by,
    u_creator.full_name AS created_by_name,
    u_updater.full_name AS updated_by_name,
    CASE
        WHEN t.end_datetime < (CURRENT_TIMESTAMP AT TIME ZONE '{Config.TIMEZONE}') THEN 'TERMINADO'
        WHEN t.start_datetime <= (CURRENT_TIMESTAMP AT TIME ZONE '{Config.TIMEZONE}') 
             AND t.end_datetime >= (CURRENT_TIMESTAMP AT TIME ZONE '{Config.TIMEZONE}') THEN 'EN EJECUCION'
        WHEN t.start_datetime <= ((CURRENT_TIMESTAMP AT TIME ZONE '{Config.TIMEZONE}') + ({Config.ALERT_PREWARNING_MINUTES} * INTERVAL '1 minute'))
             AND t.start_datetime > (CURRENT_TIMESTAMP AT TIME ZONE '{Config.TIMEZONE}') THEN 'PROXIMO (MENOS DE {Config.ALERT_PREWARNING_MINUTES} MINUTOS)'
        ELSE 'PROGRAMADO'
    END AS execution_status,
    cs.filename AS sheet_filename,
    cs.uploaded_at AS sheet_uploaded_at
FROM scheduled_tasks t
LEFT JOIN committee_sheets cs ON t.sheet_id = cs.id
LEFT JOIN users u_creator ON t.created_by = u_creator.id
LEFT JOIN users u_updater ON t.updated_by = u_updater.id;

-- 6. Trigger to prevent deletion on scheduled_tasks, committee_sheets, and users
CREATE OR REPLACE FUNCTION prevent_table_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'DELETIONS ARE FORBIDDEN on table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_delete_scheduled_tasks') THEN
        CREATE TRIGGER trg_prevent_delete_scheduled_tasks
        BEFORE DELETE ON scheduled_tasks
        FOR EACH ROW EXECUTE FUNCTION prevent_table_deletion();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_delete_committee_sheets') THEN
        CREATE TRIGGER trg_prevent_delete_committee_sheets
        BEFORE DELETE ON committee_sheets
        FOR EACH ROW EXECUTE FUNCTION prevent_table_deletion();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_delete_users') THEN
        CREATE TRIGGER trg_prevent_delete_users
        BEFORE DELETE ON users
        FOR EACH ROW EXECUTE FUNCTION prevent_table_deletion();
    END IF;
END $$;
"""


def init_db():
    """
    Executes the DDL schema to ensure tables, views, and triggers are ready,
    and seeds a default administrator user if no users currently exist.
    """
    logger.info("Ensuring database schema, views, and triggers exist...")
    try:
        with get_db_cursor(commit=True) as cur:
            cur.execute(SCHEMA_SQL)

            # Check if default admin user exists
            cur.execute("SELECT id FROM users LIMIT 1;")
            if not cur.fetchone():
                logger.info("Seeding default administrator user: aandra05...")
                hashed_pw = bcrypt.hashpw(
                    "ClaveSegura2026*".encode("utf-8"), bcrypt.gensalt(10)
                ).decode("utf-8")
                cur.execute(
                    """
                    INSERT INTO users (username, email, password_hash, full_name)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        "aandra05",
                        "andradeandradeje@gmail.com",
                        hashed_pw,
                        "Andrew Andrades",
                    ),
                )
        logger.info("Database schema initialized and verified successfully.")
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise
