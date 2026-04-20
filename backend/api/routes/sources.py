from uuid import UUID
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.integrations.vault_client import write_secret
from backend.models.source import Source
from backend.models.user import User
from backend.schemas.source import SourceCreateRequest, SourceResponse, SourceUpdateRequest

router = APIRouter(prefix="/admin/sources", tags=["sources"])


async def _get_source_or_404(source_id: UUID, session: AsyncSession) -> Source:
    statement = select(Source).where(Source.id == source_id)
    source = (await session.execute(statement)).scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found.",
        )
    return source


@router.get("", response_model=list[SourceResponse], status_code=status.HTTP_200_OK)
async def list_sources(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> list[SourceResponse]:
    statement = select(Source).order_by(Source.created_at.desc())
    sources = (await session.execute(statement)).scalars().all()
    return [SourceResponse.model_validate(source) for source in sources]


@router.post("", response_model=SourceResponse, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: SourceCreateRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> SourceResponse:
    source_id = uuid4()
    api_key_vault_path = None
    if payload.api_key:
        api_key_vault_path = f"secret/sources/{source_id}"

    source = Source(
        id=source_id,
        name=payload.name,
        type=payload.type,
        url=payload.url,
        polling_interval_minutes=payload.polling_interval_minutes,
        is_active=payload.is_active,
        api_key_vault_path=api_key_vault_path,
    )
    session.add(source)
    await session.commit()

    if payload.api_key and source.api_key_vault_path:
        try:
            write_secret(source.api_key_vault_path, {"api_key": payload.api_key})
        except Exception as exc:
            try:
                await session.delete(source)
                await session.commit()
            except SQLAlchemyError:
                await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to persist the source API key to Vault.",
            ) from exc

    await session.refresh(source)
    return SourceResponse.model_validate(source)


@router.get("/{source_id}", response_model=SourceResponse, status_code=status.HTTP_200_OK)
async def get_source(
    source_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> SourceResponse:
    source = await _get_source_or_404(source_id, session)
    return SourceResponse.model_validate(source)


@router.patch("/{source_id}", response_model=SourceResponse, status_code=status.HTTP_200_OK)
async def update_source(
    source_id: UUID,
    payload: SourceUpdateRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> SourceResponse:
    source = await _get_source_or_404(source_id, session)
    updates = payload.model_dump(exclude_unset=True)
    api_key = updates.pop("api_key", None)
    for field_name, field_value in updates.items():
        setattr(source, field_name, field_value)

    await session.commit()

    if api_key:
        if not source.api_key_vault_path:
            source.api_key_vault_path = f"secret/sources/{source.id}"
            await session.commit()
        try:
            write_secret(source.api_key_vault_path, {"api_key": api_key})
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to update the source API key in Vault.",
            ) from exc

    await session.refresh(source)
    return SourceResponse.model_validate(source)
