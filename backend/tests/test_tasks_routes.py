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
                    set_parts = [part.strip() for part in q.split("set")[1].split("where")[0].split(",")]
                    p_idx = 0
                    for part in set_parts:
                        col = part.split("=")[0].strip()
                        if "%s" in part:
                            val = self.last_params[p_idx]
                            p_idx += 1
                            if col == "parent_task_id":
                                tasks_db[tid]["parent_task_id"] = val
                            elif col == "is_rescheduled":
                                tasks_db[tid]["is_rescheduled"] = val
                            elif col == "cdc_number":
                                tasks_db[tid]["cdc_number"] = val
                            elif col == "manual_status":
                                tasks_db[tid]["manual_status"] = val
                                tasks_db[tid]["execution_status"] = val or "PROGRAMADO"
                            elif col == "updated_by":
                                tasks_db[tid]["updated_by"] = val
                        elif "null" in part:
                            if col == "parent_task_id":
                                tasks_db[tid]["parent_task_id"] = None
                            elif col == "manual_status":
                                tasks_db[tid]["manual_status"] = None
                                tasks_db[tid]["execution_status"] = "PROGRAMADO"
                    tasks_db[tid]["updated_at"] = datetime.now()

        def fetchone(self):
            q = self.last_query.lower()
            if "select coalesce(max(sheet_item_order)" in q:
                return {"coalesce": len(tasks_db)}
            if "select id from scheduled_tasks" in q:
                # If searching for cdc match
                target_cdc = self.last_params[0] if self.last_params else None
                exclude_id = self.last_params[-1] if len(self.last_params) > 3 else None
                for t_id, t_row in tasks_db.items():
                    if exclude_id and t_id == exclude_id:
                        continue
                    if t_row.get("cdc_number") and target_cdc and t_row["cdc_number"] == target_cdc:
                        return {"id": t_id}
                return None
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

            if "select id, cdc_number," in q and "from scheduled_tasks where id = %s" in q:
                tid = int(self.last_params[0])
                if tid in tasks_db:
                    return {
                        "id": tid,
                        "cdc_number": tasks_db[tid]["cdc_number"],
                        "is_rescheduled": tasks_db[tid].get("is_rescheduled", False),
                        "parent_task_id": tasks_db[tid].get("parent_task_id"),
                        "manual_status": tasks_db[tid].get("manual_status"),
                        "start_datetime": tasks_db[tid]["start_datetime"],
                        "end_datetime": tasks_db[tid]["end_datetime"],
                    }
                return None

            if "select * from v_scheduled_tasks where id = %s" in q:
                tid = int(self.last_params[0])
                return tasks_db.get(tid)

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


def test_put_task_cdc_and_manual_status(client_and_token):
    client, token = client_and_token

    # 1. Update CDC and set manual_status to SUSPENDIDO
    res_susp = client.put(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "cdc_number": "3900099888",
            "manual_status": "SUSPENDIDO",
        },
    )
    assert res_susp.status_code == 200
    updated_susp = res_susp.get_json()
    assert updated_susp["cdc_number"] == "3900099888"
    assert updated_susp["manual_status"] == "SUSPENDIDO"

    # 2. Transition manual_status to TERMINADO
    res_term = client.put(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"manual_status": "TERMINADO"},
    )
    assert res_term.status_code == 200
    assert res_term.get_json()["manual_status"] == "TERMINADO"

    # 3. Reset manual_status to AUTO (automatic calculation)
    res_auto = client.put(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"manual_status": "AUTO"},
    )
    assert res_auto.status_code == 200
    assert res_auto.get_json()["manual_status"] is None

    # 4. Reject invalid manual_status
    res_inv = client.put(
        "/api/tasks/1",
        headers={"Authorization": f"Bearer {token}"},
        json={"manual_status": "ESTADO_INEXISTENTE"},
    )
    assert res_inv.status_code == 400
    assert "Estado manual inválido" in res_inv.get_json()["error"]


def test_task_rescheduling_manual_and_autodetection(client_and_token):
    client, token = client_and_token

    # 1. Create a second task with the same CDC number (3900092507).
    # It should automatically be detected as rescheduled linking to task #1.
    res_create = client.post(
        "/api/tasks",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Segunda ventana de switches",
            "cdc_number": "3900092507",
            "start_datetime": "2026-09-30 14:00",
            "end_datetime": "2026-09-30 16:00",
        },
    )
    assert res_create.status_code == 201
    created_task = res_create.get_json()
    assert created_task["is_rescheduled"] is True
    assert created_task["parent_task_id"] == 1

    # 2. Manually override is_rescheduled to False via PUT
    res_override_false = client.put(
        f"/api/tasks/{created_task['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_rescheduled": False},
    )
    assert res_override_false.status_code == 200
    assert res_override_false.get_json()["is_rescheduled"] is False

    # 3. Manually override is_rescheduled to True via PUT
    res_override_true = client.put(
        f"/api/tasks/{created_task['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"is_rescheduled": True},
    )
    assert res_override_true.status_code == 200
    assert res_override_true.get_json()["is_rescheduled"] is True
    assert res_override_true.get_json()["parent_task_id"] == 1


