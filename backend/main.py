import asyncio
import html
import io as _io
import json
import logging
import os
import random
import re
import tempfile as _tempfile
import time
import zipfile as _zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import Base, SessionLocal, engine, get_db
from demo_content import DEMO_PAGES_SEED, DEMO_USER_ID
from models import CalendarEvent, Page, UserPreferences
from uploads import (
    MAX_FILE_SIZE,
    MAX_USER_STORAGE,
    UPLOAD_DIR,
    UploadError,
    UploadStaticFiles,
    get_user_storage_usage,
    save_upload,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("molecore")


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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_demo_pages(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Molecore API", lifespan=lifespan)

_cors_origin = os.getenv("CORS_ORIGINS", "http://localhost")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_cors_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", UploadStaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def _load_content(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        content = json.loads(raw) if raw else {}
    except (json.JSONDecodeError, TypeError):
        content = {}
    if not isinstance(content, dict):
        content = {}
    content.setdefault("blocks", [])
    return content


def page_to_dict(page: Page, include_content: bool = True) -> dict:
    data = {
        "id": page.id,
        "title": page.title,
        "parent_id": page.parent_id,
        "page_type": page.page_type,
        "icon": page.icon,
        "header": page.header,
        "order": page.order,
        "user_id": page.user_id,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
    }
    if include_content:
        data["content"] = _load_content(page.content)
    return data


class PageCreate(BaseModel):
    title: str = Field(..., max_length=500)
    content: dict
    parent_id: Optional[int] = None
    page_type: Optional[str] = "normal"
    icon: Optional[str] = Field(None, max_length=200)
    header: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = 0

VALID_PAGE_TYPES = {"home", "favorite", "normal", "template", "notepad", "todo"}
ASSIGNABLE_PAGE_TYPES = VALID_PAGE_TYPES - {"home"}

VALID_EVENT_COLORS = {"gray", "red", "orange", "green", "blue", "purple"}

class CalendarEventCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    title: str = Field(..., min_length=1, max_length=500)
    time: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = "gray"

class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    time: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = None

class CalendarEventResponse(BaseModel):
    id: int
    date: str
    title: str
    time: Optional[str]
    color: Optional[str]

class PageUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content: Optional[dict] = None
    parent_id: Optional[int] = None
    page_type: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=200)
    header: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = None

class PageMeta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    parent_id: Optional[int]
    page_type: str
    icon: Optional[str]
    header: Optional[str]
    order: int
    user_id: str
    created_at: Optional[str]
    updated_at: Optional[str]

class PageResponse(PageMeta):
    content: dict

class SearchResult(BaseModel):
    id: int
    title: str
    parent_id: Optional[int]
    icon: Optional[str]
    page_type: str
    snippet: Optional[str]


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/pages", response_model=List[PageMeta])
def get_pages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()

    if not pages:
        home_page = Page(
            title="Dashboard",
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [
                    {
                        "type": "paragraph",
                        "data": {
                            "text": "This is your home page. You can customize it however you like."
                        }
                    }
                ],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type="home",
            icon=None,
            header=None,
            order=0,
            user_id=user_id
        )
        db.add(home_page)
        db.commit()
        db.refresh(home_page)
        pages = [home_page]

    return [page_to_dict(p, include_content=False) for p in pages]


_TAG_RE = re.compile(r"<[^>]*>")


def _strip_html(text: str) -> str:
    return html.unescape(_TAG_RE.sub("", text or ""))


def _list_item_texts(items) -> List[str]:
    texts: List[str] = []
    for item in items or []:
        if isinstance(item, str):
            texts.append(item)
        elif isinstance(item, dict):
            texts.append(str(item.get("content") or item.get("text") or ""))
            texts.extend(_list_item_texts(item.get("items")))
    return texts


def _block_text(block: dict) -> str:
    data = block.get("data") if isinstance(block, dict) else None
    if not isinstance(data, dict):
        return ""
    if isinstance(data.get("text"), str):
        return data["text"]
    if isinstance(data.get("items"), list):
        return " ".join(_list_item_texts(data["items"]))
    if isinstance(data.get("code"), str):
        return data["code"]
    if isinstance(data.get("content"), list):
        return " ".join(str(cell) for row in data["content"] if isinstance(row, list) for cell in row)
    if isinstance(data.get("pageTitle"), str):
        return data["pageTitle"]
    return ""


def search_pages(pages: List[Page], query: str, limit: int = 50) -> List[dict]:
    q = query.strip().lower()
    if not q:
        return []
    title_hits: List[dict] = []
    content_hits: List[dict] = []
    for page in pages:
        base = {
            "id": page.id,
            "title": page.title,
            "parent_id": page.parent_id,
            "icon": page.icon,
            "page_type": page.page_type,
            "snippet": None,
        }
        if q in (page.title or "").lower():
            title_hits.append(base)
            continue
        for block in _load_content(page.content).get("blocks", []):
            text = _strip_html(_block_text(block))
            idx = text.lower().find(q)
            if idx >= 0:
                start = max(0, idx - 30)
                end = min(len(text), idx + len(q) + 50)
                base["snippet"] = ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else "")
                content_hits.append(base)
                break
    return (title_hits + content_hits)[:limit]


