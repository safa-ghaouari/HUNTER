from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api.routes.websockets import router as ws_router
from backend.auth.jwt import create_access_token
from backend.models.client import Client
from backend.models.enums import JobStatus, JobType
from backend.models.hunting_job import HuntingJob
from backend.models.user import User, UserRole


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    def __init__(self, job):
        self._job = job

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def execute(self, _statement):
        return _ScalarResult(self._job)


class _FakeSessionLocal:
    def __init__(self, job):
        self._job = job

    def __call__(self):
        return _FakeSession(self._job)


class TestJobStatusWebSocket:
    def test_admin_can_subscribe_to_job(self, monkeypatch):
        app = FastAPI()
        app.include_router(ws_router)

        admin_user = User(
            id=uuid4(),
            email="socket-admin@hunter.test",
            hashed_password="hashed",
            role=UserRole.ADMIN_SOC,
        )
        job = HuntingJob(
            id=uuid4(),
            type=JobType.COLLECTION,
            status=JobStatus.RUNNING,
            initiated_by=admin_user.id,
            params={},
        )

        async def _fake_user(_websocket):
            return admin_user

        monkeypatch.setattr("backend.api.routes.websockets._load_authenticated_user", _fake_user)
        monkeypatch.setattr("backend.api.routes.websockets.AsyncSessionLocal", _FakeSessionLocal(job))

        with TestClient(app) as client:
            with client.websocket_connect(f"/ws/jobs/{job.id}?token=test-token") as websocket:
                payload = websocket.receive_json()

        assert payload["job_id"] == str(job.id)
        assert payload["status"] == "running"

    def test_client_can_only_subscribe_to_same_client_job(self, monkeypatch):
        app = FastAPI()
        app.include_router(ws_router)

        allowed_client = Client(id=uuid4(), name="Allowed Client", api_key_vault_path="secret/clients/allowed")
        other_client = Client(id=uuid4(), name="Other Client", api_key_vault_path="secret/clients/other")
        client_user = User(
            id=uuid4(),
            email="client@hunter.test",
            hashed_password="hashed",
            role=UserRole.CLIENT,
            client_id=allowed_client.id,
        )
        allowed_job = HuntingJob(
            id=uuid4(),
            type=JobType.FULL_HUNT,
            status=JobStatus.RUNNING,
            client_id=allowed_client.id,
            initiated_by=client_user.id,
            params={},
        )
        blocked_job = HuntingJob(
            id=uuid4(),
            type=JobType.FULL_HUNT,
            status=JobStatus.RUNNING,
            client_id=other_client.id,
            initiated_by=client_user.id,
            params={},
        )

        async def _fake_user(_websocket):
            return client_user

        monkeypatch.setattr("backend.api.routes.websockets._load_authenticated_user", _fake_user)

        with TestClient(app) as client:
            monkeypatch.setattr("backend.api.routes.websockets.AsyncSessionLocal", _FakeSessionLocal(allowed_job))
            with client.websocket_connect(f"/ws/jobs/{allowed_job.id}?token=test-token") as websocket:
                payload = websocket.receive_json()
            assert payload["job_id"] == str(allowed_job.id)

            monkeypatch.setattr("backend.api.routes.websockets.AsyncSessionLocal", _FakeSessionLocal(blocked_job))
            with pytest.raises(WebSocketDisconnect) as blocked:
                with client.websocket_connect(f"/ws/jobs/{blocked_job.id}?token=test-token"):
                    pass

        assert blocked.value.code == 4003

    def test_rejects_missing_or_invalid_token(self):
        app = FastAPI()
        app.include_router(ws_router)

        admin_user = User(
            id=uuid4(),
            email="socket-admin-invalid@hunter.test",
            hashed_password="hashed",
            role=UserRole.ADMIN_SOC,
        )
        job = HuntingJob(
            id=uuid4(),
            type=JobType.COLLECTION,
            status=JobStatus.RUNNING,
            initiated_by=admin_user.id,
            params={},
        )

        valid_token = create_access_token(admin_user.id, admin_user.role.value, admin_user.client_id)

        with TestClient(app) as client:
            with pytest.raises(WebSocketDisconnect) as invalid:
                with client.websocket_connect(f"/ws/jobs/{job.id}?token=not-a-token"):
                    pass

            with pytest.raises(WebSocketDisconnect) as missing:
                with client.websocket_connect(f"/ws/jobs/{job.id}"):
                    pass

        assert invalid.value.code == 4001
        assert missing.value.code == 4001
        assert valid_token
