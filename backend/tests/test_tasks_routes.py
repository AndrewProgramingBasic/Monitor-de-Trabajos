from contextlib import contextmanager
from datetime import datetime
import pytest
from app import create_app
from flask_jwt_extended import create_access_token


@pytest.fixture
def client_and_token(monkeypatch):
    tasks_db = {
        1: {
            "id": 1,
            "sheet_id": 1,
            "committee_name": "COMITÉ INTERNO VPTI 24/09/2026",
            "sheet_item_order": 1,
            "title": "Actualización de switches",
            "cdc_number": "3900092507",
            "justification": "Preventivo",
            "start_datetime": datetime(2026, 9, 28, 10, 30),
            "end_datetime": datetime(2026, 9, 28, 12, 30),
            "has_affectation": "NO",
            "affectation_start": None,
            "affectation_end": None,
            "affectation_details": None,
            "vpti_committee_approval": "Aprobado",
            "managers_approval": "Aprobado",
            "is_rescheduled": False,
            "parent_task_id": None,
            "alert_1h_sent": True,
            "alert_sent_at": datetime(2026, 9, 28, 9, 30),
            "created_at": datetime(2026, 9, 24, 8, 0),
            "created_by": 1,
            "updated_at": None,
            "updated_by": None,
            "created_by_name": "Andrew Andrades",
            "updated_by_name": None,
            "execution_status": "PROGRAMADO",
        }
    }

    class MockCursor:
        def __init__(self):
            self.last_query = ""
            self.last_params = ()

        def execute(self, query, params=None):
            self.last_query = query
            self.last_params = params or ()
            q = query.lower()
            if "update scheduled_tasks" in q and self.last_params:
                tid = int(self.last_params[-1])
                if tid in tasks_db:
                    if "alert_1h_sent = false" in q:
                        tasks_db[tid]["alert_1h_sent"] = False
                        tasks_db[tid]["alert_sent_at"] = None
                    tasks_db[tid]["updated_at"] = datetime.now()
                    tasks_db[tid]["updated_by"] = int(self.last_params[-2])

        def fetchone(self):
            q = self.last_query.lower()
            if "select coalesce(max(sheet_item_order)" in q:
                return {"coalesce": len(tasks_db)}
            if "select id from scheduled_tasks" in q:
                return None  # No matching cdc for parent
            if "insert into scheduled_tasks" in q:
                new_id = len(tasks_db) + 1
                row = {
                    "id": new_id,
                    "sheet_id": self.last_params[0],
                    "committee_name": "Manual",
                    "sheet_item_order": self.last_params[1],
                    "title": self.last_params[2],
                    "cdc_number": self.last_params[3],
                    "justification": self.last_params[4],
                    "start_datetime": self.last_params[5],
                    "end_datetime": self.last_params[6],
                    "has_affectation": self.last_params[7],
                    "affectation_start": self.last_params[8],
                    "affectation_end": self.last_params[9],
                    "affectation_details": self.last_params[10],
                    "vpti_committee_approval": self.last_params[11],
                    "managers_approval": self.last_params[12],
                    "is_rescheduled": self.last_params[13],
                    "parent_task_id": self.last_params[14],
                    "alert_1h_sent": False,
                    "alert_sent_at": None,
                    "created_at": datetime.now(),
                    "created_by": self.last_params[15],
                    "updated_at": None,
                    "updated_by": None,
                    "created_by_name": "Admin",
                    "updated_by_name": None,
                    "execution_status": "PROGRAMADO",
                }
                tasks_db[new_id] = row
                return {"id": new_id}

            if "select id, start_datetime, end_datetime from scheduled_tasks where id = %s" in q:
                tid = int(self.last_params[0])
                if tid in tasks_db:
                    return {
                        "id": tid,
                        "start_datetime": tasks_db[tid]["start_datetime"],
                        "end_datetime": tasks_db[tid]["end_datetime"],
                    }
                return None

            if "select * from v_scheduled_tasks where id = %s" in q:
                tid = int(self.last_params[0])
                return tasks_db.get(tid)

            if "update scheduled_tasks" in q:
                tid = int(self.last_params[-1])
                if tid in tasks_db:
                    # Check what was updated
                    if "alert_1h_sent = false" in q:
                        tasks_db[tid]["alert_1h_sent"] = False
                        tasks_db[tid]["alert_sent_at"] = None
                    # Update dates
                    tasks_db[tid]["updated_at"] = datetime.now()
                    tasks_db[tid]["updated_by"] = int(self.last_params[-2])
                return None

            return None

        def fetchall(self):
            q = self.last_query.lower()
            if "from v_scheduled_tasks" in q:
                return list(tasks_db.values())
            return []

    @contextmanager
    def mock_get_db_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("routes.tasks.get_db_cursor", mock_get_db_cursor)
    monkeypatch.setattr("database.check_db_health", lambda: True)
    monkeypatch.setattr("database.init_db", lambda: None)
    monkeypatch.setattr("scheduler.start_scheduler", lambda: None)

    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        token = create_access_token(identity="1")

    with app.test_client() as c:
        yield c, token


def test_list_tasks(client_and_token):
    client, token = client_and_token
    res = client.get("/api/tasks", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    tasks = res.get_json()
    assert len(tasks) >= 1
    assert tasks[0]["cdc_number"] == "3900092507"
    assert "start_datetime" in tasks[0]


def test_create_task_manual(client_and_token):
    client, token = client_and_token
    payload = {
        "title": "Mantenimiento Servidor BD",
        "cdc_number": "3900099999",
        "justification": "Mantenimiento preventivo",
        "start_datetime": "Lunes 28/9/2026 15:20",
        "end_datetime": "Lunes 28/9/2026 18:20",
        "has_affectation": "SI",
        "affectation_details": "Base de datos",
    }
    res = client.post(
        "/api/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res.status_code == 201
    created = res.get_json()
    assert created["title"] == "Mantenimiento Servidor BD"
    assert created["cdc_number"] == "3900099999"


def test_patch_task_strict_scope(client_and_token):
    client, token = client_and_token

    # 1. Rejecting non-allowed fields
    res_bad = client.patch(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Cambio no permitido", "start_datetime": "Lunes 28/9/2026 16:00"},
    )
    assert res_bad.status_code == 400
    assert "Modificación restringida" in res_bad.get_json()["error"]

    # 2. Successfully updating start_datetime (which resets alert flag)
    res_ok = client.patch(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"start_datetime": "Lunes 28/9/2026 11:00"},
    )
    assert res_ok.status_code == 200
    updated = res_ok.get_json()
    assert updated["alert_1h_sent"] is False
    assert updated["alert_sent_at"] is None


def test_forbidden_deletions(client_and_token):
    client, token = client_and_token
    res = client.delete("/api/tasks/1", headers={"Authorization": f"Bearer {token}"})
    # 405 Method Not Allowed confirms DELETE method is completely disabled
    assert res.status_code == 405
