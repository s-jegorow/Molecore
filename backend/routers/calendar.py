from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import CalendarEvent
from schemas import CalendarEventCreate, CalendarEventResponse, CalendarEventUpdate

router = APIRouter()

VALID_EVENT_COLORS = {"gray", "red", "orange", "green", "blue", "purple"}


@router.get("/api/calendar", response_model=List[CalendarEventResponse])
def get_calendar_events(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not (1900 <= year <= 2100):
        raise HTTPException(status_code=400, detail="Year must be between 1900 and 2100")
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Month must be between 1 and 12")
    user_id = current_user.get("user_id")
    prefix = f"{year}-{str(month).zfill(2)}-"
    events = db.query(CalendarEvent).filter(
        CalendarEvent.user_id == user_id,
        CalendarEvent.date.like(f"{prefix}%")
    ).order_by(CalendarEvent.date, CalendarEvent.created_at).all()
    return events


@router.post("/api/calendar", response_model=CalendarEventResponse)
def create_calendar_event(
    data: CalendarEventCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    color = data.color if data.color in VALID_EVENT_COLORS else "gray"
    event = CalendarEvent(
        user_id=user_id,
        date=data.date,
        title=data.title,
        time=data.time or None,
        color=color
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.put("/api/calendar/{event_id}", response_model=CalendarEventResponse)
def update_calendar_event(
    event_id: int,
    data: CalendarEventUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == user_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if data.title is not None:
        event.title = data.title
    if data.time is not None:
        event.time = data.time or None
    if data.color is not None:
        event.color = data.color if data.color in VALID_EVENT_COLORS else "gray"
    db.commit()
    db.refresh(event)
    return event


@router.delete("/api/calendar/{event_id}")
def delete_calendar_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    event = db.query(CalendarEvent).filter(
        CalendarEvent.id == event_id,
        CalendarEvent.user_id == user_id
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
    return {"ok": True}