@app.get("/api/search", response_model=List[SearchResult])
def search(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()
    return search_pages(pages, q[:200])


@app.get("/api/pages/{page_id}", response_model=PageResponse)
def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return page_to_dict(page)

@app.post("/api/pages", response_model=PageResponse)
def create_page(
    page_data: PageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    if page_data.page_type and page_data.page_type not in ASSIGNABLE_PAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page_type. Must be one of: {', '.join(sorted(ASSIGNABLE_PAGE_TYPES))}"
        )

    if page_data.parent_id is not None:
        parent = db.query(Page).filter(
            Page.id == page_data.parent_id,
            Page.user_id == user_id
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent page not found")

    new_page = Page(
        title=page_data.title,
        content=json.dumps(page_data.content),
        parent_id=page_data.parent_id,
        page_type=page_data.page_type or "normal",
        icon=page_data.icon,
        header=page_data.header,
        order=page_data.order or 0,
        user_id=user_id
    )

    db.add(new_page)
    db.commit()
    db.refresh(new_page)

    return page_to_dict(new_page)

@app.put("/api/pages/{page_id}", response_model=PageResponse)
def update_page(
    page_id: int,
    page_data: PageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if page_data.page_type is not None and page_data.page_type != page.page_type:
        if page.page_type == "home" or page_data.page_type not in ASSIGNABLE_PAGE_TYPES:
            raise HTTPException(status_code=400, detail="Invalid page_type change")

    if page_data.parent_id is not None:
        parent = db.query(Page).filter(
            Page.id == page_data.parent_id,
            Page.user_id == user_id
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent page not found")
        if page_data.parent_id == page_id or would_create_cycle(db, page_id, page_data.parent_id, user_id):
            raise HTTPException(status_code=400, detail="Setting this parent would create a circular reference")

    if page_data.title is not None:
        page.title = page_data.title
    if page_data.content is not None:
        page.content = json.dumps(page_data.content)
    if "parent_id" in page_data.model_fields_set:
        page.parent_id = page_data.parent_id
    if page_data.page_type is not None:
        page.page_type = page_data.page_type
    if page_data.icon is not None:
        page.icon = page_data.icon
    if page_data.header is not None:
        page.header = page_data.header
    if page_data.order is not None:
        page.order = page_data.order

    db.commit()
    db.refresh(page)

    return page_to_dict(page)

@app.delete("/api/pages/{page_id}")
def delete_page(
    page_id: int,
    cascade: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    if page.page_type == "home":
        raise HTTPException(status_code=400, detail="Cannot delete home page")

    if cascade:
        to_delete = [page_id]
        queue = [page_id]
        while queue:
            current = queue.pop(0)
            children = db.query(Page.id).filter(
                Page.parent_id == current,
                Page.user_id == user_id
            ).all()
            for (child_id,) in children:
                to_delete.append(child_id)
                queue.append(child_id)
        db.query(Page).filter(
            Page.id.in_(to_delete),
            Page.user_id == user_id
        ).delete(synchronize_session=False)
    else:
        # keep subpages, move them to the top level
        db.query(Page).filter(
            Page.parent_id == page_id,
            Page.user_id == user_id
        ).update({"parent_id": None})
        db.delete(page)

    db.commit()
    return {"message": "Page deleted successfully"}

def would_create_cycle(db: Session, page_id: int, new_parent_id: int, user_id: str) -> bool:
    visited: set = set()
    current_id: Optional[int] = new_parent_id
    while current_id is not None:
        if current_id == page_id:
            return True
        if current_id in visited:
            break
        visited.add(current_id)
        row = db.query(Page.parent_id).filter(
            Page.id == current_id,
            Page.user_id == user_id
        ).first()
        current_id = row[0] if row else None
    return False


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    chunks = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum file size is {limit // 1024 // 1024}MB."
            )
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    upload_type: str = Form("auto"),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    # old clients still send the file as 'image'
    uploaded_file = file or image
    if not uploaded_file:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await _read_limited(uploaded_file, MAX_FILE_SIZE)
    try:
        url = save_upload(user_id, content, uploaded_file.filename, upload_type)
    except UploadError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    return {
        "success": 1,
        "url": url,
        "file": {
            "url": url
        }
    }

def _format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.1f} MB"

@app.get("/api/storage-usage")
def get_storage_usage(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    usage_bytes = get_user_storage_usage(user_id)

    return {
        "usage_bytes": usage_bytes,
        "usage_formatted": _format_bytes(usage_bytes),
        "quota_bytes": MAX_USER_STORAGE,
        "quota_formatted": f"{MAX_USER_STORAGE // 1024 // 1024} MB",
        "percentage": round(usage_bytes / MAX_USER_STORAGE * 100, 1)
    }

def extract_filename(url: str) -> str:
    if not url:
        return ""
    return url.split("/")[-1] if "/" in url else url

@app.post("/api/cleanup-uploads")
def cleanup_uploads(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    try:
        user_id = current_user.get("user_id")
        pages = db.query(Page).filter(Page.user_id == user_id).all()

        referenced_files = set()
        for page in pages:
            try:
                content = _load_content(page.content)

                if page.header:
                    filename = extract_filename(page.header)
                    if filename:
                        referenced_files.add(filename)

                if page.icon and ("/" in page.icon or page.icon.startswith("http")):
                    filename = extract_filename(page.icon)
                    if filename:
                        referenced_files.add(filename)

                for block in content["blocks"]:
                    try:
                        data = block.get("data") or {}
                        if block.get("type") == "image":
                            url = (data.get("file") or {}).get("url", "") or data.get("url", "")
                        elif block.get("type") in ("audio", "file"):
                            url = data.get("url", "")
                        else:
                            continue
                        filename = extract_filename(url)
                        if filename:
                            referenced_files.add(filename)
                    except Exception as e:
                        logger.warning("Error processing block: %s", e)
                        continue
            except Exception as e:
                logger.warning("Error processing page %s: %s", page.id, e)
                continue

        user_dir = UPLOAD_DIR / user_id
        if not user_dir.exists():
            return {"deleted_count": 0, "space_freed": "0 B"}

        all_files = [f.name for f in user_dir.iterdir() if f.is_file()]

        orphaned_files = [f for f in all_files if f not in referenced_files]

        # skip fresh files, they might not be autosaved yet or come back via undo
        cutoff = time.time() - 24 * 60 * 60

        deleted_count = 0
        space_freed = 0
        for filename in orphaned_files:
            file_path = user_dir / filename
            try:
                stat = file_path.stat()
                if stat.st_mtime > cutoff:
                    continue
                file_path.unlink()
                deleted_count += 1
                space_freed += stat.st_size
            except Exception as e:
                logger.warning("Error deleting %s: %s", filename, e)

        return {
            "deleted_count": deleted_count,
            "space_freed": _format_bytes(space_freed)
        }
    except Exception as e:
        logger.error("Cleanup error: %s", e)
        raise HTTPException(status_code=500, detail="Cleanup failed")


@app.get("/api/preferences")
def get_preferences(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if not prefs:
        return {}
    try:
        return json.loads(prefs.preferences)
    except (json.JSONDecodeError, TypeError):
        return {}


class PreferencesUpdate(BaseModel):
    model_config = {"extra": "allow"}

@app.put("/api/preferences")
def update_preferences(
    data: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    update_dict = data.model_dump(exclude_none=True)
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id).first()
    if not prefs:
        prefs = UserPreferences(user_id=user_id, preferences=json.dumps(update_dict))
        db.add(prefs)
    else:
        existing = {}
        try:
            existing = json.loads(prefs.preferences)
        except (json.JSONDecodeError, TypeError):
            pass
        existing.update(update_dict)
        prefs.preferences = json.dumps(existing)
    db.commit()
    try:
        return json.loads(prefs.preferences)
    except (json.JSONDecodeError, TypeError):
        return {}


def _get_or_create_special_page(db: Session, user_id: str, page_type: str, title: str, icon: str) -> Page:
    page = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type == page_type
    ).first()

    if not page:
        page = Page(
            title=title,
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type=page_type,
            icon=icon,
            order=-1,
            user_id=user_id
        )
        db.add(page)
        db.commit()
        db.refresh(page)
    return page


@app.get("/api/notepad", response_model=PageResponse)
def get_notepad(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    page = _get_or_create_special_page(db, current_user.get("user_id"), "notepad", "Notepad", "📝")
    return page_to_dict(page)


@app.get("/api/todo", response_model=PageResponse)
def get_todo(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    page = _get_or_create_special_page(db, current_user.get("user_id"), "todo", "Todos", "☑️")
    return page_to_dict(page)


@app.get("/api/calendar", response_model=List[CalendarEventResponse])
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


@app.post("/api/calendar", response_model=CalendarEventResponse)
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


@app.put("/api/calendar/{event_id}", response_model=CalendarEventResponse)
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


@app.delete("/api/calendar/{event_id}")
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


def _demo_pages(db: Session) -> List[Page]:
    return db.query(Page).filter(
        Page.user_id == DEMO_USER_ID,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order, Page.id).all()


@app.get("/api/demo/pages")
def demo_get_pages(db: Session = Depends(get_db)):
    return [page_to_dict(p, include_content=False) for p in _demo_pages(db)]


@app.get("/api/demo/search")
def demo_search(q: str = "", db: Session = Depends(get_db)):
    return search_pages(_demo_pages(db), q[:200])


@app.get("/api/demo/pages/{page_id}")
def demo_get_page(page_id: int, db: Session = Depends(get_db)):
    page = db.query(Page).filter(
        Page.id == page_id, Page.user_id == DEMO_USER_ID
    ).first()
    if not page:
        return {
            "id": page_id, "title": "Untitled", "content": {"blocks": []},
            "parent_id": None, "page_type": "normal", "icon": None, "header": None,
            "order": 0, "user_id": DEMO_USER_ID,
            "created_at": "2024-01-01T00:00:00", "updated_at": "2024-01-01T00:00:00",
        }
    return page_to_dict(page)


@app.post("/api/demo/pages")
def demo_create_page(page_data: PageCreate):
    return {
        "id": random.randint(8000000, 8999999),
        "title": page_data.title,
        "content": page_data.content,
        "parent_id": page_data.parent_id,
        "page_type": page_data.page_type or "normal",
        "icon": page_data.icon,
        "header": None,
        "order": page_data.order or 0,
        "user_id": DEMO_USER_ID,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00",
    }


@app.put("/api/demo/pages/{page_id}")
def demo_update_page(page_id: int, page_data: PageUpdate, db: Session = Depends(get_db)):
    page = db.query(Page).filter(
        Page.id == page_id, Page.user_id == DEMO_USER_ID
    ).first()
    if page:
        return page_to_dict(page)
    return {
        "id": page_id, "title": page_data.title or "Untitled",
        "content": page_data.content or {"blocks": []},
        "parent_id": page_data.parent_id, "page_type": page_data.page_type or "normal",
        "icon": page_data.icon, "header": None, "order": page_data.order or 0,
        "user_id": DEMO_USER_ID,
        "created_at": "2024-01-01T00:00:00", "updated_at": "2024-01-01T00:00:00",
    }


@app.delete("/api/demo/pages/{page_id}")
def demo_delete_page(page_id: int):
    return {"message": "Page deleted successfully"}


@app.get("/api/demo/notepad")
def demo_get_notepad():
    return {
        "id": 9999901, "title": "Notepad", "content": {"blocks": []},
        "parent_id": None, "page_type": "notepad", "icon": "📝", "header": None,
        "order": -1, "user_id": DEMO_USER_ID,
        "created_at": "2024-01-01T00:00:00", "updated_at": "2024-01-01T00:00:00",
    }


@app.get("/api/demo/todo")
def demo_get_todo():
    return {
        "id": 9999902, "title": "Todo", "content": {"blocks": []},
        "parent_id": None, "page_type": "todo", "icon": "✅", "header": None,
        "order": -2, "user_id": DEMO_USER_ID,
        "created_at": "2024-01-01T00:00:00", "updated_at": "2024-01-01T00:00:00",
    }


@app.get("/api/demo/preferences")
def demo_get_preferences():
    return {"dashboard_enabled": False}


@app.put("/api/demo/preferences")
async def demo_update_preferences(request: Request):
    return await request.json()


@app.get("/api/demo/calendar")
def demo_get_calendar():
    return []


@app.post("/api/demo/calendar")
def demo_create_calendar_event(data: CalendarEventCreate):
    return {"id": 9999903, "date": data.date, "title": data.title, "time": data.time, "color": data.color}


@app.put("/api/demo/calendar/{event_id}")
def demo_update_calendar_event(event_id: int, data: CalendarEventUpdate):
    return {"id": event_id, "date": "2024-01-01", "title": data.title or "", "time": data.time, "color": data.color}


@app.delete("/api/demo/calendar/{event_id}")
def demo_delete_calendar_event(event_id: int):
    return {"ok": True}


MAX_IMPORT_ZIP_SIZE = 200 * 1024 * 1024
MAX_UNZIPPED_SIZE = 1024 * 1024 * 1024


def _run_notion_import(root_dir: Path, parent_id: Optional[int], user_id: str):
    from notion_importer import ImportContext, process_directory

    db = SessionLocal()
    try:
        ctx = ImportContext(db, user_id)
        process_directory(root_dir, parent_id, ctx)
        return ctx.pages_created, ctx.log_lines
    finally:
        db.close()


@app.post("/api/import/notion")
async def import_notion(
    zip_file: UploadFile = File(...),
    parent_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user.get("user_id")

    if not zip_file.filename or not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported")

    if parent_id is not None:
        parent = db.query(Page).filter(Page.id == parent_id, Page.user_id == user_id).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent page not found")

    content = await _read_limited(zip_file, MAX_IMPORT_ZIP_SIZE)

    with _tempfile.TemporaryDirectory() as tmpdir:
        try:
            with _zipfile.ZipFile(_io.BytesIO(content)) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                if total_uncompressed > MAX_UNZIPPED_SIZE:
                    raise HTTPException(status_code=400, detail="ZIP content too large when extracted (max 1 GB)")
                zf.extractall(tmpdir)
        except _zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")

        candidates = [
            d for d in Path(tmpdir).iterdir()
            if d.is_dir() and not d.name.startswith("_") and not d.name.startswith(".")
        ]
        root_dir = candidates[0] if candidates else Path(tmpdir)

        created, log_output = await asyncio.to_thread(_run_notion_import, root_dir, parent_id, user_id)

    log_lines = [line for entry in log_output for line in entry.splitlines() if line.strip()]
    return {"pages_created": created, "log": log_lines}
