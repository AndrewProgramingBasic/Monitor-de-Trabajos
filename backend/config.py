import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class AppConfig:
    """Application and scheduler configuration loaded from environment variables."""

    # Timing & Scheduler Settings
    TIMEZONE = os.getenv("TIMEZONE", "America/Caracas")
    ALERT_PREWARNING_MINUTES = int(os.getenv("ALERT_PREWARNING_MINUTES", "60"))
    SCHEDULER_INTERVAL_SECONDS = int(os.getenv("SCHEDULER_INTERVAL_SECONDS", "60"))
    SCHEDULER_MISFIRE_GRACE_TIME = int(
        os.getenv("SCHEDULER_JOB_MISFIRE_GRACE_TIME", "30")
    )

    # Database
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://user:Clave@localhost:5432/db",
    )

    # JWT Authentication
    JWT_SECRET_KEY = os.getenv(
        "JWT_SECRET_KEY", "jwt"
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # Web Push (VAPID)
    VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_SUBJECT = os.getenv(
        "VAPID_SUBJECT", "mailto:user@gmail.com"
    )

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
