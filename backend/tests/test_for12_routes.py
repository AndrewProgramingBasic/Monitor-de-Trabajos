import io
from contextlib import contextmanager
from datetime import datetime
import openpyxl
import pytest
from app import create_app
from flask_jwt_extended import create_access_token


@pytest.fixture
def client_and_token(monkeypatch, tmp_path):
    tasks_db = {
        77: {
            "id": 77,
            "cdc_number": "3900093086",
            "title": "ELIMINAR ABONADOS STATUS (DISCONNECT(S4)) EN EL FACTURADOR GSM RTB CCBATCH",
        },
        88: {
            "id": 88,
            "cdc_number": "3900093150",
            "title": "PASE A PRODUCCION DE MERCADEO EN CIFRAS",
        },
    }

    files_db = {}
    messages_db = {}

    class MockCursor:
        def __init__(self):
            self.last_query = ""
            self.last_params = ()
            self._fetch_row = None
            self._fetch_rows = []

        def execute(self, query, params=None):
            self.last_query = query
            self.last_params = params or ()
            # Normalize whitespace for matching
            q = " ".join(query.split())

            # 1. Lookup task by id
            if "FROM scheduled_tasks" in q and "WHERE id = %s" in q:
                tid = self.last_params[0]
                self._fetch_row = tasks_db.get(tid)
                return

            # 2. Lookup task by cdc_number
            if "FROM scheduled_tasks" in q and "cdc_number" in q:
                target_cdc = str(self.last_params[0])
                found = None
                for t in tasks_db.values():
                    if t.get("cdc_number") and str(t["cdc_number"]).strip() == target_cdc.strip():
                        found = t
                        break
                self._fetch_row = found
                return

            # 3. Lookup existing file hash for task
            if "FROM for12_files" in q and "file_hash = %s" in q:
                tid = self.last_params[0]
                fhash = self.last_params[1]
                found = None
                for fid, f in files_db.items():
                    if f["task_id"] == tid and f["file_hash"] == fhash:
                        found = {"id": fid, "storage_path": f["storage_path"]}
                        break
                self._fetch_row = found
                return

            # 4. Insert for12_files
            if "INSERT INTO for12_files" in q:
                new_id = len(files_db) + 1
                files_db[new_id] = {
                    "id": new_id,
                    "task_id": self.last_params[0],
                    "original_filename": self.last_params[1],
                    "storage_path": self.last_params[2],
                    "file_hash": self.last_params[3],
                    "file_size": self.last_params[4],
                    "uploaded_by": self.last_params[5],
                    "uploaded_at": datetime.now(),
                }
                self._fetch_row = {"id": new_id}
                return

            # 5. Insert / Update for12_messages
            if "INSERT INTO for12_messages" in q:
                fid = self.last_params[0]
                msg_text = self.last_params[1]
                messages_db[fid] = {
                    "id": fid,
                    "file_id": fid,
                    "message_text": msg_text,
                    "created_at": datetime.now(),
                }
                return

            # 6. Lookup from v_task_message
            if "FROM v_task_message" in q and "task_id = %s" in q:
                tid = self.last_params[0]
                found_file = None
                for f in sorted(files_db.values(), key=lambda x: x["id"], reverse=True):
                    if f["task_id"] == tid:
                        found_file = f
                        break
                if found_file and found_file["id"] in messages_db:
                    t = tasks_db.get(tid, {})
                    self._fetch_row = {
                        "task_id": tid,
                        "cdc_number": t.get("cdc_number"),
                        "title": t.get("title"),
                        "message_text": messages_db[found_file["id"]]["message_text"],
                        "original_filename": found_file["original_filename"],
                        "storage_path": found_file["storage_path"],
                        "uploaded_at": found_file["uploaded_at"],
                    }
                else:
                    self._fetch_row = None
                return

            if "FROM v_task_message" in q and "cdc_number" in q:
                target_cdc = str(self.last_params[0])
                found_tid = None
                for t in tasks_db.values():
                    if t.get("cdc_number") and str(t["cdc_number"]).strip() == target_cdc.strip():
                        found_tid = t["id"]
                        break
                if found_tid:
                    self.execute("SELECT * FROM v_task_message WHERE task_id = %s;", (found_tid,))
                else:
                    self._fetch_row = None
                return

            # 7. Lookup for download
            if "SELECT original_filename, storage_path FROM for12_files WHERE id = %s" in q:
                fid = self.last_params[0]
                f = files_db.get(fid)
                self._fetch_row = {"original_filename": f["original_filename"], "storage_path": f["storage_path"]} if f else None
                return

            if "SELECT original_filename, storage_path FROM for12_files WHERE task_id = %s" in q:
                tid = self.last_params[0]
                found_file = None
                for f in sorted(files_db.values(), key=lambda x: x["id"], reverse=True):
                    if f["task_id"] == tid:
                        found_file = f
                        break
                self._fetch_row = {"original_filename": found_file["original_filename"], "storage_path": found_file["storage_path"]} if found_file else None
                return

            self._fetch_row = None

        def fetchone(self):
            return self._fetch_row

        def fetchall(self):
            return self._fetch_rows

    @contextmanager
    def mock_db_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("database.get_db_cursor", mock_db_cursor)
    monkeypatch.setattr("routes.for12.get_db_cursor", mock_db_cursor)
    # Redirect FOR12 storage to temporary directory
    monkeypatch.setattr("routes.for12.FOR12_DIR", tmp_path)

    app = create_app()
    app.config["TESTING"] = True
    client = app.test_client()

    with app.app_context():
        token = create_access_token(identity="2")

    return client, token, tmp_path


