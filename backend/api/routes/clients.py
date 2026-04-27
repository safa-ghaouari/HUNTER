import asyncio
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.password import get_password_hash
from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.integrations.vault_client import delete_secret, read_secret, write_secret
from backend.models.client import Client
from backend.models.enums import ConnectionType
from backend.models.user import User, UserRole
from backend.schemas.client import ClientCreateRequest, ClientResponse, ClientUpdateRequest
from backend.schemas.user import ClientUserCreateRequest, ClientUserResponse

router = APIRouter(prefix="/admin/clients", tags=["clients"])


async def _get_client_or_404(client_id: UUID, session: AsyncSession) -> Client:
    statement = select(Client).where(Client.id == client_id)
    client = (await session.execute(statement)).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found.",
        )
    return client


async def _get_active_client_or_404(client_id: UUID, session: AsyncSession) -> Client:
    client = await _get_client_or_404(client_id, session)
    if not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Client is inactive.",
        )
    return client


def _build_vault_secret(payload: ClientCreateRequest | ClientUpdateRequest, existing: dict | None = None) -> dict:
    """Merge connection credentials into a single Vault secret dict."""
    secret = dict(existing or {})
    if isinstance(payload, ClientCreateRequest) and payload.api_key:
        secret["api_key"] = payload.api_key
    if payload.openvas_username is not None:
        secret["openvas_username"] = payload.openvas_username
    if payload.openvas_password is not None:
        secret["openvas_password"] = payload.openvas_password
    if payload.secureworks_client_id is not None:
        secret["secureworks_client_id"] = payload.secureworks_client_id
    if payload.secureworks_client_secret is not None:
        secret["secureworks_client_secret"] = payload.secureworks_client_secret
    return secret


@router.get("", response_model=list[ClientResponse], status_code=status.HTTP_200_OK)
async def list_clients(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> list[ClientResponse]:
    statement = select(Client).order_by(Client.created_at.desc())
    clients = (await session.execute(statement)).scalars().all()
    return [ClientResponse.model_validate(client) for client in clients]


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreateRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientResponse:
    client_id = uuid4()
    vault_path = f"secret/clients/{client_id}"
    client = Client(
        id=client_id,
        name=payload.name,
        vpn_ip=payload.vpn_ip,
        api_key_vault_path=vault_path,
        connection_type=payload.connection_type.value if payload.connection_type else None,
        openvas_url=payload.openvas_url,
        secureworks_url=payload.secureworks_url,
    )

    session.add(client)
    try:
        await session.flush()
        write_secret(vault_path, _build_vault_secret(payload))
        await session.commit()
        await session.refresh(client)
    except Exception as exc:
        await session.rollback()
        try:
            delete_secret(vault_path)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create client and persist the Vault secret.",
        ) from exc

    return ClientResponse.model_validate(client)


@router.get("/{client_id}", response_model=ClientResponse, status_code=status.HTTP_200_OK)
async def get_client(
    client_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientResponse:
    client = await _get_client_or_404(client_id, session)
    return ClientResponse.model_validate(client)


@router.patch("/{client_id}", response_model=ClientResponse, status_code=status.HTTP_200_OK)
async def update_client(
    client_id: UUID,
    payload: ClientUpdateRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientResponse:
    client = await _get_active_client_or_404(client_id, session)

    if payload.name is not None:
        client.name = payload.name
    if payload.vpn_ip is not None:
        client.vpn_ip = payload.vpn_ip
    if payload.connection_type is not None:
        client.connection_type = payload.connection_type.value
    if payload.openvas_url is not None:
        client.openvas_url = payload.openvas_url
    if payload.secureworks_url is not None:
        client.secureworks_url = payload.secureworks_url

    has_new_creds = any([
        payload.openvas_username, payload.openvas_password,
        payload.secureworks_client_id, payload.secureworks_client_secret,
    ])
    if has_new_creds:
        try:
            existing_secret = read_secret(client.api_key_vault_path) or {}
        except Exception:
            existing_secret = {}
        write_secret(client.api_key_vault_path, _build_vault_secret(payload, existing_secret))

    await session.commit()
    await session.refresh(client)
    return ClientResponse.model_validate(client)


@router.delete("/{client_id}", response_model=ClientResponse, status_code=status.HTTP_200_OK)
async def delete_client(
    client_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientResponse:
    client = await _get_client_or_404(client_id, session)
    client.is_active = False
    await session.commit()
    await session.refresh(client)
    return ClientResponse.model_validate(client)


@router.get("/{client_id}/users", response_model=list[ClientUserResponse], status_code=status.HTTP_200_OK)
async def list_client_users(
    client_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> list[ClientUserResponse]:
    await _get_client_or_404(client_id, session)
    statement = (
        select(User)
        .where(User.client_id == client_id, User.role == UserRole.CLIENT)
        .order_by(User.created_at.desc())
    )
    users = (await session.execute(statement)).scalars().all()
    return [ClientUserResponse.model_validate(user) for user in users]


@router.post(
    "/{client_id}/users",
    response_model=ClientUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_client_user(
    client_id: UUID,
    payload: ClientUserCreateRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientUserResponse:
    await _get_active_client_or_404(client_id, session)

    normalized_email = payload.email.lower()
    existing_user_statement = select(User).where(User.email == normalized_email)
    existing_user = (await session.execute(existing_user_statement)).scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = User(
        email=normalized_email,
        hashed_password=get_password_hash(payload.password),
        role=UserRole.CLIENT,
        client_id=client_id,
        is_active=payload.is_active,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return ClientUserResponse.model_validate(user)


@router.post(
    "/{client_id}/test-connection",
    status_code=status.HTTP_200_OK,
)
async def test_client_connection(
    client_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> dict:
    """Verify that HUNTER can reach the client's security environment."""
    client = await _get_active_client_or_404(client_id, session)

    if not client.connection_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No connection_type configured for this client.",
        )

    conn_type = client.connection_type

    if conn_type == ConnectionType.OPENVAS.value:
        if not client.openvas_url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="openvas_url is not set for this client.",
            )
        try:
            from backend.integrations.openvas_client import pull_scan_results_for_client
            results = await asyncio.to_thread(
                pull_scan_results_for_client,
                client.api_key_vault_path,
                client.openvas_url,
            )
            return {
                "status": "ok",
                "connection_type": conn_type,
                "findings_count": len(results),
                "message": f"Connected to OpenVAS — {len(results)} findings returned.",
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenVAS connection failed: {exc}",
            ) from exc

    if conn_type == ConnectionType.SECUREWORKS.value:
        try:
            from backend.integrations.secureworks_client import pull_alerts_for_client
            alerts = await asyncio.to_thread(
                pull_alerts_for_client,
                client.api_key_vault_path,
                client.secureworks_url,
            )
            return {
                "status": "ok",
                "connection_type": conn_type,
                "alerts_count": len(alerts),
                "message": f"Connected to Secureworks Taegis XDR — {len(alerts)} open alerts returned.",
            }
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Secureworks connection failed: {exc}",
            ) from exc

    return {
        "status": "ok",
        "connection_type": conn_type,
        "message": "On-premise connection type — no automated probe available.",
    }
