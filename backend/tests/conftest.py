"""Shared pytest fixtures.

Uses a real PostgreSQL test database (hunter_test) so enum types and
UUID columns behave identically to production.  Tables are created once
synchronously before the test session and dropped after.  Each test
gets its own session that rolls back after completion.
"""

from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.auth.jwt import create_access_token
from backend.auth.password import get_password_hash
from backend.db.database import get_db_session
from backend.main import app
from backend.models import Base
from backend.models.user import User, UserRole

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://hunter:VYD0_3-ve8CP7cgreHj_OraQKFuu7ckg"
    "@localhost:5433/hunter_test",
)


def _sync_run(coro):
    asyncio.run(coro)


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Create all tables once before the session; drop after."""
    engine = create_async_engine(TEST_DB_URL, echo=False)

    async def _create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    async def _drop():
        drop_engine = create_async_engine(TEST_DB_URL, echo=False)
        async with drop_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await drop_engine.dispose()

    _sync_run(_create())
    yield
    _sync_run(_drop())


@pytest_asyncio.fixture
async def db_session():
    """Yields a session bound to a connection whose outer transaction always
    rolls back, so even committed data is cleaned up after each test."""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    conn = await engine.connect()
    trans = await conn.begin()
    session = AsyncSession(bind=conn, expire_on_commit=False, autoflush=False)
    yield session
    await session.close()
    await trans.rollback()
    await conn.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session):
    """AsyncClient wired to the test DB; Celery and MinIO are mocked."""

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_db

    with (
        patch("backend.main.init_bucket"),
        patch("backend.main._ensure_bootstrap_admin", new_callable=AsyncMock),
        patch("backend.api.routes.hunting.run_hunting_job_task") as mock_task,
    ):
        mock_task.delay.return_value = MagicMock(id="mock-celery-task-id")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session) -> User:
    user = User(
        email="testadmin@hunter.test",
        hashed_password=get_password_hash("Adm1nP@ss!"),
        role=UserRole.ADMIN_SOC,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user) -> str:
    return create_access_token(admin_user.id, admin_user.role.value, None)


@pytest.fixture
def auth_headers(admin_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}