def make_dummy_excel() -> io.BytesIO:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "FOR12"
    ws.append(["Ticket", "CDC", "Actividad"])
    ws.append(["3900093086", "3900093086", "Eliminar abonados status (Disconnect(S4))"])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_upload_for12_success_with_task_id(client_and_token):
    client, token, storage_dir = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "message": "Buenos Días\nSe da Inicio al siguiente Trabajo\nTicket *CDC# 3900093086*",
            "file": (excel_buf, "FOR12_3900093086.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201
    json_data = resp.get_json()
    assert json_data["message"] == "Archivo FOR12 y redacción registrados exitosamente."
    data = json_data["data"]
    assert data["task_id"] == 77
    assert data["cdc_number"] == "3900093086"
    assert "Buenos Días" in data["message_text"]
    assert data["original_filename"] == "FOR12_3900093086.xlsx"


def test_upload_for12_success_with_cdc_number(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/tasks/for12",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "cdc_number": "3900093086",
            "message": "Mensaje de redacción generado por API externa",
            "file": (excel_buf, "test_cdc.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201
    json_data = resp.get_json()
    assert json_data["data"]["task_id"] == 77
    assert json_data["data"]["cdc_number"] == "3900093086"


def test_upload_for12_via_url_task_id(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/tasks/88/for12",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "message": "Redacción para tarea 88",
            "file": (excel_buf, "for12_88.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 201
    json_data = resp.get_json()
    assert json_data["data"]["task_id"] == 88


def test_upload_for12_missing_task_identifier(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "message": "Sin tarea asociada",
            "file": (excel_buf, "test.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 400
    assert "task_id" in resp.get_json()["error"]


def test_upload_for12_missing_message(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "file": (excel_buf, "test.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 400
    assert "message" in resp.get_json()["error"]


def test_upload_for12_missing_file(client_and_token):
    client, token, _ = client_and_token

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "message": "Texto sin archivo adjunto",
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 400
    assert "archivo Excel" in resp.get_json()["error"]


def test_upload_for12_invalid_file_extension(client_and_token):
    client, token, _ = client_and_token
    text_buf = io.BytesIO(b"Esto es un txt, no un excel")

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "message": "Texto con txt",
            "file": (text_buf, "prueba.txt"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 400
    assert "Formato de archivo no soportado" in resp.get_json()["error"]


def test_upload_for12_task_not_found(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()

    resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "99999",
            "message": "Texto para tarea inexistente",
            "file": (excel_buf, "test.xlsx"),
        },
        content_type="multipart/form-data",
    )

    assert resp.status_code == 404
    assert "No se encontró el trabajo" in resp.get_json()["error"]


def test_get_task_message_flow(client_and_token):
    client, token, _ = client_and_token

    # 1. First query: Task 77 has no message yet -> 404 with has_message: False
    resp1 = client.get(
        "/api/tasks/77/message",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp1.status_code == 404
    assert resp1.get_json()["has_message"] is False

    # 2. Upload FOR12 for task 77
    excel_buf = make_dummy_excel()
    sample_text = "Buenos Días\nSe da Inicio al siguiente Trabajo\nTicket *CDC# 3900093086*"
    client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "message": sample_text,
            "file": (excel_buf, "FOR12_3900093086.xlsx"),
        },
        content_type="multipart/form-data",
    )

    # 3. Query message by task_id via /api/tasks/77/message
    resp2 = client.get(
        "/api/tasks/77/message",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp2.status_code == 200
    d2 = resp2.get_json()
    assert d2["has_message"] is True
    assert d2["task_id"] == 77
    assert d2["cdc_number"] == "3900093086"
    assert d2["message_text"] == sample_text

    # 4. Query message by cdc via /api/for12/message?cdc=3900093086
    resp3 = client.get(
        "/api/for12/message?cdc=3900093086",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp3.status_code == 200
    assert resp3.get_json()["message_text"] == sample_text

    # 5. Query message via /api/for12/message/3900093086
    resp4 = client.get(
        "/api/for12/message/3900093086",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp4.status_code == 200
    assert resp4.get_json()["task_id"] == 77


def test_get_task_message_nonexistent_task(client_and_token):
    client, token, _ = client_and_token
    resp = client.get(
        "/api/tasks/9999/message",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404
    assert resp.get_json()["has_message"] is False
    assert "no fue encontrado" in resp.get_json()["error"]


def test_normalize_escaped_newlines(client_and_token):
    client, token, _ = client_and_token
    excel_buf = make_dummy_excel()
    # String with literal backslash+n
    escaped_text = "Estimado cliente:\\nSe da inicio al trabajo.\\n\\nDetalles: CDC 3900093086"

    upload_resp = client.post(
        "/api/for12/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "task_id": "77",
            "message": escaped_text,
            "file": (excel_buf, "FOR12_test_newlines.xlsx"),
        },
        content_type="multipart/form-data",
    )
    assert upload_resp.status_code == 201

    get_resp = client.get(
        "/api/tasks/77/message",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.status_code == 200
    msg = get_resp.get_json()["message_text"]
    assert "\\n" not in msg
    assert "\n" in msg
    assert "Estimado cliente:\nSe da inicio al trabajo.\n\nDetalles: CDC 3900093086" == msg

