import io
from contextlib import contextmanager
import openpyxl
import pytest
from app import create_app
from flask_jwt_extended import create_access_token


@pytest.fixture
def client_and_token(monkeypatch):
    class MockCursor:
        def __init__(self):
            self.task_ids = [201]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

        def execute(self, query, params=None):
            self.last_query = query
            self.last_params = params

        def fetchone(self):
            if "WHERE file_hash = %s" in getattr(self, "last_query", ""):
                if getattr(self, "simulate_duplicate", False):
                    from datetime import datetime
                    return {
                        "id": 99,
                        "committee_name": "COMITÉ ANTERIOR",
                        "filename": "anterior.xlsx",
                        "uploaded_at": datetime(2026, 9, 20, 10, 0, 0),
                    }
                return None
            if "WHERE cs.id = (SELECT MAX(id) FROM committee_sheets)" in getattr(self, "last_query", ""):
                from datetime import datetime
                return {
                    "id": 1,
                    "committee_name": "COMITÉ INTERNO VPTI 24/09/2026",
                    "filename": "comite.xlsx",
                    "uploaded_at": datetime(2026, 9, 24, 8, 0),
                    "uploaded_by": 1,
                    "uploaded_by_name": "Andrew Andrades",
                    "total_tasks": 24,
                    "is_latest": True,
                }
            if "INSERT INTO committee_sheets" in getattr(self, "last_query", ""):
                return (1,)
            if "SELECT id FROM scheduled_tasks" in getattr(self, "last_query", ""):
                return None
            if "INSERT INTO scheduled_tasks" in getattr(self, "last_query", ""):
                return (self.task_ids.pop(0) if self.task_ids else 999,)
            return None

        def fetchall(self):
            if "FROM committee_sheets" in getattr(self, "last_query", ""):
                from datetime import datetime
                return [
                    {
                        "id": 1,
                        "committee_name": "COMITÉ INTERNO VPTI 24/09/2026",
                        "filename": "comite.xlsx",
                        "uploaded_at": datetime(2026, 9, 24, 8, 0),
                        "uploaded_by": 1,
                        "uploaded_by_name": "Andrew Andrades",
                        "total_tasks": 24,
                        "is_latest": True,
                    }
                ]
            return []

    mock_cur = MockCursor()

    class MockConnection:
        def cursor(self):
            return mock_cur

        def commit(self):
            pass

        def rollback(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    @contextmanager
    def mock_db_conn():
        yield MockConnection()

    @contextmanager
    def mock_db_cursor(commit=False):
        yield mock_cur

    monkeypatch.setattr("routes.upload.get_db_connection", mock_db_conn)
    monkeypatch.setattr("routes.upload.get_db_cursor", mock_db_cursor)
    monkeypatch.setattr("services.excel_parser.get_db_connection", mock_db_conn)
    monkeypatch.setattr("database.check_db_health", lambda: True)
    monkeypatch.setattr("database.init_db", lambda: None)
    monkeypatch.setattr("scheduler.start_scheduler", lambda: None)

    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        token = create_access_token(identity="1")

    with app.test_client() as c:
        yield c, token


def test_upload_missing_file(client_and_token):
    client, token = client_and_token
    res = client.post(
        "/api/tasks/upload",
        headers={"Authorization": f"Bearer {token}"},
        content_type="multipart/form-data",
        data={},
    )
    assert res.status_code == 400
    assert "No se incluyó el archivo" in res.get_json()["error"]


def test_upload_invalid_extension(client_and_token):
    client, token = client_and_token
    data = {
        "file": (io.BytesIO(b"dummy text content"), "report.txt"),
    }
    res = client.post(
        "/api/tasks/upload",
        headers={"Authorization": f"Bearer {token}"},
        content_type="multipart/form-data",
        data=data,
    )
    assert res.status_code == 400
    assert "Formato de archivo no soportado" in res.get_json()["error"]


def test_upload_success(client_and_token):
    client, token = client_and_token

    # Build valid excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Comite_VPTI"
    ws.cell(row=2, column=1, value="COMITÉ INTERNO VPTI 24/09/2026")

    headers = [
        "N°", "Título del Trabajo", "CDC", "Justificación",
        "Fecha y Hora Inicio", "Fecha y Hora Fin", "Afectación"
    ]
    for col_idx, h in enumerate(headers, start=1):
        ws.cell(row=4, column=col_idx, value=h)

    ws.cell(row=5, column=1, value=1)
    ws.cell(row=5, column=2, value="Migración de Core Switch")
    ws.cell(row=5, column=3, value="3900092555")
    ws.cell(row=5, column=4, value="Mejora de rendimiento")
    ws.cell(row=5, column=5, value="Viernes 2/10/2026 3:10")
    ws.cell(row=5, column=6, value="Viernes 2/10/2026 5:10")
    ws.cell(row=5, column=7, value="NO")

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    res = client.post(
        "/api/tasks/upload",
        headers={"Authorization": f"Bearer {token}"},
        content_type="multipart/form-data",
        data={"file": (stream, "comite.xlsx")},
    )
    assert res.status_code == 201
    res_data = res.get_json()
    assert res_data["sheet_id"] == 1
    assert res_data["tasks_imported"] == 1
    assert res_data["rescheduled_count"] == 0


def test_upload_duplicate_file_conflict_409(client_and_token):
    client, token = client_and_token

    # Build valid excel
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Comite_VPTI"
    ws.cell(row=2, column=1, value="COMITÉ INTERNO VPTI 24/09/2026")
    ws.cell(row=4, column=1, value="N°")
    ws.cell(row=4, column=2, value="Título")
    ws.cell(row=4, column=3, value="CDC")
    ws.cell(row=4, column=4, value="Inicio")
    ws.cell(row=4, column=5, value="Fin")
    ws.cell(row=5, column=1, value=1)
    ws.cell(row=5, column=2, value="Tarea de prueba")
    ws.cell(row=5, column=3, value="3900091111")
    ws.cell(row=5, column=4, value="Viernes 2/10/2026 3:10")
    ws.cell(row=5, column=5, value="Viernes 2/10/2026 5:10")

    stream = io.BytesIO()
    wb.save(stream)
    excel_bytes = stream.getvalue()

    # First upload (success)
    res1 = client.post(
        "/api/tasks/upload",
        headers={"Authorization": f"Bearer {token}"},
        content_type="multipart/form-data",
        data={"file": (io.BytesIO(excel_bytes), "comite.xlsx")},
    )
    assert res1.status_code == 201

    # Simulate duplicate match in database on second upload
    # We patch the mock cursor's simulate_duplicate flag
    # In MockConnection:
    from contextlib import contextmanager
    class DuplicateCursor:
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass
        def execute(self, query, params=None): pass
        def fetchone(self):
            from datetime import datetime
            return {
                "id": 42,
                "committee_name": "COMITÉ ANTERIOR",
                "filename": "anterior.xlsx",
                "uploaded_at": datetime(2026, 9, 20, 10, 0, 0),
            }

    class DuplicateConn:
        def cursor(self): return DuplicateCursor()
        def commit(self): pass
        def rollback(self): pass
        def __enter__(self): return self
        def __exit__(self, exc_type, exc_val, exc_tb): pass

    @contextmanager
    def mock_dup_conn():
        yield DuplicateConn()

    import routes.upload
    routes.upload.get_db_connection = mock_dup_conn

    res2 = client.post(
        "/api/tasks/upload",
        headers={"Authorization": f"Bearer {token}"},
        content_type="multipart/form-data",
        data={"file": (io.BytesIO(excel_bytes), "comite.xlsx")},
    )
    assert res2.status_code == 409
    dup_data = res2.get_json()
    assert "Este archivo ya ha sido cargado anteriormente" in dup_data["error"]
    assert dup_data["existing_sheet_id"] == 42
    assert "2026-09-20T10:00:00" in dup_data["uploaded_at"]


def test_list_committee_sheets(client_and_token):
    client, token = client_and_token
    res = client.get("/api/committee-sheets", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    sheets = res.get_json()
    assert len(sheets) == 1
    assert sheets[0]["committee_name"] == "COMITÉ INTERNO VPTI 24/09/2026"
    assert sheets[0]["is_latest"] is True


def test_get_latest_committee_sheet(client_and_token):
    client, token = client_and_token
    res = client.get("/api/committee-sheets/latest", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    latest = res.get_json()
    assert latest["id"] == 1
    assert latest["is_latest"] is True

