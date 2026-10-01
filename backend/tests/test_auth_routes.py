from contextlib import contextmanager
import bcrypt
import pytest
from app import create_app


@pytest.fixture
def client(monkeypatch):
    # Mock database cursor to test route logic independently
    users_db = {
        1: {
            "id": 1,
            "username": "aandra05",
            "email": "andradeandradeje@gmail.com",
            "password_hash": bcrypt.hashpw(
                "ClaveSegura2026*".encode("utf-8"), bcrypt.gensalt(10)
            ).decode("utf-8"),
            "full_name": "Andrew Andrades",
            "created_at": "2026-09-30T08:00:00-04:00",
            "created_by_user_id": None,
        }
    }

    class MockCursor:
        def __init__(self):
            self.last_query = ""
            self.last_params = ()
            self.last_row = None

        def execute(self, query, params=None):
            self.last_query = query
            self.last_params = params or ()

        def fetchone(self):
            q = self.last_query.lower()
            if "select id, username, email, password_hash, full_name" in q:
                # Login query
                term = self.last_params[0].lower()
                for u in users_db.values():
                    if u["username"].lower() == term or u["email"].lower() == term:
                        return u
                return None

            if "select id, username, email, full_name, created_at, created_by_user_id" in q:
                # Me query
                uid = int(self.last_params[0])
                return users_db.get(uid)

            if "select id, username, email from users" in q:
                # Uniqueness query
                uname = self.last_params[0].lower()
                uemail = self.last_params[1].lower()
                for u in users_db.values():
                    if u["username"].lower() == uname or u["email"].lower() == uemail:
                        return u
                return None

            if "insert into users" in q:
                # User creation
                new_id = len(users_db) + 1
                row = {
                    "id": new_id,
                    "username": self.last_params[0],
                    "email": self.last_params[1],
                    "password_hash": self.last_params[2],
                    "full_name": self.last_params[3],
                    "created_at": "2026-09-30T10:00:00-04:00",
                    "created_by_user_id": self.last_params[4],
                }
                users_db[new_id] = row
                return {
                    "id": row["id"],
                    "username": row["username"],
                    "email": row["email"],
                    "full_name": row["full_name"],
                    "created_at": row["created_at"],
                    "created_by_user_id": row["created_by_user_id"],
                }

            return None

        def fetchall(self):
            return []

    @contextmanager
    def mock_get_db_cursor(commit=False):
        yield MockCursor()

    monkeypatch.setattr("routes.auth.get_db_cursor", mock_get_db_cursor)
    monkeypatch.setattr("database.check_db_health", lambda: True)
    monkeypatch.setattr("app.check_db_health", lambda: True)
    monkeypatch.setattr("database.init_db", lambda: None)
    monkeypatch.setattr("scheduler.start_scheduler", lambda: None)

    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_login_success(client):
    res = client.post(
        "/api/auth/login",
        json={"username_or_email": "aandra05", "password": "ClaveSegura2026*"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "access_token" in data
    assert data["user"]["username"] == "aandra05"
    assert data["user"]["email"] == "andradeandradeje@gmail.com"


def test_login_invalid_password(client):
    res = client.post(
        "/api/auth/login",
        json={"username_or_email": "aandra05", "password": "wrongpassword"},
    )
    assert res.status_code == 401
    assert "inválidas" in res.get_json()["error"]


def test_login_nonexistent_user(client):
    res = client.post(
        "/api/auth/login",
        json={"username_or_email": "unknown", "password": "ClaveSegura2026*"},
    )
    assert res.status_code == 401


def test_auth_me_protected(client):
    # Without token
    res = client.get("/api/auth/me")
    assert res.status_code == 401

    # Login to get token
    login_res = client.post(
        "/api/auth/login",
        json={"username_or_email": "aandra05", "password": "ClaveSegura2026*"},
    )
    token = login_res.get_json()["access_token"]

    # With token
    res = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["username"] == "aandra05"
    assert data["full_name"] == "Andrew Andrades"


def test_create_user(client):
    login_res = client.post(
        "/api/auth/login",
        json={"username_or_email": "aandra05", "password": "ClaveSegura2026*"},
    )
    token = login_res.get_json()["access_token"]

    # 1. Create new user
    res = client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "mcastillo",
            "email": "mcastillo@vpti.com",
            "password": "Password123*",
            "full_name": "Maria Castillo",
        },
    )
    assert res.status_code == 201
    created = res.get_json()
    assert created["username"] == "mcastillo"
    assert "password_hash" not in created

    # 2. Try creating duplicate user
    res_dup = client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "username": "mcastillo",
            "email": "another@vpti.com",
            "password": "Password123*",
            "full_name": "Duplicate User",
        },
    )
    assert res_dup.status_code == 409


def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "UP"
    assert data["database_connected"] is True
    assert data["timezone"] == "America/Caracas"
    assert "server_time" in data
