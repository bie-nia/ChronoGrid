from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

limiter = Limiter(key_func=get_remote_address)

from app.core.audit import AuditAction, log_event
from app.core.config import settings
from app.core.demo_seed import reset_demo_data
from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token_str,
    get_password_hash,
    validate_password_strength,
    verify_password,
)
from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.invite_token import InviteToken
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.user import (
    ChangePassword,
    RefreshRequest,
    TokenPair,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token_pair(user: User, request: Request, db: Session) -> TokenPair:
    """Tworzy access + refresh token, zapisuje refresh w bazie."""
    access = create_access_token({"sub": str(user.id)})
    refresh_str = create_refresh_token_str()

    ip = None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    elif request.client:
        ip = request.client.host

    db_refresh = RefreshToken(
        token=refresh_str,
        user_id=user.id,
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        issued_to_ip=ip,
    )
    db.add(db_refresh)
    db.commit()
    return TokenPair(access_token=access, refresh_token=refresh_str)


@router.post("/token", response_model=TokenPair)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        # Audit: nieudany login
        log_event(
            db,
            request,
            action=AuditAction.LOGIN_FAILURE,
            user_email=form_data.username,
            detail="Invalid credentials",
            commit=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    pair = _issue_token_pair(user, request, db)

    # Audit: udany login
    log_event(db, request, action=AuditAction.LOGIN_SUCCESS, user=user, commit=True)

    return pair


@router.post("/refresh", response_model=TokenPair)
@limiter.limit("20/minute")
def refresh_token(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Wymienia ważny refresh token na nową parę tokenów (rotation)."""
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token == payload.refresh_token,
            RefreshToken.revoked == False,  # noqa: E712
        )
        .first()
    )

    if not db_token or db_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(
        timezone.utc
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user = db.get(User, db_token.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Unieważnij stary token (rotation — jeden token jednorazowy)
    db_token.revoked = True
    db.commit()

    pair = _issue_token_pair(user, request, db)
    log_event(db, request, action=AuditAction.TOKEN_REFRESH, user=user, commit=True)
    return pair


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unieważnia refresh token (wylogowanie). Access token wygasa sam po 15 min."""
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token == payload.refresh_token,
            RefreshToken.user_id == current_user.id,
        )
        .first()
    )
    if db_token:
        db_token.revoked = True
        db.commit()

    log_event(db, request, action=AuditAction.LOGOUT, user=current_user, commit=True)


@router.post("/logout-all", status_code=204)
def logout_all(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unieważnia WSZYSTKIE refresh tokeny użytkownika (np. po kradzieży)."""
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == False,  # noqa: E712
    ).update({"revoked": True})
    db.commit()
    log_event(
        db, request, action=AuditAction.TOKEN_REVOKE_ALL, user=current_user, commit=True
    )


@router.post("/register", response_model=UserOut, status_code=201)
@limiter.limit("3/minute")
def register(
    request: Request,
    payload: UserRegister,
    db: Session = Depends(get_db),
):
    # Sprawdź token zaproszenia
    invite = (
        db.query(InviteToken)
        .filter(
            InviteToken.token == payload.invite_token,
            InviteToken.used == False,  # noqa: E712
        )
        .first()
    )
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used invite token",
        )

    # Sprawdź czy email nie jest już zajęty
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Walidacja siły hasła
    pw_error = validate_password_strength(payload.password)
    if pw_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pw_error)

    # Utwórz użytkownika
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()

    # Oznacz token jako użyty
    invite.used = True
    invite.used_by_user_id = user.id
    invite.used_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)

    log_event(db, request, action=AuditAction.REGISTER, user=user, commit=True)
    return user


@router.post("/demo", response_model=TokenPair)
@limiter.limit("5/minute")
def demo_login(
    request: Request,
    db: Session = Depends(get_db),
):
    """Zwraca tokeny dla konta demo — bez hasła. Resetuje dane do stanu początkowego."""
    # Reset danych przy każdym logowaniu — eventy zawsze na bieżący tydzień
    reset_demo_data(db)
    user = db.query(User).filter(User.email == settings.DEMO_EMAIL).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Demo account not initialized",
        )
    return _issue_token_pair(user, request, db)


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=204)
def change_password(
    request: Request,
    payload: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Blokada dla konta demo
    if current_user.is_demo:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tryb demo: zmiana hasła jest niedozwolona.",
        )
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    pw_error = validate_password_strength(payload.new_password)
    if pw_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pw_error)

    current_user.hashed_password = get_password_hash(payload.new_password)

    # Po zmianie hasła unieważnij WSZYSTKIE refresh tokeny — wymuś ponowne logowanie
    db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.revoked == False,  # noqa: E712
    ).update({"revoked": True})

    db.commit()
    log_event(
        db, request, action=AuditAction.PASSWORD_CHANGE, user=current_user, commit=True
    )
