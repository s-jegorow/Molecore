import json
import random
from typing import List, Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from database import get_db
from demo_content import DEMO_PAGES_SEED, DEMO_USER_ID
from models import Page
from routers.pages import page_to_dict, search_pages
from schemas import CalendarEventCreate, CalendarEventUpdate, PageCreate, PageUpdate

router = APIRouter()

FAKE_DATE = "2024-01-01T00:00:00"


def seed_demo_pages(db: Session) -> None:
    already_seeded = db.query(Page).filter(
        Page.user_id == DEMO_USER_ID
    ).first()
    if already_seeded:
        return
    for pd in DEMO_PAGES_SEED:
        db.add(Page(
            title=pd["title"],
            content=json.dumps(pd["content"]),
            parent_id=None,
            page_type=pd["page_type"],
            icon=pd.get("icon"),
            header=pd.get("header"),
            order=pd["order"],
            user_id=DEMO_USER_ID,
        ))
    db.commit()


def _demo_pages(db: Session) -> List[Page]:
    return db.query(Page).filter(
        Page.user_id == DEMO_USER_ID,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()


def _fake_page(
    page_id: int,
    title: Optional[str] = None,
    content: Optional[dict] = None,
    parent_id: Optional[int] = None,
    page_type: Optional[str] = None,
    icon: Optional[str] = None,
    order: Optional[int] = None,
) -> dict:
    return {
        "id": page_id,
        "title": title or "Untitled",
        "content": content or {"blocks": []},
        "parent_id": parent_id,
        "page_type": page_type or "normal",
        "icon": icon,
        "header": None,
        "order": order or 0,
        "user_id": DEMO_USER_ID,
        "created_at": FAKE_DATE,
        "updated_at": FAKE_DATE,
    }


@router.get("/api/demo/pages")
def demo_get_pages(db: Session = Depends(get_db)):
    return [page_to_dict(p, include_content=False) for p in _demo_pages(db)]


@router.get("/api/demo/search")
def demo_search(q: str = "", db: Session = Depends(get_db)):
    return search_pages(_demo_pages(db), q[:200])


@router.get("/api/demo/pages/{page_id}")
def demo_get_page(page_id: int, db: Session = Depends(get_db)):
    page = db.query(Page).filter(
        Page.id == page_id, Page.user_id == DEMO_USER_ID
    ).first()
    if not page:
        return _fake_page(page_id)
    return page_to_dict(page)


@router.post("/api/demo/pages")
def demo_create_page(page_data: PageCreate):
    return _fake_page(
        random.randint(8000000, 8999999),
        title=page_data.title,
        content=page_data.content,
        parent_id=page_data.parent_id,
        page_type=page_data.page_type,
        icon=page_data.icon,
        order=page_data.order,
    )


@router.put("/api/demo/pages/{page_id}")
def demo_update_page(page_id: int, page_data: PageUpdate, db: Session = Depends(get_db)):
    page = db.query(Page).filter(
        Page.id == page_id, Page.user_id == DEMO_USER_ID
    ).first()
    if page:
        return page_to_dict(page)
    return _fake_page(
        page_id,
        title=page_data.title,
        content=page_data.content,
        parent_id=page_data.parent_id,
        page_type=page_data.page_type,
        icon=page_data.icon,
        order=page_data.order,
    )


@router.delete("/api/demo/pages/{page_id}")
def demo_delete_page(page_id: int):
    return {"message": "Page deleted successfully"}


@router.get("/api/demo/notepad")
def demo_get_notepad():
    return _fake_page(9999901, title="Notepad", page_type="notepad", icon="📝", order=-1)


@router.get("/api/demo/todo")
def demo_get_todo():
    return _fake_page(9999902, title="Todo", page_type="todo", icon="✅", order=-2)


@router.get("/api/demo/preferences")
def demo_get_preferences():
    return {"dashboard_enabled": False}


@router.put("/api/demo/preferences")
async def demo_update_preferences(request: Request):
    return await request.json()


@router.get("/api/demo/calendar")
def demo_get_calendar():
    return []


@router.post("/api/demo/calendar")
def demo_create_calendar_event(data: CalendarEventCreate):
    return {"id": 9999903, "date": data.date, "title": data.title, "time": data.time, "color": data.color}


@router.put("/api/demo/calendar/{event_id}")
def demo_update_calendar_event(event_id: int, data: CalendarEventUpdate):
    return {"id": event_id, "date": "2024-01-01", "title": data.title or "", "time": data.time, "color": data.color}


@router.delete("/api/demo/calendar/{event_id}")
def demo_delete_calendar_event(event_id: int):
    return {"ok": True}
