from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import select

from backend.api.routes.alerts import router as alerts_router
from backend.api.routes.auth import router as auth_router
from backend.api.routes.iocs import router as iocs_router
from backend.api.routes.client_logs import router as client_logs_router
from backend.api.routes.clients import router as clients_router
from backend.api.routes.collections import router as collections_router
from backend.api.routes.hunting import router as hunting_router
from backend.api.routes.reports import router as reports_router
from backend.api.routes.sources import router as sources_router
from backend.api.routes.websockets import router as ws_router
from backend.auth.password import get_password_hash
from backend.config import settings
from backend.db.database import AsyncSessionLocal, engine
from backend.models import Base
from backend.models.user import User, UserRole
from backend.storage.minio_client import init_bucket


async def _ensure_bootstrap_admin() -> None:
    if not settings.bootstrap_admin_email or not settings.bootstrap_admin_password:
        return

    async with AsyncSessionLocal() as session:
        statement = select(User).where(User.email == settings.bootstrap_admin_email.lower())
        existing_user = (await session.execute(statement)).scalar_one_or_none()
        if existing_user is not None:
            return

        session.add(
            User(
                email=settings.bootstrap_admin_email.lower(),
                hashed_password=get_password_hash(settings.bootstrap_admin_password),
                role=UserRole.ADMIN_SOC,
            )
        )
        await session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    init_bucket(settings.minio_bucket)
    await _ensure_bootstrap_admin()
    yield


app = FastAPI(title="HUNTER API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(clients_router)
app.include_router(client_logs_router)
app.include_router(sources_router)
app.include_router(collections_router)
app.include_router(hunting_router)
app.include_router(alerts_router)
app.include_router(iocs_router)
app.include_router(reports_router)
app.include_router(ws_router)

Instrumentator().instrument(app).expose(app, include_in_schema=False, endpoint="/metrics")
