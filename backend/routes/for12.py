import hashlib
import logging
import os
import re
from datetime import datetime
from pathlib import Path
import requests
from flask import Blueprint, jsonify, request, send_file
from flask_jwt_extended import get_jwt_identity, jwt_required
from database import get_db_cursor
from services.excel_parser import clean_cdc_number

logger = logging.getLogger("vpti.routes.for12")

for12_bp = Blueprint("for12", __name__)

ALLOWED_EXTENSIONS = {"xlsx", "xls", "xlsm"}

# Base storage directory for FOR12 files
FOR12_DIR = Path(__file__).resolve().parent.parent / "for12"
FOR12_DIR.mkdir(parents=True, exist_ok=True)


def is_allowed_file(filename: str) -> bool:
    """Verifies that uploaded file has an allowed Excel extension."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def normalize_message_newlines(text: str) -> str:
    """Normalizes literal escaped newlines (\\n, \\r\\n) and carriage returns to real newlines."""
    if not text:
        return ""
    return (
        str(text)
        .replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\r", "\n")
        .replace("\r\n", "\n")
        .replace("\r", "\n")
    )


def serialize_for12_record(row: dict) -> dict:
    """Serializes datetime objects in a for12 view dictionary to ISO strings and normalizes newlines."""
    res = dict(row)
    for key in ("uploaded_at", "created_at"):
        if res.get(key) and hasattr(res[key], "isoformat"):
            res[key] = res[key].isoformat()
    if res.get("message_text"):
        res["message_text"] = normalize_message_newlines(res["message_text"])
    return res


def find_scheduled_task(cur, task_id: int | None = None, cdc_number: str | None = None) -> dict | None:
    """
    Finds a scheduled task record by task_id or cdc_number.
    """
    if task_id is not None:
        cur.execute(
            "SELECT id, cdc_number, title FROM scheduled_tasks WHERE id = %s;",
            (task_id,),
        )
        task = cur.fetchone()
        if task:
            return dict(task)

    if cdc_number:
        cleaned_cdc = clean_cdc_number(str(cdc_number).strip())
        target_cdc = cleaned_cdc if cleaned_cdc else str(cdc_number).strip()
        cur.execute(
            """
            SELECT id, cdc_number, title 
            FROM scheduled_tasks 
            WHERE cdc_number = %s OR cdc_number ILIKE %s 
            ORDER BY id DESC 
            LIMIT 1;
            """,
            (target_cdc, f"%{target_cdc}%"),
        )
        task = cur.fetchone()
        if task:
            return dict(task)

    return None


# ---------------------------------------------------------------------------
# 1. Endpoint: Cargar FOR12 y registrar redacción
# ---------------------------------------------------------------------------
@for12_bp.route("/api/for12/upload", methods=["POST"])
@for12_bp.route("/api/tasks/<int:task_id>/for12", methods=["POST"])
@for12_bp.route("/api/tasks/for12", methods=["POST"])
@jwt_required()
def upload_for12_and_message(task_id: int | None = None):
    """
    Receives an Excel file (multipart/form-data) and a message text.
    1. Associates it with the task (via task_id in URL, form-data, or cdc_number in form-data).
    2. Saves the Excel file in the 'for12' directory.
    3. Saves file metadata into 'for12_files'.
    4. Saves the received message text into 'for12_messages'.
    """
    user_id = get_jwt_identity()

    # Determine task_id or cdc_number
    req_task_id = task_id
    if req_task_id is None and request.form.get("task_id"):
        try:
            req_task_id = int(request.form.get("task_id"))
        except (ValueError, TypeError):
            req_task_id = None

    cdc_number = (
        request.form.get("cdc_number")
        or request.form.get("cdc")
        or request.form.get("numero_cdc")
    )

    if req_task_id is None and not cdc_number:
        return (
            jsonify(
                {
                    "error": "Debe especificar el identificador de la tarea ('task_id') o el número de CDC ('cdc_number')."
                }
            ),
            400,
        )

    # Validate message text
    message_text = (
        request.form.get("message")
        or request.form.get("message_text")
        or request.form.get("mensaje")
        or request.form.get("redaccion")
    )
    if not message_text or not str(message_text).strip():
        return (
            jsonify(
                {
                    "error": "El mensaje de redacción es obligatorio ('message' o 'message_text')."
                }
            ),
            400,
        )
    message_text = normalize_message_newlines(str(message_text).strip())

    # Validate file
    file = (
        request.files.get("file")
        or request.files.get("excel")
        or request.files.get("for12")
        or request.files.get("document")
    )
    if not file and request.files:
        file = next(iter(request.files.values()), None)

    if not file or file.filename == "":
        return (
            jsonify(
                {
                    "error": "Debe incluir un archivo Excel en la solicitud ('file')."
                }
            ),
            400,
        )

    if not is_allowed_file(file.filename):
        return (
            jsonify(
                {
                    "error": f"Formato de archivo no soportado. Extensiones permitidas: {', '.join(ALLOWED_EXTENSIONS)}"
                }
            ),
            400,
        )

    try:
        file_bytes = file.read()
        file_size = len(file_bytes)
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        with get_db_cursor(commit=True) as cur:
            # 1. Resolve task in DB
            task = find_scheduled_task(cur, task_id=req_task_id, cdc_number=cdc_number)
            if not task:
                identifier_info = f"ID={req_task_id}" if req_task_id else f"CDC={cdc_number}"
                return (
                    jsonify(
                        {
                            "error": f"No se encontró el trabajo correspondiente ({identifier_info}).",
                            "detail": "Verifique que el número de CDC o ID del ticket exista en la base de datos.",
                        }
                    ),
                    404,
                )

            resolved_task_id = task["id"]

            # 2. Save file on disk in 'for12' directory
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            original_filename = os.path.basename(file.filename)
            safe_name = re.sub(r"[^\w\.-]", "_", original_filename)
            saved_filename = f"{resolved_task_id}_{ts}_{safe_name}"
            saved_filepath = FOR12_DIR / saved_filename
            with open(saved_filepath, "wb") as f_out:
                f_out.write(file_bytes)

            storage_path = f"for12/{saved_filename}"

            # 3. Check if exact file hash already exists for this task (unique constraint uq_for12_files_task_hash)
            cur.execute(
                """
                SELECT id, storage_path 
                FROM for12_files 
                WHERE task_id = %s AND file_hash = %s 
                LIMIT 1;
                """,
                (resolved_task_id, file_hash),
            )
            existing_file = cur.fetchone()

            if existing_file:
                file_id = existing_file["id"]
                logger.info(
                    "Re-uploading same FOR12 file hash for task #%d (file_id=%d). Updating message.",
                    resolved_task_id,
                    file_id,
                )
                # Update existing message for this file
                cur.execute(
                    """
                    INSERT INTO for12_messages (file_id, message_text, created_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (file_id) DO UPDATE
                    SET message_text = EXCLUDED.message_text,
                        created_at = NOW();
                    """,
                    (file_id, message_text),
                )
            else:
                # 4. Insert into for12_files
                cur.execute(
                    """
                    INSERT INTO for12_files (
                        task_id, original_filename, storage_path, file_hash, file_size, uploaded_by, uploaded_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (
                        resolved_task_id,
                        original_filename,
                        storage_path,
                        file_hash,
                        file_size,
                        int(user_id),
                    ),
                )
                inserted = cur.fetchone()
                file_id = inserted["id"]

                # 5. Insert into for12_messages
                cur.execute(
                    """
                    INSERT INTO for12_messages (file_id, message_text, created_at)
                    VALUES (%s, %s, NOW());
                    """,
                    (file_id, message_text),
                )

            # 6. Fetch from v_task_message view
            cur.execute(
                """
                SELECT task_id, cdc_number, title, message_text, original_filename, storage_path, uploaded_at
                FROM v_task_message
                WHERE task_id = %s;
                """,
                (resolved_task_id,),
            )
            record = cur.fetchone()

        serialized_data = serialize_for12_record(record) if record else {
            "task_id": resolved_task_id,
            "cdc_number": task.get("cdc_number"),
            "title": task.get("title"),
            "message_text": message_text,
            "original_filename": original_filename,
            "storage_path": storage_path,
            "file_size": file_size,
            "file_id": file_id,
        }

        logger.info(
            "FOR12 file '%s' and message registered successfully for task #%d by user #%s",
            original_filename,
            resolved_task_id,
            user_id,
        )

        return (
            jsonify(
                {
                    "message": "Archivo FOR12 y redacción registrados exitosamente.",
                    "data": serialized_data,
                }
            ),
            201,
        )
    except Exception as exc:
        logger.error("Error processing FOR12 upload: %s", exc, exc_info=True)
        return (
            jsonify(
                {
                    "error": "Error interno al procesar el archivo FOR12 y guardar la redacción.",
                    "detail": str(exc),
                }
            ),
            500,
        )


# ---------------------------------------------------------------------------
# 2. Endpoint: Consultar redacción / mensaje de un ticket
# ---------------------------------------------------------------------------
@for12_bp.route("/api/tasks/<int:task_id>/for12", methods=["GET"])
@for12_bp.route("/api/tasks/<int:task_id>/message", methods=["GET"])
@for12_bp.route("/api/for12/message", methods=["GET"])
@for12_bp.route("/api/for12/message/<identifier>", methods=["GET"])
@jwt_required()
def get_task_message(task_id: int | None = None, identifier: str | None = None):
    """
    Retrieves the FOR12 message / redacción corresponding to a task/ticket.
    Can be queried by:
      - /api/tasks/<task_id>/for12
      - /api/tasks/<task_id>/message
      - /api/for12/message?task_id=... or ?cdc=...
      - /api/for12/message/<identifier> (where identifier is task_id or cdc_number)
    """
    target_task_id = task_id
    target_cdc = None

    if target_task_id is None:
        # Check query params
        q_task_id = request.args.get("task_id", type=int)
        q_cdc = request.args.get("cdc") or request.args.get("cdc_number")

        if q_task_id is not None:
            target_task_id = q_task_id
        elif q_cdc:
            target_cdc = q_cdc.strip()
        elif identifier:
            ident_str = str(identifier).strip()
            if ident_str.isdigit() and len(ident_str) <= 7:
                # Could be task_id
                target_task_id = int(ident_str)
            else:
                target_cdc = ident_str

    if target_task_id is None and not target_cdc:
        return (
            jsonify(
                {
                    "error": "Debe proporcionar un 'task_id' o número de 'cdc' para consultar la redacción."
                }
            ),
            400,
        )

    with get_db_cursor(commit=False) as cur:
        # 1. Attempt lookup in view v_task_message
        row = None
        if target_task_id is not None:
            cur.execute(
                """
                SELECT task_id, cdc_number, title, message_text, original_filename, storage_path, uploaded_at
                FROM v_task_message
                WHERE task_id = %s;
                """,
                (target_task_id,),
            )
            row = cur.fetchone()

        if not row and target_cdc:
            cleaned_cdc = clean_cdc_number(target_cdc)
            search_cdc = cleaned_cdc if cleaned_cdc else target_cdc
            cur.execute(
                """
                SELECT task_id, cdc_number, title, message_text, original_filename, storage_path, uploaded_at
                FROM v_task_message
                WHERE cdc_number = %s OR cdc_number ILIKE %s
                ORDER BY uploaded_at DESC
                LIMIT 1;
                """,
                (search_cdc, f"%{search_cdc}%"),
            )
            row = cur.fetchone()

        # If found in view:
        if row:
            data = serialize_for12_record(dict(row))
            data["has_message"] = True
            return jsonify(data), 200

        # If not found in view, check if the task actually exists in scheduled_tasks
        task = find_scheduled_task(cur, task_id=target_task_id, cdc_number=target_cdc)
        if not task:
            return (
                jsonify(
                    {
                        "error": "El trabajo especificado no fue encontrado en el sistema.",
                        "has_message": False,
                    }
                ),
                404,
            )

        return (
            jsonify(
                {
                    "error": "No se ha registrado ninguna redacción o archivo FOR12 para este trabajo.",
                    "task_id": task["id"],
                    "cdc_number": task.get("cdc_number"),
                    "title": task.get("title"),
                    "has_message": False,
                }
            ),
            404,
        )


# ---------------------------------------------------------------------------
# 3. Endpoint: Descargar archivo FOR12 original
# ---------------------------------------------------------------------------
@for12_bp.route("/api/tasks/<int:task_id>/for12/download", methods=["GET"])
@for12_bp.route("/api/for12/download/<int:file_id>", methods=["GET"])
@jwt_required()
def download_for12_file(task_id: int | None = None, file_id: int | None = None):
    """
    Downloads the stored FOR12 Excel file.
    """
    with get_db_cursor(commit=False) as cur:
        if file_id is not None:
            cur.execute(
                "SELECT original_filename, storage_path FROM for12_files WHERE id = %s;",
                (file_id,),
            )
        elif task_id is not None:
            cur.execute(
                """
                SELECT original_filename, storage_path 
                FROM for12_files 
                WHERE task_id = %s 
                ORDER BY id DESC 
                LIMIT 1;
                """,
                (task_id,),
            )
        else:
            return jsonify({"error": "Parámetro de archivo o tarea no especificado."}), 400

        file_row = cur.fetchone()

    if not file_row:
        return jsonify({"error": "Archivo FOR12 no encontrado en la base de datos."}), 404

    storage_path = file_row["storage_path"]
    original_filename = file_row["original_filename"]

    # Locate file on disk
    backend_dir = Path(__file__).resolve().parent.parent
    file_path = backend_dir / storage_path
    if not file_path.exists():
        # Fallback check in FOR12_DIR
        file_path = FOR12_DIR / Path(storage_path).name

    if not file_path.exists():
        logger.error("File on disk missing for storage_path: %s", storage_path)
        return (
            jsonify(
                {
                    "error": "El archivo físico no fue encontrado en el servidor.",
                    "storage_path": storage_path,
                }
            ),
            404,
        )

    return send_file(
        str(file_path),
        as_attachment=True,
        download_name=original_filename,
    )


@for12_bp.route("/api/redactar", methods=["POST"])
@for12_bp.route("/api/for12/redactar", methods=["POST"])
def proxy_redactar():
    """
    Proxy endpoint for /api/redactar and /api/for12/redactar.
    Forwards multipart/form-data directly to the redactor service container,
    ensuring that the request succeeds and provides actionable diagnostics if it fails.
    """
    target_url = (
        os.getenv("INTERNAL_REDACTOR_URL")
        or os.getenv("REDACTOR_SERVICE_URL")
        or os.getenv("REDACTAR_URL")
        or os.getenv("NEXT_PUBLIC_REDACTAR_URL")
        or ("http://redactor_app:5000/api/redactar" if os.getenv("FLASK_ENV") == "production" else "http://localhost:7000/api/redactar")
    ).strip()

    if not target_url.startswith("http://") and not target_url.startswith("https://"):
        target_url = f"http://{target_url}"
    if not target_url.endswith("/api/redactar") and not target_url.endswith("/redactar"):
        target_url = target_url.rstrip("/") + "/api/redactar"

    try:
        files = {}
        for key, storage in request.files.items():
            files[key] = (storage.filename, storage.read(), storage.content_type)
        data = {k: v for k, v in request.form.items()}

        resp = requests.post(target_url, data=data, files=files, timeout=60)

        # Fallback if 404: maybe the service is mounted at /redactar instead of /api/redactar
        if resp.status_code == 404 and "/api/redactar" in target_url:
            alt_url = target_url.replace("/api/redactar", "/redactar")
            logger.info("404 received on %s, trying alternative endpoint %s", target_url, alt_url)
            alt_resp = requests.post(alt_url, data=data, files=files, timeout=60)
            if alt_resp.status_code != 404:
                resp = alt_resp

        try:
            return jsonify(resp.json()), resp.status_code
        except Exception:
            return resp.text, resp.status_code, {"Content-Type": resp.headers.get("Content-Type", "text/plain")}
    except requests.exceptions.RequestException as e:
        logger.error("Error connecting to redactor service at %s: %s", target_url, e)
        return (
            jsonify(
                {
                    "error": f"No se pudo conectar con el servicio de redacción ({target_url}): {str(e)}",
                }
            ),
            502,
        )

