"""API endpoint integration tests.

Covers: auth, sources, hunting jobs, IoCs.
All tests use the shared fixtures from conftest.py (test PostgreSQL DB,
mocked Celery and MinIO).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from backend.models.enums import IocType, Severity, TlpLevel
from backend.models.ioc import IoC

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TestAuth:
    async def test_login_success(self, client: AsyncClient, admin_user):
        resp = await client.post("/auth/login", json={
            "email": "testadmin@hunter.test",
            "password": "Adm1nP@ss!",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"] == "admin_soc"

    async def test_login_wrong_password(self, client: AsyncClient, admin_user):
        resp = await client.post("/auth/login", json={
            "email": "testadmin@hunter.test",
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_login_unknown_email(self, client: AsyncClient):
        resp = await client.post("/auth/login", json={
            "email": "nobody@hunter.test",
            "password": "doesntmatter",
        })
        assert resp.status_code == 401

    async def test_refresh_token(self, client: AsyncClient, admin_user, admin_token):
        resp = await client.post("/auth/refresh", json={"token": admin_token})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    async def test_refresh_invalid_token(self, client: AsyncClient):
        resp = await client.post("/auth/refresh", json={"token": "not.a.token"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

class TestSources:
    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get("/admin/sources")
        assert resp.status_code == 401

    async def test_list_empty(self, client: AsyncClient, auth_headers):
        resp = await client.get("/admin/sources", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_source(self, client: AsyncClient, auth_headers):
        resp = await client.post("/admin/sources", headers=auth_headers, json={
            "name": "Test RSS Feed",
            "type": "rss",
            "url": "https://example.com/feed.xml",
            "polling_interval_minutes": 60,
            "is_active": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test RSS Feed"
        assert data["type"] == "rss"
        assert "id" in data
        return data["id"]

    async def test_get_source(self, client: AsyncClient, auth_headers):
        create = await client.post("/admin/sources", headers=auth_headers, json={
            "name": "Fetch Me",
            "type": "rss",
            "url": "https://example.com/rss",
            "polling_interval_minutes": 30,
            "is_active": True,
        })
        source_id = create.json()["id"]

        resp = await client.get(f"/admin/sources/{source_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == source_id

    async def test_get_source_not_found(self, client: AsyncClient, auth_headers):
        resp = await client.get(
            "/admin/sources/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_update_source(self, client: AsyncClient, auth_headers):
        create = await client.post("/admin/sources", headers=auth_headers, json={
            "name": "Update Me",
            "type": "rss",
            "url": "https://example.com/old",
            "polling_interval_minutes": 30,
            "is_active": True,
        })
        source_id = create.json()["id"]

        resp = await client.patch(
            f"/admin/sources/{source_id}",
            headers=auth_headers,
            json={"url": "https://example.com/new", "is_active": False},
        )
        assert resp.status_code == 200
        assert resp.json()["url"] == "https://example.com/new"
        assert resp.json()["is_active"] is False


# ---------------------------------------------------------------------------
# Hunting jobs
# ---------------------------------------------------------------------------

class TestHuntingJobs:
    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get("/admin/hunting")
        assert resp.status_code == 401

    async def test_list_empty(self, client: AsyncClient, auth_headers):
        resp = await client.get("/admin/hunting", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_create_collection_job(self, client: AsyncClient, auth_headers):
        resp = await client.post("/admin/hunting", headers=auth_headers, json={
            "type": "collection",
            "params": {},
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "collection"
        assert data["status"] == "pending"
        assert data["celery_task_id"] == "mock-celery-task-id"
        return data["id"]

    async def test_get_job(self, client: AsyncClient, auth_headers):
        create = await client.post("/admin/hunting", headers=auth_headers, json={
            "type": "collection",
            "params": {"theme": "ransomware"},
        })
        job_id = create.json()["id"]

        resp = await client.get(f"/admin/hunting/{job_id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == job_id

    async def test_get_job_not_found(self, client: AsyncClient, auth_headers):
        resp = await client.get(
            "/admin/hunting/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_list_filters_by_status(self, client: AsyncClient, auth_headers):
        await client.post("/admin/hunting", headers=auth_headers, json={
            "type": "collection", "params": {},
        })
        resp = await client.get(
            "/admin/hunting?status=pending",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        jobs = resp.json()
        assert all(j["status"] == "pending" for j in jobs)


# ---------------------------------------------------------------------------
# IoCs
# ---------------------------------------------------------------------------

class TestIoCs:
    async def test_list_requires_auth(self, client: AsyncClient):
        resp = await client.get("/admin/iocs")
        assert resp.status_code == 401

    async def test_list_iocs(self, client: AsyncClient, auth_headers, db_session):
        ioc = IoC(
            type=IocType.IP,
            value="1.2.3.4",
            value_normalized="1.2.3.4",
            severity=Severity.MEDIUM,
            confidence=80,
            tlp=TlpLevel.AMBER,
            source_type="rss",
        )
        db_session.add(ioc)
        await db_session.commit()

        resp = await client.get("/admin/iocs", headers=auth_headers)
        assert resp.status_code == 200
        values = [i["value"] for i in resp.json()]
        assert "1.2.3.4" in values

    async def test_get_ioc(self, client: AsyncClient, auth_headers, db_session):
        ioc = IoC(
            type=IocType.DOMAIN,
            value="evil.example.com",
            value_normalized="evil.example.com",
            severity=Severity.HIGH,
            confidence=90,
            tlp=TlpLevel.AMBER,
            source_type="rss",
        )
        db_session.add(ioc)
        await db_session.commit()
        await db_session.refresh(ioc)

        resp = await client.get(f"/admin/iocs/{ioc.id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["value"] == "evil.example.com"

    async def test_get_ioc_not_found(self, client: AsyncClient, auth_headers):
        resp = await client.get(
            "/admin/iocs/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404
