from contextlib import contextmanager
from datetime import datetime, timedelta
import pytz
import pytest
from app import create_app
from config import Config
from flask_jwt_extended import create_access_token
from pywebpush import WebPushException
from scheduler import check_and_send_alerts
from services.notifier import send_web_push, dispatch_task_alert_to_all


@pytest.fixture
def client_and_token(monkeypatch):
    subscriptions_db = {}

    class MockCursor:
        def __init__(self):
            self.last_query = ""
            self.last_params = ()

        def execute(self, query, params=None):
            self.last_query = query
            self.last_params = params or ()
            q = query.lower()
            if "insert into push_subscriptions" in q:
                uid, label, endpoint, p256dh, auth = self.last_params
                subscriptions_db[endpoint] = {
                    "id": len(subscriptions_db) + 1,
                    "user_id": uid,
                    "device_label": label,
                    "endpoint": endpoint,
                    "p256dh_key": p256dh,
                    "auth_key": auth,
                }

        def fetchone(self):
            return None

        def fetchall(self):
            q = self.last_query.lower()
            if "from push_subscriptions" in q:
                if "where user_id = %s" in q:
                    uid = self.last_params[0]
                    return [s for s in subscriptions_db.values() if s["user_id"] == uid]
                return list(subscriptions_db.values())
            return []

    @contextmanager
    def mock_get_db_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("routes.push.get_db_cursor", mock_get_db_cursor)
    monkeypatch.setattr("services.notifier.get_db_cursor", mock_get_db_cursor)
    monkeypatch.setattr("database.check_db_health", lambda: True)
    monkeypatch.setattr("database.init_db", lambda: None)
    monkeypatch.setattr("scheduler.start_scheduler", lambda: None)

    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        token = create_access_token(identity="1")

    with app.test_client() as c:
        yield c, token, subscriptions_db


def test_vapid_public_key_endpoint(client_and_token):
    client, token, _ = client_and_token
    res = client.get("/api/push/vapid-public-key")
    assert res.status_code == 200
    assert "public_key" in res.get_json()


def test_push_subscribe(client_and_token):
    client, token, subs = client_and_token
    payload = {
        "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint-token",
        "keys": {
            "p256dh": "mock_p256dh_key",
            "auth": "mock_auth_key",
        },
        "device_label": "Chrome Windows 11",
    }
    res = client.post(
        "/api/push/subscribe",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res.status_code == 201
    assert "registrada con éxito" in res.get_json()["message"]
    assert "https://fcm.googleapis.com/fcm/send/test-endpoint-token" in subs


def test_push_test_dispatch(client_and_token, monkeypatch):
    client, token, subs = client_and_token

    # Add a mock subscription
    subs["https://endpoint-1"] = {
        "id": 1,
        "user_id": 1,
        "device_label": "Test Device",
        "endpoint": "https://endpoint-1",
        "p256dh_key": "key",
        "auth_key": "auth",
    }

    # Mock webpush function
    monkeypatch.setattr(
        "services.notifier.webpush",
        lambda **kwargs: type("Resp", (), {"status_code": 200})(),
    )

    res = client.post(
        "/api/push/test",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Test Title", "body": "Test Body"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["delivery_summary"]["sent"] == 1
    assert data["delivery_summary"]["failed"] == 0


def test_inactive_endpoint_removal_on_410(monkeypatch):
    deleted_endpoints = []

    class MockCursor:
        def execute(self, query, params=None):
            if "delete from push_subscriptions" in query.lower():
                deleted_endpoints.append(params[0])

    @contextmanager
    def mock_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("services.notifier.get_db_cursor", mock_cursor)

    # Mock webpush to raise 410 Gone WebPushException
    mock_resp = type("Response", (), {"status_code": 410})()
    mock_exc = WebPushException("Subscription has expired")
    mock_exc.response = mock_resp

    def fake_webpush(**kwargs):
        raise mock_exc

    monkeypatch.setattr("services.notifier.webpush", fake_webpush)

    sub_info = {
        "endpoint": "https://fcm.googleapis.com/expired-device-token",
        "keys": {"p256dh": "key", "auth": "auth"},
    }

    success, code = send_web_push(sub_info, {"title": "Test"})
    assert success is False
    assert code == 410
    assert "https://fcm.googleapis.com/expired-device-token" in deleted_endpoints


def test_scheduler_check_and_send_alerts(monkeypatch):
    from config import AppConfig

    tz = pytz.timezone(AppConfig.TIMEZONE)
    now = datetime.now(tz)

    mock_tasks = [
        {
            "id": 55,
            "title": "Mantenimiento Switch Central",
            "cdc_number": "3900092507",
            "start_datetime": now + timedelta(minutes=30),
            "alert_1h_sent": False,
        }
    ]

    updated_tasks = []
    updated_timestamps = []

    class MockCursor:
        def execute(self, query, params=None):
            q = query.lower()
            if "update scheduled_tasks" in q and "alert_1h_sent = true" in q:
                # params is (alert_sent_at, task_id)
                updated_timestamps.append(params[0])
                updated_tasks.append(params[1])

        def fetchall(self):
            return mock_tasks

    @contextmanager
    def mock_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("scheduler.get_db_cursor", mock_cursor)

    dispatched_tasks = []
    monkeypatch.setattr(
        "scheduler.dispatch_task_alert_to_all",
        lambda task: dispatched_tasks.append(task["id"]),
    )

    check_and_send_alerts()
    assert 55 in dispatched_tasks
    assert 55 in updated_tasks
    assert len(updated_timestamps) == 1
    assert updated_timestamps[0] is not None


def test_get_pending_1h_alerts_query(monkeypatch):
    from config import AppConfig
    from services.alert_scheduler import get_pending_1h_alerts, VENEZUELA_TZ

    captured_query = []
    captured_params = []

    class MockQueryCursor:
        def execute(self, query, params=None):
            captured_query.append(query)
            captured_params.append(params)

        def fetchall(self):
            return [{"id": 101, "title": "Test 1h Window"}]

    @contextmanager
    def mock_cursor(commit=False):
        yield MockQueryCursor()

    monkeypatch.setattr("services.alert_scheduler.get_db_cursor", mock_cursor)

    results = get_pending_1h_alerts()
    assert len(results) == 1
    assert results[0]["id"] == 101

    assert len(captured_query) == 1
    q_str = captured_query[0].lower()
    assert "alert_1h_sent is false or alert_1h_sent is null" in q_str
    assert "start_datetime >= %s" in q_str
    assert "start_datetime <= %s" in q_str

    params = captured_params[0]
    assert len(params) == 2
    now_param, window_end_param = params
    assert now_param.tzinfo is not None
    assert window_end_param.tzinfo is not None
    # Verify window is AppConfig.ALERT_PREWARNING_MINUTES
    diff = window_end_param - now_param
    assert diff.total_seconds() == AppConfig.ALERT_PREWARNING_MINUTES * 60


