from datetime import datetime, timezone, timedelta
from typing import List, Optional
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from icalendar import Calendar, Event as ICalEvent, vDatetime, vText

from app.api.deps import get_current_user, check_demo_quota
from app.db.base import get_db
from app.models.activity_template import ActivityTemplate
from app.models.eisenhower_task import EisenhowerTask
from app.models.event import Event
from app.models.user import User
from app.schemas.event import EventCreate, EventUpdate, EventOut

router = APIRouter(prefix="/events", tags=["events"])

# ── Limity importu ────────────────────────────────────────────────────────────
MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_IMPORT_EVENTS = 1000


# ── Schema dla eventów cyklicznych ────────────────────────────────────────────
class RecurringEventCreate(BaseModel):
    title: str = Field(..., max_length=200)
    start_datetime: datetime
    end_datetime: datetime
    description: Optional[str] = Field(None, max_length=10_000)
    location: Optional[str] = Field(None, max_length=200)
    activity_template_id: Optional[int] = None
    interval_days: int = Field(..., ge=1)
    occurrences: int = Field(..., ge=1, le=104)  # max 2 lata tygodniowo


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
    check_demo_quota(current_user, db, "event")
    event = Event(**payload.model_dump(), user_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
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
        (
            db.query(ActivityTemplate)
            .filter(
                ActivityTemplate.id == event.activity_template_id,
                ActivityTemplate.user_id == current_user.id,
            )
            .update(
                {ActivityTemplate.description: new_desc}, synchronize_session="fetch"
            )
        )
        (
            db.query(Event)
            .filter(
                Event.activity_template_id == event.activity_template_id,
                Event.user_id == current_user.id,
                Event.id != event_id,
            )
            .update({Event.description: new_desc}, synchronize_session="fetch")
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
    """Generuje serię powtarzających się wydarzeń (max 104 wystąpienia)."""
    check_demo_quota(current_user, db, "event")

    recurrence_label = f"INTERVAL_DAYS={payload.interval_days}"
    created = []
    for i in range(payload.occurrences):
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


@router.get("/export.ics")
def export_events_ics(
    from_date: Optional[str] = Query(
        None, description="YYYY-MM-DD, start of range (inclusive)"
    ),
    to_date: Optional[str] = Query(
        None, description="YYYY-MM-DD, end of range (inclusive)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Eksportuje wydarzenia użytkownika do pliku .ics (iCalendar)."""
    q = db.query(Event).filter(Event.user_id == current_user.id)

    if from_date:
        try:
            start = datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc)
            q = q.filter(Event.start_datetime >= start)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid from_date format, expected YYYY-MM-DD"
            )

    if to_date:
        try:
            end = datetime.fromisoformat(to_date).replace(
                tzinfo=timezone.utc
            ) + timedelta(days=1)
            q = q.filter(Event.start_datetime < end)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="Invalid to_date format, expected YYYY-MM-DD"
            )

    events = q.order_by(Event.start_datetime).all()

    cal = Calendar()
    cal.add("prodid", "-//ChronoGrid//chronogrid//PL")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", vText(f"{current_user.email} – ChronoGrid"))

    for ev in events:
        ical_ev = ICalEvent()
        ical_ev.add("uid", f"event-{ev.id}@chronogrid")
        ical_ev.add("summary", vText(ev.title))
        ical_ev.add("dtstart", vDatetime(ev.start_datetime))
        ical_ev.add("dtend", vDatetime(ev.end_datetime))
        ical_ev.add("dtstamp", vDatetime(datetime.now(timezone.utc)))
        if ev.description:
            ical_ev.add("description", vText(ev.description))
        if ev.location:
            ical_ev.add("location", vText(ev.location))
        if ev.color:
            ical_ev.add("x-apple-calendar-color", vText(ev.color))
        cal.add_component(ical_ev)

    ics_bytes = cal.to_ical()
    return StreamingResponse(
        BytesIO(ics_bytes),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=chronogrid.ics"},
    )


@router.post("/import", status_code=201)
def import_events_ics(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importuje wydarzenia z pliku .ics. Zwraca listę utworzonych eventów."""
    # Blokada dla demo
    if current_user.is_demo:
        raise HTTPException(
            status_code=403,
            detail="Tryb demo: import plików jest niedozwolony.",
        )

    # Walidacja content-type
    if file.content_type not in (
        "text/calendar",
        "application/octet-stream",
        "text/plain",
    ) and not (file.filename or "").endswith(".ics"):
        raise HTTPException(status_code=400, detail="Plik musi być w formacie .ics")

    # Sprawdzenie rozmiaru przez Content-Length przed odczytem
    if file.size and file.size > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Plik .ics zbyt duży (max {MAX_IMPORT_FILE_SIZE // (1024 * 1024)} MB).",
        )

    try:
        raw = file.file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Nie udało się odczytać pliku.")

    # Podwójne sprawdzenie po odczycie (gdy brak Content-Length)
    if len(raw) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Plik .ics zbyt duży (max {MAX_IMPORT_FILE_SIZE // (1024 * 1024)} MB).",
        )

    try:
        cal = Calendar.from_ical(raw)
    except Exception:
        raise HTTPException(
            status_code=400, detail="Nie udało się sparsować pliku .ics"
        )

    # Limit liczby eventów w pliku — przed insertami
    vevents = [c for c in cal.walk() if c.name == "VEVENT"]
    if len(vevents) > MAX_IMPORT_EVENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Za dużo eventów w pliku (max {MAX_IMPORT_EVENTS}).",
        )

    created_events = []
    skipped = 0

    for component in vevents:
        try:
            summary = str(component.get("summary", "Bez tytułu"))
            dtstart = component.get("dtstart")
            dtend = component.get("dtend")

            if dtstart is None:
                skipped += 1
                continue

            start_dt = dtstart.dt
            if not isinstance(start_dt, datetime):
                start_dt = datetime(
                    start_dt.year,
                    start_dt.month,
                    start_dt.day,
                    0,
                    0,
                    tzinfo=timezone.utc,
                )

            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=timezone.utc)

            if dtend is not None:
                end_dt = dtend.dt
                if not isinstance(end_dt, datetime):
                    end_dt = datetime(
                        end_dt.year,
                        end_dt.month,
                        end_dt.day,
                        23,
                        59,
                        tzinfo=timezone.utc,
                    )
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
            else:
                end_dt = start_dt + timedelta(hours=1)

            if end_dt <= start_dt:
                end_dt = start_dt + timedelta(hours=1)

            description = str(component.get("description", "") or "")
            location = str(component.get("location", "") or "")

            event = Event(
                title=summary[:200],
                start_datetime=start_dt,
                end_datetime=end_dt,
                description=description[:10_000] or None,
                location=location[:200] or None,
                user_id=current_user.id,
            )
            db.add(event)
            created_events.append(event)
        except Exception:
            skipped += 1
            continue

    db.commit()
    for ev in created_events:
        db.refresh(ev)

    return {
        "imported": len(created_events),
        "skipped": skipped,
        "event_ids": [ev.id for ev in created_events],
    }


@router.post("/from-task/{task_id}", response_model=EventOut, status_code=201)
def create_event_from_task(
    task_id: int,
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_demo_quota(current_user, db, "event")

    task = (
        db.query(EisenhowerTask)
        .filter(EisenhowerTask.id == task_id, EisenhowerTask.user_id == current_user.id)
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
