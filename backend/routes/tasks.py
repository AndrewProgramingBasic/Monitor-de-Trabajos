import logging
from datetime import datetime
from typing import Any
import pytz
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from config import Config
from database import get_db_cursor
from services.excel_parser import (
    check_rescheduled,
    clean_cdc_number,
    normalize_spanish_datetime,
)

logger = logging.getLogger("vpti.routes.tasks")

tasks_bp = Blueprint("tasks", __name__)


def serialize_task_record(row: dict[str, Any]) -> dict[str, Any]:
    """Serializes datetime objects in a task dictionary to ISO strings."""
    res = dict(row)
    for key in (
        "start_datetime",
        "end_datetime",
        "affectation_start",
        "affectation_end",
        "alert_sent_at",
        "created_at",
        "updated_at",
        "sheet_uploaded_at",
    ):
        if res.get(key) and hasattr(res[key], "isoformat"):
            res[key] = res[key].isoformat()
    return res


@tasks_bp.route("/api/tasks", methods=["GET"])
@jwt_required()
def list_tasks():
    """
    Retrieves tasks from view 'v_scheduled_tasks' with multi-criteria filtering:
      - scope (str: 'latest' [default] or 'all')
      - sheet_id (int: filters by specific committee sheet)
      - status (str: PROGRAMADO, PROXIMO (MENOS DE 1 HORA), EN EJECUCION, TERMINADO)
      - is_rescheduled (bool)
      - has_affectation (str: 'SI'/'NO')
      - search (str: ILIKE in title or cdc_number)
      - start_date (ISO str): start_datetime >= start_date
      - end_date (ISO str): start_datetime <= end_date
    Ordered by start_datetime ASC, sheet_item_order ASC.
    """
    sheet_id = request.args.get("sheet_id", type=int)
    scope = (request.args.get("scope", "latest") or "latest").strip().lower()
    status = request.args.get("status", type=str)
    is_rescheduled_raw = request.args.get("is_rescheduled", type=str)
    has_affectation = request.args.get("has_affectation", type=str)
    search = request.args.get("search", type=str)
    start_date = request.args.get("start_date", type=str)
    end_date = request.args.get("end_date", type=str)

    clauses = ["1=1"]
    params = []

    if sheet_id is not None:
        clauses.append("sheet_id = %s")
        params.append(sheet_id)
    elif scope == "latest":
        # Strict scope for the main dashboard: filter tasks by latest committee sheet
        clauses.append(
            "(sheet_id = (SELECT MAX(id) FROM committee_sheets) OR (SELECT COUNT(*) FROM committee_sheets) = 0)"
        )
    # If scope == "all", no sheet_id restriction is applied unless explicitly specified

    if status and status.lower() != "all":
        if status.strip().upper().startswith("PROXIMO"):
            clauses.append("UPPER(execution_status) LIKE 'PROXIMO%'")
        else:
            clauses.append("UPPER(execution_status) = UPPER(%s)")
            params.append(status.strip())

    if is_rescheduled_raw is not None:
        val = is_rescheduled_raw.lower() in ("true", "1", "t", "yes", "si")
        clauses.append("is_rescheduled = %s")
        params.append(val)

    if has_affectation and has_affectation.lower() != "all":
        clauses.append("UPPER(has_affectation) = UPPER(%s)")
        params.append(has_affectation.strip())

    if search:
        clauses.append("(title ILIKE %s OR cdc_number ILIKE %s)")
        params.extend([f"%{search.strip()}%", f"%{search.strip()}%"])

    if start_date:
        parsed_start = normalize_spanish_datetime(start_date)
        if parsed_start:
            clauses.append("start_datetime >= %s")
            params.append(parsed_start)

    if end_date:
        parsed_end = normalize_spanish_datetime(end_date)
        if parsed_end:
            clauses.append("start_datetime <= %s")
            params.append(parsed_end)

    where_sql = " AND ".join(clauses)
    query = f"""
        SELECT *
        FROM v_scheduled_tasks
        WHERE {where_sql}
        ORDER BY start_datetime ASC, sheet_item_order ASC;
    """

    with get_db_cursor(commit=False) as cur:
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

    tasks = [serialize_task_record(row) for row in rows]
    return jsonify(tasks), 200


