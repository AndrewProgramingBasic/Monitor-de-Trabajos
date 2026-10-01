import logging
import os
import sys
from datetime import datetime
import pytz
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from config import Config
from database import check_db_health, init_db
from routes.auth import auth_bp
from routes.push import push_bp
from routes.tasks import tasks_bp
from routes.upload import upload_bp
from scheduler import start_scheduler

# Setup structured logging
logging.basicConfig(
    level=logging.INFO if not Config.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("vpti.app")


def create_app() -> Flask:
    """Application factory for the VPTI backend."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # 1. Configure CORS
    logger.info("Configuring CORS with allowed origins: %s", Config.CORS_ORIGINS)
    CORS(
        app,
        resources={r"/api/*": {"origins": Config.CORS_ORIGINS}},
        supports_credentials=True,
    )

    # 2. Configure JWT
    jwt = JWTManager(app)

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return (
            jsonify(
                {
                    "error": "El token de acceso ha expirado. Por favor inicie sesión nuevamente.",
                    "code": "token_expired",
                }
            ),
            401,
        )

    @jwt.invalid_token_loader
    def invalid_token_callback(error_string):
        return (
            jsonify(
                {
                    "error": f"Token inválido: {error_string}",
                    "code": "invalid_token",
                }
            ),
            401,
        )

    @jwt.unauthorized_loader
    def missing_token_callback(error_string):
        return (
            jsonify(
                {
                    "error": "Se requiere cabecera de autorización Bearer Token.",
                    "code": "authorization_required",
                }
            ),
            401,
        )

    # 3. Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(tasks_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(push_bp)

    # 4. Standard Health Check Endpoint
    @app.route("/api/health", methods=["GET"])
    def health_check():
        db_alive = check_db_health()
        tz = pytz.timezone(Config.TIMEZONE)
        now_local = datetime.now(tz).isoformat()

        status_code = 200 if db_alive else 503
        return (
            jsonify(
                {
                    "status": "UP" if db_alive else "DEGRADED",
                    "database_connected": db_alive,
                    "server_time": now_local,
                    "timezone": Config.TIMEZONE,
                    "vapid_configured": bool(
                        Config.VAPID_PUBLIC_KEY and Config.VAPID_PRIVATE_KEY
                    ),
                }
            ),
            status_code,
        )

    # 5. Global HTTP Error Handlers
    @app.errorhandler(400)
    def bad_request(error):
        return (
            jsonify(
                {
                    "error": str(getattr(error, "description", "Solicitud incorrecta")),
                    "status_code": 400,
                }
            ),
            400,
        )

    @app.errorhandler(404)
    def not_found(error):
        return (
            jsonify(
                {
                    "error": "El recurso solicitado no fue encontrado.",
                    "status_code": 404,
                }
            ),
            404,
        )

    @app.errorhandler(405)
    def method_not_allowed(error):
        return (
            jsonify(
                {
                    "error": "Método HTTP no permitido para este endpoint.",
                    "status_code": 405,
                }
            ),
            405,
        )

    @app.errorhandler(500)
    def internal_error(error):
        logger.error("Internal Server Error: %s", error)
        return (
            jsonify(
                {
                    "error": "Ocurrió un error interno en el servidor.",
                    "status_code": 500,
                }
            ),
            500,
        )

    # 6. Database Initialization & Background Scheduler
    with app.app_context():
        try:
            init_db()
        except Exception as exc:
            logger.warning(
                "Could not initialize database on startup (will retry on incoming requests): %s",
                exc,
            )

        try:
            start_scheduler()
        except Exception as exc:
            logger.error("Failed to launch background scheduler: %s", exc)

    return app


app = create_app()

if __name__ == "__main__":
    logger.info("Starting VPTI backend on port %d...", Config.PORT)
    app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)
