from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.base import get_db
from app.models.activity_template import ActivityTemplate
from app.models.contact import Contact
from app.models.eisenhower_task import EisenhowerTask
from app.models.event import Event
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

# Limity zasobów dla konta demo
DEMO_QUOTAS: dict[str, int] = {
    "event": 30,  # seed daje 14 — zostaje miejsce na interakcję
    "template": 8,  # seed daje 4
    "task": 12,  # seed daje 4
    "contact": 5,
}

_DEMO_MODELS = {
    "event": Event,
    "template": ActivityTemplate,
    "task": EisenhowerTask,
    "contact": Contact,
}


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id: int = int(payload.get("sub", 0))
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def check_demo_quota(user: User, db: Session, resource: str) -> None:
    """Rzuca HTTP 403 jeśli konto demo osiągnęło limit dla danego zasobu.

    Dla zwykłych użytkowników nie robi nic.

    Args:
        user:     aktualnie zalogowany użytkownik
        db:       sesja bazy danych
        resource: klucz zasobu — "event" | "template" | "task" | "contact"
    """
    if not user.is_demo:
        return
    model = _DEMO_MODELS[resource]
    limit = DEMO_QUOTAS[resource]
    count: int = (
        db.query(func.count(model.id)).filter(model.user_id == user.id).scalar()
    )
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tryb demo: osiągnięto limit {limit} dla tego zasobu.",
        )


def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
