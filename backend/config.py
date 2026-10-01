import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class AppConfig:
    """Application and scheduler configuration loaded from environment variables."""

    # Environment mode
    IS_DOCKER = (
        os.path.exists("/.dockerenv")
        or os.getenv("IS_DOCKER", "false").lower() == "true"
    )

    # Database parameters
    DB_USER = os.getenv("DB_USER", os.getenv("POSTGRES_USER", "postgres"))
    DB_PASSWORD = os.getenv("DB_PASSWORD", os.getenv("POSTGRES_PASSWORD", ""))
    DB_PORT = os.getenv("DB_PORT", os.getenv("POSTGRES_PORT", "5433"))
    DB_NAME = os.getenv("DB_NAME", os.getenv("POSTGRES_DB", "vpti_tasks_db"))

    # Resolve default host depending on runtime environment
    _default_host = "host.docker.internal" if IS_DOCKER else "127.0.0.1"
    DB_HOST = os.getenv("DB_HOST", _default_host)

    # Full DATABASE_URL handling
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        # If running inside Docker but DATABASE_URL points to localhost/127.0.0.1, adapt it to the host gateway
        if IS_DOCKER and (
            "@127.0.0.1:" in DATABASE_URL or "@localhost:" in DATABASE_URL
        ):
            DATABASE_URL = (
                DATABASE_URL.replace("@127.0.0.1:", "@host.docker.internal:")
                .replace("@localhost:", "@host.docker.internal:")
            )

    # Timing and scheduler properties
    TIMEZONE = os.getenv("TIMEZONE", "America/Caracas")
    ALERT_PREWARNING_MINUTES = int(os.getenv("ALERT_PREWARNING_MINUTES", "20"))
    SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60"))
    SCHEDULER_MISFIRE_GRACE_TIME = int(
        os.getenv("SCHEDULER_JOB_MISFIRE_GRACE_TIME", "30")
    )

    # Web Push & Security
    VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_SUBJECT = os.getenv(
        "VAPID_SUBJECT", "mailto:soporte@adantechti.com"
    )
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-me")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # Regional & Server Settings
    PORT = int(os.getenv("PORT", 5000))
    ENV = os.getenv("FLASK_ENV", "development")
    DEBUG = ENV == "development"

    # CORS
    raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    CORS_ORIGINS = [
        origin.strip() for origin in raw_cors.split(",") if origin.strip()
    ]

    # File uploads
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB max upload limit


# Backward compatibility alias
Config = AppConfig