@tasks_bp.route("/api/tasks", methods=["POST"])
@jwt_required()
def create_manual_task():
    """
    Manually creates a new scheduled task.
    Runs CDC duplication / rescheduling check and links to parent task if exists.
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido."}), 400

    title = str(data.get("title", "")).strip()
    if not title:
        return jsonify({"error": "El campo 'title' es obligatorio."}), 400

    raw_start = data.get("start_datetime")
    raw_end = data.get("end_datetime")
    if not raw_start or not raw_end:
        return (
            jsonify(
                {
                    "error": "Los campos 'start_datetime' y 'end_datetime' son obligatorios."
                }
            ),
            400,
        )

    try:
        start_datetime = normalize_spanish_datetime(
            raw_start, is_mandatory=True, field_name="start_datetime"
        )
        end_datetime = normalize_spanish_datetime(
            raw_end, is_mandatory=True, field_name="end_datetime"
        )
    except ValueError as val_err:
        return jsonify({"error": str(val_err)}), 400

    if end_datetime < start_datetime:
        return (
            jsonify(
                {"error": "La fecha fin no puede ser anterior a la fecha inicio."}
            ),
            400,
        )

    cdc_number = clean_cdc_number(data.get("cdc_number"))
    justification = (
        str(data.get("justification", "")).strip()
        if data.get("justification")
        else None
    )

    # Affectation
    has_aff_raw = str(data.get("has_affectation", "NO")).strip().upper()
    has_affectation = (
        "SI" if has_aff_raw in ("SI", "S", "YES", "TRUE", "1") else "NO"
    )

    affectation_start = normalize_spanish_datetime(
        data.get("affectation_start"), is_mandatory=False
    )
    affectation_end = normalize_spanish_datetime(
        data.get("affectation_end"), is_mandatory=False
    )
    affectation_details = (
        str(data.get("affectation_details", "")).strip()
        if data.get("affectation_details")
        else None
    )

    vpti_comm_appr = (
        str(data.get("vpti_committee_approval", "")).strip()
        if data.get("vpti_committee_approval")
        else None
    )
    mgr_appr = (
        str(data.get("managers_approval", "")).strip()
        if data.get("managers_approval")
        else None
    )

    with get_db_cursor(commit=True) as cur:
        # Check rescheduling
        is_resched, parent_id = check_rescheduled(cur, cdc_number, {})

        # Compute next sheet_item_order
        cur.execute("SELECT COALESCE(MAX(sheet_item_order), 0) + 1 AS next_order FROM scheduled_tasks;")
        order_res = cur.fetchone()
        if isinstance(order_res, dict):
            next_order = order_res.get("next_order", order_res.get("coalesce", 1))
        elif isinstance(order_res, (list, tuple)):
            next_order = order_res[0]
        else:
            next_order = 1

        target_sheet_id = data.get("sheet_id")
        if target_sheet_id is None:
            cur.execute("SELECT MAX(id) AS max_id FROM committee_sheets;")
            sheet_row = cur.fetchone()
            if isinstance(sheet_row, dict) and sheet_row.get("max_id"):
                target_sheet_id = sheet_row["max_id"]
            elif isinstance(sheet_row, (list, tuple)) and sheet_row and sheet_row[0]:
                target_sheet_id = sheet_row[0]

        insert_query = """
            INSERT INTO scheduled_tasks (
                sheet_id, sheet_item_order, title, cdc_number, justification,
                start_datetime, end_datetime, has_affectation,
                affectation_start, affectation_end, affectation_details,
                vpti_committee_approval, managers_approval,
                is_rescheduled, parent_task_id, created_by
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                %s, %s, %s
            ) RETURNING id;
        """
        cur.execute(
            insert_query,
            (
                target_sheet_id,
                next_order,
                title,
                cdc_number,
                justification,
                start_datetime,
                end_datetime,
                has_affectation,
                affectation_start,
                affectation_end,
                affectation_details,
                vpti_comm_appr,
                mgr_appr,
                is_resched,
                parent_id,
                int(user_id),
            ),
        )
        new_task_id = cur.fetchone()["id"]

        # Fetch created task from view
        cur.execute(
            "SELECT * FROM v_scheduled_tasks WHERE id = %s;", (new_task_id,)
        )
        task_record = cur.fetchone()

    return jsonify(serialize_task_record(task_record)), 201


@tasks_bp.route("/api/tasks/<int:task_id>", methods=["PATCH"])
@jwt_required()
def patch_task(task_id: int):
    """
    Modifies scheduled task dates.
    Strict update scope: Accepts ONLY 'start_datetime' and/or 'end_datetime'.
    If 'start_datetime' is modified, resets 'alert_1h_sent' to FALSE and 'alert_sent_at' to NULL.
    """
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Cuerpo de solicitud JSON requerido."}), 400

    # Strict scope validation: reject payload if unknown fields are present
    allowed_keys = {"start_datetime", "end_datetime"}
    forbidden_keys = set(data.keys()) - allowed_keys
    if forbidden_keys:
        return (
            jsonify(
                {
                    "error": f"Modificación restringida: Solo se permite actualizar {list(allowed_keys)}. Campos rechazados: {list(forbidden_keys)}"
                }
            ),
            400,
        )

    if not any(k in data for k in allowed_keys):
        return (
            jsonify(
                {
                    "error": "Debe proporcionar al menos 'start_datetime' o 'end_datetime' para actualizar."
                }
            ),
            400,
        )

    # Retrieve existing task
    with get_db_cursor(commit=False) as cur:
        cur.execute(
            "SELECT id, start_datetime, end_datetime FROM scheduled_tasks WHERE id = %s;",
            (task_id,),
        )
        existing = cur.fetchone()

    if not existing:
        return jsonify({"error": f"Tarea con ID {task_id} no encontrada."}), 404

    update_fields = []
    params = []

    new_start = existing["start_datetime"]
    new_end = existing["end_datetime"]
    start_changed = False

    if "start_datetime" in data:
        try:
            new_start = normalize_spanish_datetime(
                data["start_datetime"],
                is_mandatory=True,
                field_name="start_datetime",
            )
        except ValueError as val_err:
            return jsonify({"error": str(val_err)}), 400

        update_fields.append("start_datetime = %s")
        params.append(new_start)
        start_changed = True

    if "end_datetime" in data:
        try:
            new_end = normalize_spanish_datetime(
                data["end_datetime"],
                is_mandatory=True,
                field_name="end_datetime",
            )
        except ValueError as val_err:
            return jsonify({"error": str(val_err)}), 400

        update_fields.append("end_datetime = %s")
        params.append(new_end)

    tz = pytz.timezone(Config.TIMEZONE)
    if new_start and getattr(new_start, "tzinfo", None) is None:
        new_start = tz.localize(new_start)
    if new_end and getattr(new_end, "tzinfo", None) is None:
        new_end = tz.localize(new_end)

    if new_start and new_end and new_end < new_start:
        return (
            jsonify(
                {"error": "La fecha fin no puede ser anterior a la fecha inicio."}
            ),
            400,
        )

    # If start_datetime changed, reset alert 1h flag
    if start_changed:
        update_fields.append("alert_1h_sent = FALSE")
        update_fields.append("alert_sent_at = NULL")

    update_fields.append("updated_by = %s")
    params.append(int(user_id))

    update_fields.append("updated_at = NOW()")

    params.append(task_id)

    set_clause = ", ".join(update_fields)
    update_sql = f"""
        UPDATE scheduled_tasks
        SET {set_clause}
        WHERE id = %s;
    """

    with get_db_cursor(commit=True) as cur:
        cur.execute(update_sql, tuple(params))
        cur.execute(
            "SELECT * FROM v_scheduled_tasks WHERE id = %s;", (task_id,)
        )
        updated_record = cur.fetchone()

    logger.info(
        "Task #%d schedule updated by user #%s (start_changed=%s)",
        task_id,
        user_id,
        start_changed,
    )
    return jsonify(serialize_task_record(updated_record)), 200
