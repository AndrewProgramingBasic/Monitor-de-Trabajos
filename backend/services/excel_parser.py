import io
import logging
import re
import unicodedata
from datetime import datetime, date, time
from pathlib import Path
from typing import Any
import openpyxl
import pytz
from config import Config
from database import get_db_connection

logger = logging.getLogger("vpti.excel_parser")


def strip_accents(text: Any) -> str:
    """Removes diacritics and accents from a string."""
    if text is None:
        return ""
    return (
        unicodedata.normalize("NFKD", str(text))
        .encode("ASCII", "ignore")
        .decode("utf-8")
    )


def normalize_header(text: Any) -> str:
    """
    Normalizes a table header name before mapping:
      1. Converts to lowercase
      2. Strips leading and trailing whitespace
      3. Replaces line breaks (\n, \r) with spaces
      4. Removes accents / diacritics
      5. Collapses multiple consecutive spaces into one single space
    """
    if text is None:
        return ""
    s = str(text).lower().strip()
    s = re.sub(r"[\r\n]+", " ", s)
    s = strip_accents(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def map_headers(headers_by_col: dict[int, str]) -> dict[str, int]:
    """
    Maps column indices (1-indexed) to canonical task field names using fuzzy/regex matching.
    Each column can only be mapped to a single field; more specific patterns are mapped first.

    Supported canonical field mappings:
      - title: matches 'titul', 'trabajo', 'descripcion'
      - cdc: matches 'cdc'
      - start_datetime: matches 'inicio', 'fecha.*inicio', 'f.*inicio'
      - end_datetime: matches 'fin', 'fecha.*fin', 'f.*fin'
      - justification: matches 'justificaci', 'motivo'
      - has_affectation: matches 'afectaci'
      - affectation_start: matches 'afectaci.*inicio', 'inicio.*afectaci'
      - affectation_end: matches 'afectaci.*fin', 'fin.*afectaci'
      - affectation_details: matches 'detalle.*afectaci', 'plataforma'
      - vpti_committee_approval: matches 'comite.*vpti', 'aprobado.*comite'
      - managers_approval: matches 'gerente', 'aprobaci.*gerente'
      - sheet_item_order: matches 'n°', 'no', 'item', 'numero', 'n'
    """
    mapping: dict[str, int] = {}

    def find_col(pattern: str, exclude_pattern: str | None = None) -> int | None:
        for col_idx, h in headers_by_col.items():
            if col_idx in mapping.values():
                continue
            if exclude_pattern and re.search(exclude_pattern, h):
                continue
            if re.search(pattern, h):
                return col_idx
        return None

    # 1. Affectation sub-columns first (since they contain 'afectaci', 'inicio', 'fin', 'detalle')
    col_aff_details = find_col(r"detalle.*afectaci|detalles.*afectaci|plataforma.*afectada|plataforma")
    if col_aff_details:
        mapping["affectation_details"] = col_aff_details

    col_aff_start = find_col(r"afectaci.*inicio|inicio.*afectaci|fecha.*inicio.*afectaci")
    if col_aff_start:
        mapping["affectation_start"] = col_aff_start

    col_aff_end = find_col(r"afectaci.*fin|fin.*afectaci|fecha.*fin.*afectaci")
    if col_aff_end:
        mapping["affectation_end"] = col_aff_end

    # 2. Main affectation flag (matches 'afectaci', excluding the sub-columns already mapped)
    col_aff = find_col(r"afectaci")
    if col_aff:
        mapping["has_affectation"] = col_aff

    # 3. Start Datetime: matches 'inicio', 'fecha.*inicio', 'f.*inicio' (excluding affectation)
    col_start = find_col(r"fecha.*inicio|f\.?\s*inicio|\binicio\b", exclude_pattern=r"afectaci")
    if col_start:
        mapping["start_datetime"] = col_start

    # 4. End Datetime: matches 'fin', 'fecha.*fin', 'f.*fin' (excluding affectation)
    col_end = find_col(r"fecha.*fin|f\.?\s*fin|\bfin\b", exclude_pattern=r"afectaci")
    if col_end:
        mapping["end_datetime"] = col_end

    # 5. Justification: matches 'justificaci', 'motivo'
    col_just = find_col(r"justificaci|motivo")
    if col_just:
        mapping["justification"] = col_just

    # 6. Title / Título: matches 'titul', 'trabajo', 'descripcion'
    col_title = find_col(r"titul|descripcion|actividad", exclude_pattern=r"fecha|inicio|fin")
    if not col_title:
        col_title = find_col(r"trabajo", exclude_pattern=r"fecha|inicio|fin|justificaci|motivo")
    if col_title:
        mapping["title"] = col_title

    # 7. CDC: matches 'cdc'
    col_cdc = find_col(r"\bcdc\b|cdc")
    if col_cdc:
        mapping["cdc"] = col_cdc

    # 8. VPTI Approval: matches 'comite.*vpti', 'aprobado.*comite'
    col_vpti = find_col(r"comite.*vpti|aprobado.*comite|\bcomite\b", exclude_pattern=r"gerente")
    if col_vpti:
        mapping["vpti_committee_approval"] = col_vpti

    # 9. Managers Approval: matches 'gerente', 'aprobaci.*gerente'
    col_mgr = find_col(r"gerente|aprobaci.*gerente|gerencia")
    if col_mgr:
        mapping["managers_approval"] = col_mgr

    # 10. Sheet item order (N°, No, Item, Numero)
    col_order = find_col(r"^(?:n[o°\.]?|item|numero)$|^n$")
    if col_order:
        mapping["sheet_item_order"] = col_order

    return mapping


def find_header_row(ws) -> tuple[int, dict[int, str], dict[str, int]]:
    """
    Scans rows 1 through 10 to dynamically locate the table header row by searching
    for key words (e.g. variations of 'Título'/'Titulo' and 'CDC' or 'Trabajo').
    Scores each candidate row based on recognized columns.

    Returns:
      (header_row_idx, headers_by_col, column_mapping)
    """
    max_scan = min(10, ws.max_row)
    candidates: list[tuple[int, int, dict[int, str], dict[str, int]]] = []

    for r in range(1, max_scan + 1):
        headers_by_col: dict[int, str] = {}
        for col_idx, cell in enumerate(ws[r], start=1):
            if cell.value is not None:
                norm = normalize_header(cell.value)
                if norm:
                    headers_by_col[col_idx] = norm

        if not headers_by_col:
            continue

        all_text = " ".join(headers_by_col.values())
        mapping = map_headers(headers_by_col)

        # Keyword presence check
        has_title_kw = bool(re.search(r"titul|descripcion", all_text)) or (
            bool(re.search(r"trabajo", all_text)) and not bool(re.search(r"^comite", all_text))
        )
        has_cdc_or_dates = bool(re.search(r"cdc|inicio|fin", all_text)) or (
            {"cdc", "start_datetime"} & set(mapping.keys())
        )

        score = len(mapping)
        if "title" in mapping:
            score += 5
        if "start_datetime" in mapping:
            score += 5
        if "end_datetime" in mapping:
            score += 5
        if "cdc" in mapping:
            score += 3

        if (has_title_kw and has_cdc_or_dates) or (
            "title" in mapping and ("start_datetime" in mapping or "end_datetime" in mapping)
        ):
            candidates.append((score, r, headers_by_col, mapping))

    if not candidates:
        fallback_r = 4 if ws.max_row >= 4 else 1
        headers_by_col = {
            col_idx: normalize_header(cell.value)
            for col_idx, cell in enumerate(ws[fallback_r], start=1)
            if cell.value is not None and normalize_header(cell.value)
        }
        return fallback_r, headers_by_col, map_headers(headers_by_col)

    candidates.sort(key=lambda x: x[0], reverse=True)
    best_score, best_r, best_headers, best_mapping = candidates[0]
    return best_r, best_headers, best_mapping


def normalize_spanish_datetime(
    val: Any,
    tz_name: str = Config.TIMEZONE,
    is_mandatory: bool = False,
    field_name: str = "datetime",
    row_idx: int = 0,
) -> datetime | None:
    """
    Normalizes a datetime from raw Excel values or Spanish strings into a timezone-aware
    datetime in the specified timezone (default America/Caracas).

    Handles:
      - Native Python datetime/Timestamp objects (with or without tzinfo)
      - Date objects (set to 00:00:00)
      - Excel serial numbers (numeric values > 30000)
      - Formatted Spanish strings:
          * 'Lunes 28/9/2026 15:20'
          * 'Viernes 2/10/2026 3:10'
          * 'Miércoles 30/09/2026 00:50'
          * 'Miercoles 30/9/2026 16.10 '
          * 'Viernes 02/10/2025 00:55'
          * '28/09/2026 15:20:00'
          * '2026-09-28 15:20:00'
    """
    if val is None:
        if is_mandatory:
            raise ValueError(
                f"Fila {row_idx}: El campo obligatorio '{field_name}' no puede estar vacío."
            )
        return None

    tz = pytz.timezone(tz_name)

    # Check for Excel numeric serial date (e.g. 45563.6388)
    if isinstance(val, (int, float)) and not isinstance(val, bool) and val > 30000:
        try:
            from openpyxl.utils.datetime import from_excel
            val = from_excel(val)
        except Exception:
            pass

    # 1. Native datetime / Timestamp
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return tz.localize(val)
        return val.astimezone(tz)

    # 2. Date object without time
    if isinstance(val, date) and not isinstance(val, datetime):
        naive_dt = datetime.combine(val, time.min)
        return tz.localize(naive_dt)

    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("none", "null", "nan", "n/a", "-"):
        if is_mandatory:
            raise ValueError(
                f"Fila {row_idx}: El campo obligatorio '{field_name}' no puede estar vacío."
            )
        return None

    clean_text = strip_accents(val_str)

    # Strip Spanish day names (full and abbreviated)
    clean_text = re.sub(
        r"(?i)\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mar|mie|mier|jue|vie|sab|dom)\b\.?",
        " ",
        clean_text,
    )

    # Fix dots into colons for times (e.g. 16.10 -> 16:10)
    clean_text = re.sub(r"(\b\d{1,2})\.(\d{2})(?!\.\d)", r"\1:\2", clean_text)

    # Collapse whitespace
    clean_text = re.sub(r"\s+", " ", clean_text).strip()

    # Date component regex (DD/MM/YYYY or DD-MM-YYYY)
    date_match = re.search(
        r"(?P<day>\d{1,2})[/-](?P<month>\d{1,2})[/-](?P<year>\d{4})", clean_text
    )

    # Time component regex (HH:MM or HH:MM:SS)
    time_match = re.search(
        r"(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?", clean_text
    )

    # Alternative ISO date format (YYYY-MM-DD)
    if not date_match:
        iso_match = re.search(
            r"(?P<year>\d{4})[/-](?P<month>\d{1,2})[/-](?P<day>\d{1,2})",
            clean_text,
        )
        if iso_match:
            date_match = iso_match

    if not date_match:
        if is_mandatory:
            raise ValueError(
                f"Fila {row_idx}: Formato de fecha y hora inválido en '{field_name}': '{val_str}'"
            )
        return None

    try:
        year = int(date_match.group("year"))
        month = int(date_match.group("month"))
        day = int(date_match.group("day"))
        hour = int(time_match.group("hour")) if time_match else 0
        minute = int(time_match.group("minute")) if time_match else 0
        second = (
            int(time_match.group("second"))
            if (time_match and time_match.group("second"))
            else 0
        )

        naive_dt = datetime(year, month, day, hour, minute, second)
        return tz.localize(naive_dt)
    except Exception as exc:
        if is_mandatory:
            raise ValueError(
                f"Fila {row_idx}: Error construyendo fecha '{field_name}' ('{val_str}'): {exc}"
            )
        return None


def clean_cdc_number(val: Any) -> str | None:
    """Cleans CDC string, converts floats/ints, and returns trimmed string or None."""
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("none", "null", "nan", "-"):
        return None
    # If openpyxl gave a float like 3900092507.0
    if val_str.endswith(".0") and val_str[:-2].isdigit():
        return val_str[:-2]
    return val_str


def check_rescheduled(
    cursor,
    cdc_number: str | None,
    current_batch_cdcs: dict[str, int],
    exclude_task_id: int | None = None,
) -> tuple[bool, int | None]:
    """
    Checks if a task is rescheduled:
    - CDC string contains 'R/P' (case-insensitive) OR
    - Clean CDC value already exists in table scheduled_tasks or earlier in the current batch.
    Ignores NULL, empty, or 'S/N' CDC numbers.
    Returns (is_rescheduled, parent_task_id).
    """
    if not cdc_number:
        return False, None

    cdc_clean = str(cdc_number).strip()
    if not cdc_clean or cdc_clean.upper() in (
        "S/N",
        "SN",
        "SIN NUMERO",
        "SIN NÚMERO",
        "N/A",
        "NA",
        "-",
        "NONE",
        "NULL",
    ):
        return False, None

    has_rp = "r/p" in cdc_clean.lower()
    base_cdc = re.sub(r"(?i)R\s*/\s*P\s*", "", cdc_clean).strip()

    if not base_cdc or base_cdc.upper() in (
        "S/N",
        "SN",
        "SIN NUMERO",
        "SIN NÚMERO",
        "N/A",
        "NA",
        "-",
        "NONE",
        "NULL",
    ):
        return (True, None) if has_rp else (False, None)

    # 1. Check if seen earlier in current ingestion batch
    if base_cdc in current_batch_cdcs:
        return True, current_batch_cdcs[base_cdc]
    if cdc_clean in current_batch_cdcs:
        return True, current_batch_cdcs[cdc_clean]

    # 2. Check in database for existing records (if cursor is available)
    if cursor is not None:
        try:
            if exclude_task_id:
                query = """
                    SELECT id FROM scheduled_tasks 
                    WHERE (cdc_number = %s 
                       OR cdc_number ILIKE %s
                       OR cdc_number = %s)
                      AND id != %s
                    ORDER BY created_at ASC, id ASC 
                    LIMIT 1;
                """
                cursor.execute(
                    query, (base_cdc, f"%{base_cdc}%", cdc_clean, exclude_task_id)
                )
            else:
                query = """
                    SELECT id FROM scheduled_tasks 
                    WHERE cdc_number = %s 
                       OR cdc_number ILIKE %s
                       OR cdc_number = %s
                    ORDER BY created_at ASC, id ASC 
                    LIMIT 1;
                """
                cursor.execute(query, (base_cdc, f"%{base_cdc}%", cdc_clean))

            match = cursor.fetchone()
            if match:
                parent_id = match["id"] if isinstance(match, dict) else match[0]
                return True, parent_id
        except Exception as exc:
            logger.warning("Could not query scheduled_tasks for rescheduling: %s", exc)

    # If it contains R/P but no previous record exists in DB yet
    if has_rp:
        return True, None

    return False, None


def parse_committee_sheet(
    file_stream: io.BytesIO | str | Path,
    filename: str = "",
    uploaded_by_user_id: int = 1,
    dry_run: bool = False,
    db_connection=None,
    file_hash: str | None = None,
) -> dict:
    """
    Parses a committee Excel file (.xlsx, .xls, .xlsm), extracts metadata and tasks.
    Dynamically detects the header row across rows 1-10 and maps columns flexibly.
    Normalizes Spanish datetimes and tolerates typos and edge cases.

    When dry_run=False:
      Inserts all rows within a single transactional database session.
    When dry_run=True:
      Parses and returns extracted tasks without writing to the database.
    """
    try:
        if isinstance(file_stream, (str, Path)):
            file_path = Path(file_stream)
            if not filename:
                filename = file_path.name
            wb = openpyxl.load_workbook(str(file_path), data_only=True)
        else:
            wb = openpyxl.load_workbook(file_stream, data_only=True)
    except Exception as exc:
        raise ValueError(f"No se pudo abrir el archivo Excel: {exc}")

    # 1. Select sheet: prefer sheet name containing 'comite' or 'vpti', else first sheet
    sheet_name = None
    for s in wb.sheetnames:
        s_clean = strip_accents(s).lower()
        if "comite" in s_clean or "vpti" in s_clean:
            sheet_name = s
            break
    if not sheet_name:
        sheet_name = wb.sheetnames[0]

    ws = wb[sheet_name]
    logger.info("Parsing sheet '%s' from file '%s'", sheet_name, filename)

    # 2. Locate header row dynamically (rows 1-10) and map columns
    header_row_idx, headers_by_col, mapping = find_header_row(ws)
    logger.info("Detected header row %d with column mapping: %s", header_row_idx, mapping)

    col_title = mapping.get("title")
    col_start = mapping.get("start_datetime")
    col_end = mapping.get("end_datetime")

    if not col_title:
        raise ValueError(
            f"No se encontró la columna de Título/Descripción en el encabezado (fila {header_row_idx})."
        )
    if not col_start or not col_end:
        raise ValueError(
            f"No se encontraron las columnas de Fecha Inicio y/o Fecha Fin en la fila de encabezado {header_row_idx}."
        )

    # 3. Search rows 1 to min(header_row_idx - 1, 5) for Committee Title
    committee_name = None
    for row_idx in range(1, min(header_row_idx, 6)):
        for cell in ws[row_idx]:
            val = cell.value
            if val and isinstance(val, str) and "comit" in strip_accents(val).lower():
                committee_name = re.sub(r"\s+", " ", val).strip()
                break
        if committee_name:
            break

    if not committee_name:
        tz = pytz.timezone(Config.TIMEZONE)
        now_str = datetime.now(tz).strftime("%d/%m/%Y")
        committee_name = f"COMITÉ INTERNO VPTI {now_str}"

    # 4. Process data rows
    tasks_to_insert: list[dict] = []
    current_batch_cdcs: dict[str, int] = {}
    rescheduled_count = 0
    start_data_row = header_row_idx + 1

    for row_num in range(start_data_row, ws.max_row + 1):
        def cell_val(field_name: str) -> Any:
            col_idx = mapping.get(field_name)
            if not col_idx or col_idx > ws.max_column:
                return None
            return ws.cell(row=row_num, column=col_idx).value

        raw_title = cell_val("title")
        raw_cdc = cell_val("cdc")
        raw_start = cell_val("start_datetime")
        raw_end = cell_val("end_datetime")

        # Skip rows that have neither title nor CDC
        if not raw_title and not raw_cdc:
            continue

        title = str(raw_title).strip() if raw_title is not None else ""
        cdc_number = clean_cdc_number(raw_cdc)

        # Skip summary rows (e.g. 'total', 'resumen', 'cantidad de trabajos')
        title_lower = strip_accents(title).lower()
        if (
            any(kw in title_lower for kw in ["total", "resumen", "cantidad de trabajos"])
            and not cdc_number
        ):
            continue

        # Skip rows that lack both start and end datetimes (e.g. section dividers)
        if not raw_start and not raw_end:
            continue

        if not title:
            raise ValueError(f"Fila {row_num}: El título del trabajo es obligatorio.")

        # Normalize mandatory datetimes
        start_datetime = normalize_spanish_datetime(
            raw_start,
            tz_name=Config.TIMEZONE,
            is_mandatory=True,
            field_name="Fecha y Hora Inicio",
            row_idx=row_num,
        )
        end_datetime = normalize_spanish_datetime(
            raw_end,
            tz_name=Config.TIMEZONE,
            is_mandatory=True,
            field_name="Fecha y Hora Fin",
            row_idx=row_num,
        )

        # Year typo tolerance: if end year < start year (e.g. 2025 vs 2026 typo)
        if start_datetime and end_datetime and end_datetime.year < start_datetime.year:
            logger.warning(
                "Fila %d: Año de fin (%d) es menor que año de inicio (%d). Corrigiendo año a %d.",
                row_num,
                end_datetime.year,
                start_datetime.year,
                start_datetime.year,
            )
            try:
                end_datetime = end_datetime.replace(year=start_datetime.year)
            except Exception:
                pass

        if start_datetime and end_datetime and end_datetime < start_datetime:
            logger.warning(
                "Fila %d: La fecha fin (%s) es anterior a la fecha inicio (%s). Se preserva la fecha ingresada.",
                row_num,
                end_datetime.isoformat(),
                start_datetime.isoformat(),
            )

        raw_just = cell_val("justification")
        justification = str(raw_just).strip() if raw_just is not None else None

        # Affectation
        raw_aff = cell_val("has_affectation")
        has_affectation = "NO"
        if raw_aff:
            aff_str = strip_accents(str(raw_aff)).strip().upper()
            if aff_str in ("SI", "S", "YES", "TRUE", "1"):
                has_affectation = "SI"

        affectation_start = normalize_spanish_datetime(
            cell_val("affectation_start"),
            tz_name=Config.TIMEZONE,
            is_mandatory=False,
            field_name="Inicio Afectación",
            row_idx=row_num,
        )
        affectation_end = normalize_spanish_datetime(
            cell_val("affectation_end"),
            tz_name=Config.TIMEZONE,
            is_mandatory=False,
            field_name="Fin Afectación",
            row_idx=row_num,
        )
        if (
            affectation_start
            and affectation_end
            and affectation_end.year < affectation_start.year
        ):
            try:
                affectation_end = affectation_end.replace(year=affectation_start.year)
            except Exception:
                pass

        raw_aff_details = cell_val("affectation_details")
        affectation_details = (
            str(raw_aff_details).strip() if raw_aff_details is not None else None
        )

        raw_comm = cell_val("vpti_committee_approval")
        vpti_comm_appr = str(raw_comm).strip() if raw_comm is not None else None

        raw_mgr = cell_val("managers_approval")
        mgr_appr = str(raw_mgr).strip() if raw_mgr is not None else None

        raw_order = cell_val("sheet_item_order")
        sheet_order = len(tasks_to_insert) + 1
        if raw_order is not None:
            try:
                sheet_order = int(float(str(raw_order).strip()))
            except Exception:
                sheet_order = len(tasks_to_insert) + 1

        tasks_to_insert.append(
            {
                "row_num": row_num,
                "sheet_item_order": sheet_order,
                "title": title,
                "cdc_number": cdc_number,
                "justification": justification,
                "start_datetime": start_datetime,
                "end_datetime": end_datetime,
                "has_affectation": has_affectation,
                "affectation_start": affectation_start,
                "affectation_end": affectation_end,
                "affectation_details": affectation_details,
                "vpti_committee_approval": vpti_comm_appr,
                "managers_approval": mgr_appr,
            }
        )

    if not tasks_to_insert:
        raise ValueError("No se encontraron filas de tareas válidas para importar en la hoja.")

    # If dry_run, perform rescheduling analysis in memory and return
    if dry_run:
        for idx, task in enumerate(tasks_to_insert, start=1):
            is_resched, parent_id = check_rescheduled(
                None, task["cdc_number"], current_batch_cdcs
            )
            task["is_rescheduled"] = is_resched
            task["parent_task_id"] = parent_id
            if is_resched:
                rescheduled_count += 1
            if task["cdc_number"]:
                base = re.sub(r"(?i)R\s*/\s*P\s*", "", task["cdc_number"]).strip()
                if base not in current_batch_cdcs:
                    current_batch_cdcs[base] = parent_id if parent_id else idx
                if task["cdc_number"] not in current_batch_cdcs:
                    current_batch_cdcs[task["cdc_number"]] = (
                        parent_id if parent_id else idx
                    )

        return {
            "sheet_id": None,
            "committee_name": committee_name,
            "tasks_imported": len(tasks_to_insert),
            "rescheduled_count": rescheduled_count,
            "header_row": header_row_idx,
            "column_mapping": mapping,
            "tasks": tasks_to_insert,
        }

    # 5. Insert transactionally into PostgreSQL
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # Insert committee sheet
                cur.execute(
                    """
                    INSERT INTO committee_sheets (committee_name, filename, file_hash, uploaded_by, uploaded_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    RETURNING id;
                    """,
                    (committee_name, filename, file_hash, uploaded_by_user_id),
                )
                sheet_id = cur.fetchone()[0]

                # Insert tasks
                insert_task_sql = """
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

                for task in tasks_to_insert:
                    # Rescheduling check
                    is_resched, parent_id = check_rescheduled(
                        cur, task["cdc_number"], current_batch_cdcs
                    )
                    task["is_rescheduled"] = is_resched
                    task["parent_task_id"] = parent_id
                    if is_resched:
                        rescheduled_count += 1

                    cur.execute(
                        insert_task_sql,
                        (
                            sheet_id,
                            task["sheet_item_order"],
                            task["title"],
                            task["cdc_number"],
                            task["justification"],
                            task["start_datetime"],
                            task["end_datetime"],
                            task["has_affectation"],
                            task["affectation_start"],
                            task["affectation_end"],
                            task["affectation_details"],
                            task["vpti_committee_approval"],
                            task["managers_approval"],
                            is_resched,
                            parent_id,
                            uploaded_by_user_id,
                        ),
                    )
                    new_task_id = cur.fetchone()[0]

                    # Record in batch mapping
                    if task["cdc_number"]:
                        base = re.sub(
                            r"(?i)R\s*/\s*P\s*", "", task["cdc_number"]
                        ).strip()
                        if base not in current_batch_cdcs:
                            current_batch_cdcs[base] = (
                                parent_id if parent_id else new_task_id
                            )
                        if task["cdc_number"] not in current_batch_cdcs:
                            current_batch_cdcs[task["cdc_number"]] = (
                                parent_id if parent_id else new_task_id
                            )

            conn.commit()
            logger.info(
                "Sheet %s imported successfully with %d tasks (%d rescheduled).",
                sheet_id,
                len(tasks_to_insert),
                rescheduled_count,
            )
            return {
                "sheet_id": sheet_id,
                "committee_name": committee_name,
                "tasks_imported": len(tasks_to_insert),
                "rescheduled_count": rescheduled_count,
                "header_row": header_row_idx,
                "column_mapping": mapping,
            }
        except Exception as exc:
            conn.rollback()
            logger.error("Transaction rolled back during Excel import: %s", exc)
            raise

