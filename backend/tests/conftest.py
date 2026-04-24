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

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.auth.jwt import create_access_token
from backend.auth.password import get_password_hash
from backend.db.database import get_db_session
from backend.main import app
from backend.models import Base
from backend.models.user import User, UserRole

_DEFAULT_HOST_TEST_DB_URL = (
    "postgresql+asyncpg://hunter:Pg9xR2mL7vQ4kN8s"
    "@localhost:5433/hunter_test"
)


def _derive_test_database_url() -> str:
    """Choose a test DB URL that works on both host and container runs.

    Priority:
      1. TEST_DATABASE_URL, if explicitly provided
      2. DATABASE_URL with the database name switched to *_test
      3. Historical localhost fallback for host-based runs
    """
    explicit_url = os.environ.get("TEST_DATABASE_URL")
    if explicit_url:
        return explicit_url

    runtime_database_url = os.environ.get("DATABASE_URL")
    if not runtime_database_url:
        return _DEFAULT_HOST_TEST_DB_URL

    parsed_url = make_url(runtime_database_url)
    database_name = parsed_url.database or "hunter"
    if not database_name.endswith("_test"):
        database_name = f"{database_name}_test"
    return parsed_url.set(database=database_name).render_as_string(hide_password=False)


TEST_DB_URL = _derive_test_database_url()


def _sync_run(coro):
    asyncio.run(coro)


async def _ensure_test_database_exists() -> None:
    """Create the test database if it does not already exist."""
    target_url = make_url(TEST_DB_URL)
    target_database = target_url.database or "hunter_test"
    admin_url = target_url.set(database="postgres")

    connection = await asyncpg.connect(
        user=admin_url.username,
        password=admin_url.password,
        host=admin_url.host or "localhost",
        port=admin_url.port or 5432,
        database=admin_url.database or "postgres",
    )
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            target_database,
        )
        if not exists:
            quoted_name = target_database.replace('"', '""')
            await connection.execute(f'CREATE DATABASE "{quoted_name}"')
    finally:
        await connection.close()


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

    _sync_run(_ensure_test_database_exists())
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
