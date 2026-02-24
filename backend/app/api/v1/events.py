from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.activity_template import ActivityTemplate
from app.models.eisenhower_task import EisenhowerTask
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventUpdate, EventOut

router = APIRouter(prefix="/events", tags=["events"])


# ── Schema dla eventów cyklicznych ────────────────────────────────────────────
class RecurringEventCreate(BaseModel):
    title: str
    start_datetime: datetime
    end_datetime: datetime
    description: Optional[str] = None
    location: Optional[str] = None
    activity_template_id: Optional[int] = None
    # Powtarzanie: interval_days = co ile dni generować wystąpienia
    interval_days: int  # np. 7 = co tydzień, 30 = co miesiąc, 365 = co rok
    occurrences: int  # ile wystąpień wygenerować (max 730)


@router.get("", response_model=List[EventOut])
def list_events(
    week_start: Optional[str] = Query(None, description="YYYY-MM-DD of week start"),
    days: Optional[int] = Query(
        None, description="Number of days to fetch (default 7)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(Event)
        .options(joinedload(Event.activity_template))
        .filter(Event.user_id == current_user.id)
    )
    if week_start:
        try:
            start = datetime.fromisoformat(week_start).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid week_start format")
        num_days = max(1, min(days, 366)) if days else 7
        end = start + timedelta(days=num_days)
        q = q.filter(Event.start_datetime >= start, Event.start_datetime < end)
    return q.order_by(Event.start_datetime).all()


@router.post("", response_model=EventOut, status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = Event(**payload.model_dump(), user_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
    # Reload with relationship
    return db.query(Event).options(joinedload(Event.activity_template)).get(event.id)


@router.get("/{event_id}", response_model=EventOut)
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = (
        db.query(Event)
        .options(joinedload(Event.activity_template))
        .filter(Event.id == event_id, Event.user_id == current_user.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.put("/{event_id}", response_model=EventOut)
def update_event(
    event_id: int,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = (
        db.query(Event)
        .filter(Event.id == event_id, Event.user_id == current_user.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)

    # Dwukierunkowa synchronizacja opisu: event → szablon → pozostałe eventy
    if "description" in update_data and event.activity_template_id:
        new_desc = update_data["description"]
        # Zaktualizuj szablon
        (
            db.query(ActivityTemplate)
            .filter(
                ActivityTemplate.id == event.activity_template_id,
                ActivityTemplate.user_id == current_user.id,
            )
            .update(
                {ActivityTemplate.description: new_desc},
                synchronize_session="fetch",
            )
        )
        # Zaktualizuj pozostałe eventy z tego szablonu
        (
            db.query(Event)
            .filter(
                Event.activity_template_id == event.activity_template_id,
                Event.user_id == current_user.id,
                Event.id != event_id,
            )
            .update(
                {Event.description: new_desc},
                synchronize_session="fetch",
            )
        )

    db.commit()
    db.refresh(event)
    return db.query(Event).options(joinedload(Event.activity_template)).get(event.id)


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = (
        db.query(Event)
        .filter(Event.id == event_id, Event.user_id == current_user.id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()


@router.post("/recurring", response_model=List[EventOut], status_code=201)
def create_recurring_events(
    payload: RecurringEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generuje serię powtarzających się wydarzeń (wiele wierszy w DB)."""
    if payload.interval_days < 1:
        raise HTTPException(status_code=400, detail="interval_days must be >= 1")
    occurrences = min(payload.occurrences, 730)
    if occurrences < 1:
        raise HTTPException(status_code=400, detail="occurrences must be >= 1")

    duration = payload.end_datetime - payload.start_datetime
    recurrence_label = f"INTERVAL_DAYS={payload.interval_days}"

    created = []
    for i in range(occurrences):
        delta = timedelta(days=payload.interval_days * i)
        event = Event(
            title=payload.title,
            start_datetime=payload.start_datetime + delta,
            end_datetime=payload.end_datetime + delta,
            description=payload.description,
            location=payload.location,
            activity_template_id=payload.activity_template_id,
            recurrence_rule=recurrence_label,
            user_id=current_user.id,
        )
        db.add(event)
        created.append(event)

    db.commit()
    for ev in created:
        db.refresh(ev)

    ids = [ev.id for ev in created]
    return (
        db.query(Event)
        .options(joinedload(Event.activity_template))
        .filter(Event.id.in_(ids))
        .order_by(Event.start_datetime)
        .all()
    )


@router.post("/from-task/{task_id}", response_model=EventOut, status_code=201)
def create_event_from_task(
    task_id: int,
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = (
        db.query(EisenhowerTask)
        .filter(
            EisenhowerTask.id == task_id,
            EisenhowerTask.user_id == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    event = Event(**payload.model_dump(), user_id=current_user.id)
    if not event.title:
        event.title = task.title
    db.add(event)
    db.flush()

    task.linked_event_id = event.id
    db.commit()
    db.refresh(event)
    return db.query(Event).options(joinedload(Event.activity_template)).get(event.id)
