import hashlib
import io
import logging
import re
from datetime import datetime
from pathlib import Path
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from database import get_db_connection, get_db_cursor
from services.excel_parser import parse_committee_sheet

logger = logging.getLogger("vpti.routes.upload")

upload_bp = Blueprint("upload", __name__)

ALLOWED_EXTENSIONS = {"xlsx", "xls", "xlsm"}


@upload_bp.route("/api/committee-sheets", methods=["GET"])
@upload_bp.route("/api/sheets", methods=["GET"])
@jwt_required()
def list_committee_sheets():
    """
    Retrieves all processed committee sheets ordered by id DESC.
    Includes total tasks count and whether it's the latest sheet.
    """
    query = """
        SELECT 
            cs.id,
            cs.committee_name,
            cs.filename,
            cs.uploaded_at,
            cs.uploaded_by,
            u.full_name AS uploaded_by_name,
            COUNT(st.id) AS total_tasks,
            (cs.id = (SELECT MAX(id) FROM committee_sheets)) AS is_latest
        FROM committee_sheets cs
        LEFT JOIN users u ON cs.uploaded_by = u.id
        LEFT JOIN scheduled_tasks st ON cs.id = st.sheet_id
        GROUP BY cs.id, cs.committee_name, cs.filename, cs.uploaded_at, cs.uploaded_by, u.full_name
        ORDER BY cs.id DESC;
    """
    with get_db_cursor(commit=False) as cur:
        cur.execute(query)
        rows = cur.fetchall()

    sheets = []
    for r in rows:
        item = dict(r)
        if item.get("uploaded_at") and hasattr(item["uploaded_at"], "isoformat"):
            item["uploaded_at"] = item["uploaded_at"].isoformat()
        sheets.append(item)

    return jsonify(sheets), 200


@upload_bp.route("/api/committee-sheets/latest", methods=["GET"])
@upload_bp.route("/api/sheets/latest", methods=["GET"])
@jwt_required()
def get_latest_committee_sheet():
    """
    Retrieves the most recently uploaded committee sheet metadata.
    """
    query = """
        SELECT 
            cs.id,
            cs.committee_name,
            cs.filename,
            cs.uploaded_at,
            cs.uploaded_by,
            u.full_name AS uploaded_by_name,
            COUNT(st.id) AS total_tasks,
            TRUE AS is_latest
        FROM committee_sheets cs
        LEFT JOIN users u ON cs.uploaded_by = u.id
        LEFT JOIN scheduled_tasks st ON cs.id = st.sheet_id
        WHERE cs.id = (SELECT MAX(id) FROM committee_sheets)
        GROUP BY cs.id, cs.committee_name, cs.filename, cs.uploaded_at, cs.uploaded_by, u.full_name;
    """
    with get_db_cursor(commit=False) as cur:
        cur.execute(query)
        row = cur.fetchone()

    if not row:
        return jsonify(None), 200

    item = dict(row)
    if item.get("uploaded_at") and hasattr(item["uploaded_at"], "isoformat"):
        item["uploaded_at"] = item["uploaded_at"].isoformat()
    return jsonify(item), 200


def is_allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@upload_bp.route("/api/tasks/upload", methods=["POST"])
@jwt_required()
def upload_committee_sheet():
    """
    Ingests an Excel committee spreadsheet.
    1. Computes SHA-256 hash of the binary file to prevent duplicate uploads.
    2. If duplicate is found, returns HTTP 409 Conflict.
    3. If unique, saves the file in backend/uploads/ and parses/inserts records.
    """
    user_id = get_jwt_identity()

    if "file" not in request.files:
        return jsonify({"error": "No se incluyó el archivo en la solicitud ('file')."}), 400

    file = request.files["file"]
    if not file or file.filename == "":
        return jsonify({"error": "Archivo no seleccionado o nombre vacío."}), 400

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
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        # Check for duplicate matrix using SHA-256 hash
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, committee_name, filename, uploaded_at 
                    FROM committee_sheets 
                    WHERE file_hash = %s 
                    LIMIT 1;
                    """,
                    (file_hash,),
                )
                existing = cur.fetchone()

        if existing:
            if isinstance(existing, dict):
                existing_id = existing.get("id")
                uploaded_at_val = existing.get("uploaded_at")
            elif isinstance(existing, (list, tuple)):
                existing_id = existing[0]
                uploaded_at_val = existing[3] if len(existing) > 3 else None
            else:
                existing_id = None
                uploaded_at_val = None

            uploaded_at_str = (
                uploaded_at_val.isoformat()
                if hasattr(uploaded_at_val, "isoformat")
                else str(uploaded_at_val or "")
            )

            logger.warning(
                "Duplicate file '%s' rejected (SHA-256: %s). Existing sheet ID: %s",
                file.filename,
                file_hash,
                existing_id,
            )
            return (
                jsonify(
                    {
                        "error": "Este archivo ya ha sido cargado anteriormente.",
                        "detail": "La matriz de comité coincide con una hoja registrada previamente en el sistema.",
                        "existing_sheet_id": existing_id,
                        "uploaded_at": uploaded_at_str,
                    }
                ),
                409,
            )

        # Store the uploaded file in persistent backend/uploads/ directory
        upload_dir = Path(__file__).resolve().parent.parent / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        clean_name = re.sub(r"[^\w\.-]", "_", file.filename)
        saved_filename = f"{ts}_{clean_name}"
        saved_path = upload_dir / saved_filename
        with open(saved_path, "wb") as f_out:
            f_out.write(file_bytes)

        file_stream = io.BytesIO(file_bytes)
        result = parse_committee_sheet(
            file_stream=file_stream,
            filename=file.filename,
            uploaded_by_user_id=int(user_id),
            file_hash=file_hash,
        )
        return jsonify(result), 201
    except ValueError as val_err:
        logger.warning("Validation error processing Excel file '%s': %s", file.filename, val_err)
        return jsonify({"error": str(val_err)}), 400
    except Exception as exc:
        logger.error("Unexpected error processing Excel file '%s': %s", file.filename, exc)
        return (
            jsonify(
                {
                    "error": f"Error inesperado al procesar el archivo Excel: {str(exc)}"
                }
            ),
            500,
        )
