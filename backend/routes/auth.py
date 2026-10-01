import logging
import bcrypt
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from database import get_db_cursor

logger = logging.getLogger("vpti.routes.auth")

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """
    Authenticates user with username or email and bcrypt password.
    Returns JWT access token and user info.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido."}), 400

    username_or_email = str(data.get("username_or_email", "")).strip()
    password = str(data.get("password", "")).strip()

    if not username_or_email or not password:
        return (
            jsonify(
                {"error": "Debe proporcionar usuario/correo y contraseña."}
            ),
            400,
        )

    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, username, email, password_hash, full_name
            FROM users
            WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s);
            """,
            (username_or_email, username_or_email),
        )
        user = cur.fetchone()

    if not user:
        return (
            jsonify({"error": "Credenciales inválidas. Usuario no encontrado."}),
            401,
        )

    stored_hash = user["password_hash"]
    try:
        pw_bytes = password.encode("utf-8")
        hash_bytes = stored_hash.encode("utf-8")
        is_valid = bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception as exc:
        logger.error("Error verifying password hash: %s", exc)
        is_valid = False

    if not is_valid:
        return jsonify({"error": "Credenciales inválidas. Contraseña incorrecta."}), 401

    # In Flask-JWT-Extended, identity is best stored as string
    token = create_access_token(
        identity=str(user["id"]),
        additional_claims={
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
        },
    )

    return (
        jsonify(
            {
                "access_token": token,
                "user": {
                    "id": user["id"],
                    "username": user["username"],
                    "email": user["email"],
                    "full_name": user["full_name"],
                },
            }
        ),
        200,
    )


@auth_bp.route("/api/auth/me", methods=["GET"])
@jwt_required()
def get_current_user():
    """
    Returns the currently authenticated user profile.
    """
    user_id = get_jwt_identity()

    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, username, email, full_name, created_at, created_by_user_id
            FROM users
            WHERE id = %s;
            """,
            (user_id,),
        )
        user = cur.fetchone()

    if not user:
        return jsonify({"error": "Usuario no encontrado."}), 404

    # Format created_at to ISO string
    if user.get("created_at") and hasattr(user["created_at"], "isoformat"):
        user["created_at"] = user["created_at"].isoformat()

    return jsonify(user), 200


@auth_bp.route("/api/users", methods=["POST"])
@jwt_required()
def create_user():
    """
    Registers a new internal user. Requires valid JWT authentication.
    """
    current_user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido."}), 400

    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", "")).strip()
    full_name = str(data.get("full_name", "")).strip()

    if not username or not email or not password or not full_name:
        return (
            jsonify(
                {
                    "error": "Todos los campos son obligatorios: username, email, password, full_name."
                }
            ),
            400,
        )

    # Check uniqueness of username and email
    with get_db_cursor(commit=False) as cur:
        cur.execute(
            """
            SELECT id, username, email FROM users
            WHERE LOWER(username) = LOWER(%s) OR LOWER(email) = LOWER(%s);
            """,
            (username, email),
        )
        existing = cur.fetchone()
        if existing:
            if existing["username"].lower() == username.lower():
                return (
                    jsonify({"error": f"El nombre de usuario '{username}' ya está en uso."}),
                    409,
                )
            return (
                jsonify({"error": f"El correo electrónico '{email}' ya está registrado."}),
                409,
            )

    # Hash password with bcrypt (salt work factor 10)
    hashed_pw = bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(10)
    ).decode("utf-8")

    with get_db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, password_hash, full_name, created_by_user_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, username, email, full_name, created_at, created_by_user_id;
            """,
            (username, email, hashed_pw, full_name, current_user_id),
        )
        new_user = cur.fetchone()

    if new_user and new_user.get("created_at") and hasattr(new_user["created_at"], "isoformat"):
        new_user["created_at"] = new_user["created_at"].isoformat()

    return jsonify(new_user), 201
