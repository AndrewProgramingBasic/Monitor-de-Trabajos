import logging
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from config import Config
from database import get_db_cursor
from services.notifier import dispatch_push_to_user

logger = logging.getLogger("vpti.routes.push")

push_bp = Blueprint("push", __name__)


@push_bp.route("/api/push/vapid-public-key", methods=["GET"])
def get_vapid_public_key():
    """
    Returns the VAPID public key required by browsers to subscribe to Web Push.
    """
    return jsonify({"public_key": Config.VAPID_PUBLIC_KEY}), 200


@push_bp.route("/api/push/subscribe", methods=["POST"])
@jwt_required()
def subscribe_push():
    """
    Registers or updates a browser Web Push subscription for the authenticated user.
    Body format:
      {
        "endpoint": "https://...",
        "keys": {
          "p256dh": "...",
          "auth": "..."
        },
        "device_label": "Chrome on Windows (optional)"
      }
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido."}), 400

    endpoint = str(data.get("endpoint", "")).strip()
    keys = data.get("keys", {})
    if (not endpoint or not keys) and "subscription" in data:
        sub = data.get("subscription", {})
        if isinstance(sub, dict):
            endpoint = str(sub.get("endpoint", "")).strip()
            keys = sub.get("keys", {})

    p256dh = str(keys.get("p256dh", "")).strip() if isinstance(keys, dict) else ""
    auth = str(keys.get("auth", "")).strip() if isinstance(keys, dict) else ""
    device_label = data.get("device_label") or data.get("device_name")
    if device_label:
        device_label = str(device_label).strip()

    if not endpoint or not p256dh or not auth:
        return (
            jsonify(
                {
                    "error": "Suscripción incompleta. Se requieren: endpoint, keys.p256dh, keys.auth."
                }
            ),
            400,
        )

    upsert_sql = """
        INSERT INTO push_subscriptions (user_id, device_label, endpoint, p256dh_key, auth_key)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (endpoint) DO UPDATE 
        SET user_id = EXCLUDED.user_id,
            p256dh_key = EXCLUDED.p256dh_key,
            auth_key = EXCLUDED.auth_key,
            device_label = EXCLUDED.device_label;
    """

    with get_db_cursor(commit=True) as cur:
        cur.execute(
            upsert_sql,
            (int(user_id), device_label, endpoint, p256dh, auth),
        )

    logger.info(
        "User #%s successfully subscribed push endpoint: %s (%s)",
        user_id,
        endpoint[:35] + "...",
        device_label or "No label",
    )
    return (
        jsonify({"message": "Suscripción a notificaciones Web Push registrada con éxito."}),
        201,
    )


@push_bp.route("/api/push/test", methods=["POST"])
@jwt_required()
def test_push():
    """
    Dispatches an immediate test push to all registered devices of the current user.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}

    title = data.get("title", "TEST DE NOTIFICACIÓN VPTI")
    body = data.get(
        "body",
        "Esta es una prueba de notificación Web Push desde el backend de VPTI Task Monitor.",
    )

    payload = {
        "title": title,
        "body": body,
        "data": {
            "type": "TEST",
            "userId": user_id,
        },
    }

    result = dispatch_push_to_user(user_id=user_id, payload=payload)
    logger.info("Test push dispatched for user #%d: %s", user_id, result)

    return (
        jsonify(
            {
                "message": "Prueba de notificación enviada.",
                "delivery_summary": result,
            }
        ),
        200,
    )
