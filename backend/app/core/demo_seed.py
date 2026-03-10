"""
Demo seed — tworzy/resetuje konto demo z przykładowymi danymi.

Wywoływane:
- przy starcie aplikacji (idempotentnie)
- co godzinę przez APScheduler
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.activity_template import ActivityTemplate
from app.models.eisenhower_task import EisenhowerTask
from app.models.event import Event
from app.models.refresh_token import RefreshToken
from app.models.user import User


def _monday_of_current_week() -> datetime:
    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _ev(
    user_id: int,
    title: str,
    day_offset: int,
    start_h: int,
    start_m: int,
    duration_min: int,
    color: str,
    icon: str,
    is_background: bool = False,
) -> Event:
    base = _monday_of_current_week()
    start = base + timedelta(days=day_offset, hours=start_h, minutes=start_m)
    end = start + timedelta(minutes=duration_min)
    return Event(
        title=title,
        start_datetime=start,
        end_datetime=end,
        color=color,
        icon=icon,
        is_background=is_background,
        user_id=user_id,
    )


DEMO_LOCK_ID = 20250308  # unikalne ID blokady PostgreSQL advisory lock


def reset_demo_data(db: Session) -> None:
    """Kasuje i odtwarza wszystkie dane konta demo. Idempotentne.

    Używa pg_try_advisory_lock żeby przy --reload (2 procesy) tylko jeden
    wykonał reset — drugi go spokojnie pomija.
    """

    # Próbuj zdobyć advisory lock — jeśli inny process już go trzyma, wróć
    locked = db.execute(
        text("SELECT pg_try_advisory_lock(:id)"),
        {"id": DEMO_LOCK_ID},
    ).scalar()
    if not locked:
        return  # inny worker właśnie robi reset, pomijamy

    try:
        _do_reset(db)
    finally:
        db.execute(
            text("SELECT pg_advisory_unlock(:id)"),
            {"id": DEMO_LOCK_ID},
        )


def _do_reset(db: Session) -> None:
    """Właściwa logika resetu — wywoływana tylko przez właściciela locka."""

    # 1. Znajdź lub utwórz usera demo
    user = db.query(User).filter(User.email == settings.DEMO_EMAIL).first()
    if not user:
        user = User(
            email=settings.DEMO_EMAIL,
            hashed_password=get_password_hash(settings.DEMO_PASSWORD),
            is_admin=False,
            is_demo=True,
        )
        db.add(user)
        db.flush()  # żeby dostać user.id
    elif not user.is_demo:
        # Ustaw flagę jeśli konto istnieje ale jeszcze nie miało flagi
        user.is_demo = True

    uid = user.id

    # 2. Usuń stare dane (CASCADE przez SQLAlchemy nie działa dla bulk delete)
    db.query(RefreshToken).filter(RefreshToken.user_id == uid).delete()
    db.query(Event).filter(Event.user_id == uid).delete()
    db.query(ActivityTemplate).filter(ActivityTemplate.user_id == uid).delete()
    db.query(EisenhowerTask).filter(EisenhowerTask.user_id == uid).delete()

    # 3. Szablony aktywności
    templates = [
        ActivityTemplate(
            name="Siłownia",
            color="#10b981",
            icon="🏋️",
            default_duration=60,
            is_background=False,
            user_id=uid,
        ),
        ActivityTemplate(
            name="Deep work",
            color="#f59e0b",
            icon="🧠",
            default_duration=90,
            is_background=False,
            user_id=uid,
        ),
        ActivityTemplate(
            name="Spotkanie",
            color="#6366f1",
            icon="👥",
            default_duration=45,
            is_background=False,
            user_id=uid,
        ),
        ActivityTemplate(
            name="Przerwa",
            color="#3b82f6",
            icon="☕",
            default_duration=15,
            is_background=True,
            user_id=uid,
        ),
    ]
    db.add_all(templates)

    # 4. Zadania Eisenhowera
    tasks = [
        EisenhowerTask(
            title="Przygotować prezentację na jutro",
            urgent=True,
            important=True,
            status="in_progress",
            user_id=uid,
        ),
        EisenhowerTask(
            title="Zaplanować cele na kwartał",
            urgent=False,
            important=True,
            status="todo",
            user_id=uid,
        ),
        EisenhowerTask(
            title="Odpisać na wiadomości",
            urgent=True,
            important=False,
            status="todo",
            user_id=uid,
        ),
        EisenhowerTask(
            title="Posprzątać skrzynkę mailową",
            urgent=False,
            important=False,
            status="todo",
            user_id=uid,
        ),
    ]
    db.add_all(tasks)

    # 5. Eventy na bieżący tydzień
    events = [
        _ev(uid, "Siłownia", 0, 7, 0, 60, "#10b981", "🏋️"),
        _ev(uid, "Deep work — ChronoGrid", 0, 9, 0, 120, "#f59e0b", "🧠"),
        _ev(uid, "Lunch", 0, 13, 0, 45, "#3b82f6", "🍽️"),
        _ev(uid, "Code review", 0, 15, 0, 60, "#6366f1", "💻"),
        _ev(uid, "Stand-up", 1, 9, 30, 30, "#6366f1", "👥"),
        _ev(uid, "Planowanie tygodnia", 1, 11, 0, 60, "#8b5cf6", "📋"),
        _ev(uid, "Spotkanie z klientem", 2, 10, 0, 90, "#ec4899", "🤝"),
        _ev(uid, "Deep work", 2, 14, 0, 120, "#f59e0b", "🧠"),
        _ev(uid, "Siłownia", 3, 7, 0, 60, "#10b981", "🏋️"),
        _ev(uid, "Przegląd PR-ów", 3, 10, 0, 45, "#6366f1", "💻"),
        _ev(uid, "Retrospektywa", 3, 15, 0, 60, "#ef4444", "🔄"),
        _ev(uid, "Deep work", 4, 9, 0, 180, "#f59e0b", "🧠"),
        _ev(uid, "Relaks / sport", 5, 10, 0, 90, "#10b981", "🏃"),
        _ev(uid, "Planowanie na nowy tydzień", 6, 18, 0, 60, "#8b5cf6", "📋"),
    ]
    db.add_all(events)

    db.commit()
