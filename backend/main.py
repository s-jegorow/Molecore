import asyncio
import io as _io
import json
import os
import random
import sys as _sys
import time
import secrets
import tempfile as _tempfile
import zipfile as _zipfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
from database import engine, get_db, Base
from models import Page, UserPreferences, CalendarEvent
from auth import get_current_user

# Create tables on startup
Base.metadata.create_all(bind=engine)


def serialize_page(page: Page) -> Page:
    """Deserialize page content from JSON string and convert datetimes to ISO strings."""
    if isinstance(page.content, str):
        try:
            page.content = json.loads(page.content)
        except (json.JSONDecodeError, TypeError):
            page.content = {"blocks": []}
    page.created_at = page.created_at.isoformat()
    page.updated_at = page.updated_at.isoformat()
    return page

app = FastAPI(title="Molecore API")

# CORS for frontend
_cors_origin = os.getenv("CORS_ORIGINS", "http://localhost")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_cors_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Static files for uploads
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Upload limits
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per file
MAX_USER_STORAGE = 500 * 1024 * 1024  # 500 MB per user

# Pydantic schemas for request/response
from pydantic import BaseModel, Field

class PageCreate(BaseModel):
    title: str = Field(..., max_length=500)
    content: dict
    parent_id: Optional[int] = None
    page_type: Optional[str] = "normal"
    icon: Optional[str] = Field(None, max_length=200)
    header: Optional[str] = Field(None, max_length=500)
    order: Optional[int] = 0

# Valid page types
VALID_PAGE_TYPES = {"home", "favorite", "normal", "template", "notepad", "todo"}

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

class PageResponse(BaseModel):
    id: int
    title: str
    content: dict
    parent_id: Optional[int]
    page_type: str
    icon: Optional[str]
    header: Optional[str]
    order: int
    user_id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

@app.get("/")
def read_root():
    return {"message": "nx API is running"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

# Pages Endpoints

@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@app.get("/api/pages", response_model=List[PageResponse])
def get_pages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get all pages for the authenticated user"""
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order).all()

    # If user has no pages, create a default home page
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

    for page in pages:
        serialize_page(page)

    return pages


@app.get("/api/pages/{page_id}", response_model=PageResponse)
def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get a single page"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return serialize_page(page)

@app.post("/api/pages", response_model=PageResponse)
def create_page(
    page_data: PageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new page"""
    user_id = current_user.get("user_id")

    # Validate page_type
    if page_data.page_type and page_data.page_type not in VALID_PAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid page_type. Must be one of: {', '.join(VALID_PAGE_TYPES)}"
        )

    # Validate parent_id if provided
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
        page_type=page_data.page_type,
        icon=page_data.icon,
        order=page_data.order,
        user_id=user_id
    )

    db.add(new_page)
    db.commit()
    db.refresh(new_page)

    return serialize_page(new_page)

@app.put("/api/pages/{page_id}", response_model=PageResponse)
def update_page(
    page_id: int,
    page_data: PageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Update a page"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Validate page_type if provided
    if page_data.page_type is not None:
        if page_data.page_type not in VALID_PAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid page_type. Must be one of: {', '.join(VALID_PAGE_TYPES)}"
            )

    # Validate parent_id if provided
    if page_data.parent_id is not None:
        # Check if parent exists and belongs to user
        parent = db.query(Page).filter(
            Page.id == page_data.parent_id,
            Page.user_id == user_id
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Parent page not found")
        # Prevent circular reference (direct and indirect)
        if page_data.parent_id == page_id or would_create_cycle(db, page_id, page_data.parent_id, user_id):
            raise HTTPException(status_code=400, detail="Setting this parent would create a circular reference")

    # Update only changed fields
    if page_data.title is not None:
        page.title = page_data.title
    if page_data.content is not None:
        page.content = json.dumps(page_data.content)
    if page_data.parent_id is not None:
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

    return serialize_page(page)

@app.delete("/api/pages/{page_id}")
def delete_page(
    page_id: int,
    cascade: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Delete a page. Pass ?cascade=true to also delete all subpages recursively."""
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
        # BFS to collect all descendant IDs
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
        db.delete(page)

    db.commit()
    return {"message": "Page deleted successfully"}

def would_create_cycle(db: Session, page_id: int, new_parent_id: int, user_id: str) -> bool:
    """Return True if setting new_parent_id on page_id would create a circular reference."""
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

def get_user_storage_usage(user_id: str) -> int:
    """Calculate total storage used by user in bytes"""
    user_dir = UPLOAD_DIR / user_id
    if not user_dir.exists():
        return 0

    total = 0
    for file in user_dir.rglob("*"):
        if file.is_file():
            total += file.stat().st_size
    return total

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    upload_type: str = Form("auto"),
    current_user: dict = Depends(get_current_user)
):
    """File upload (images, audio, documents, etc.)"""
    user_id = current_user.get("user_id")

    # Support both 'file' and 'image' parameter names for backward compatibility
    uploaded_file = file or image
    if not uploaded_file:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read content first so we can do magic-byte validation
    content = await uploaded_file.read()

    def _is_valid_image(data: bytes) -> bool:
        if data[:3] == b'\xff\xd8\xff':
            return True  # JPEG
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return True  # PNG
        if data[:6] in (b'GIF87a', b'GIF89a'):
            return True  # GIF
        if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return True  # WebP
        return False

    _BLOCKED_EXTENSIONS = {
        ".exe", ".bat", ".cmd", ".sh", ".msi", ".com", ".pif", ".scr",
        ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1", ".ps2",
        ".jar", ".app", ".deb", ".rpm", ".dmg", ".pkg", ".elf",
        ".svg", ".html", ".htm", ".xml", ".xhtml",
    }

    # Validate file type based on upload_type
    if upload_type in ["header", "icon", "auto"]:
        if not _is_valid_image(content):
            raise HTTPException(status_code=400, detail="Only image files are allowed (JPEG, PNG, GIF, WebP)")
    elif upload_type == "audio":
        allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/x-m4a"]
        if uploaded_file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Only audio files are allowed")
    elif upload_type == "file":
        file_ext = Path(uploaded_file.filename).suffix.lower() if uploaded_file.filename else ""
        if file_ext in _BLOCKED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Executable files are not allowed")

    # Check file size limit (20 MB)
    if len(content) > MAX_FILE_SIZE:
        size_mb = len(content) / 1024 / 1024
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB). Maximum file size is 50MB."
        )

    # Check user storage quota (500 MB)
    current_usage = get_user_storage_usage(user_id)
    if current_usage + len(content) > MAX_USER_STORAGE:
        used_mb = current_usage / 1024 / 1024
        max_mb = MAX_USER_STORAGE / 1024 / 1024
        raise HTTPException(
            status_code=413,
            detail=f"Storage quota exceeded. Used: {used_mb:.1f}MB / {max_mb:.0f}MB"
        )

    # Generate filename with cryptographically random token to prevent URL guessing
    raw_filename = uploaded_file.filename or "upload"
    safe_filename = os.path.basename(raw_filename).replace(" ", "_")
    random_token = secrets.token_hex(16)

    # Determine prefix based on upload_type
    if upload_type == "header":
        new_filename = f"header_{random_token}_{safe_filename}"
    elif upload_type == "icon":
        new_filename = f"icon_{random_token}_{safe_filename}"
    elif upload_type == "audio":
        new_filename = f"audio_{random_token}_{safe_filename}"
    elif upload_type == "file":
        new_filename = f"file_{random_token}_{safe_filename}"
    else:
        # Auto-detect based on file size (for images)
        prefix = "icon" if len(content) < 50000 else "image"
        new_filename = f"{prefix}_{random_token}_{safe_filename}"

    # Create user directory if it doesn't exist
    user_dir = UPLOAD_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    # Save file in user directory
    file_path = user_dir / new_filename
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    # Return URL for frontend (both formats for compatibility)
    return {
        "success": 1,
        "url": f"/uploads/{user_id}/{new_filename}",
        "file": {
            "url": f"/uploads/{user_id}/{new_filename}"
        }
    }

@app.get("/api/storage-usage")
def get_storage_usage(current_user: dict = Depends(get_current_user)):
    """Get storage usage for current user"""
    user_id = current_user.get("user_id")
    usage_bytes = get_user_storage_usage(user_id)

    # Convert to human-readable format
    if usage_bytes < 1024:
        usage_str = f"{usage_bytes} B"
    elif usage_bytes < 1024 * 1024:
        usage_str = f"{usage_bytes / 1024:.1f} KB"
    else:
        usage_str = f"{usage_bytes / (1024 * 1024):.1f} MB"

    # Quota is 500 MB
    quota_bytes = 500 * 1024 * 1024
    percentage = (usage_bytes / quota_bytes) * 100

    return {
        "usage_bytes": usage_bytes,
        "usage_formatted": usage_str,
        "quota_bytes": quota_bytes,
        "quota_formatted": "500 MB",
        "percentage": round(percentage, 1)
    }

def extract_filename(url: str) -> str:
    """Extract just the filename from any URL format (works with absolute or relative URLs)"""
    if not url:
        return ""
    return url.split("/")[-1] if "/" in url else url

@app.post("/api/cleanup-uploads")
def cleanup_uploads(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Clean up unused uploaded files"""
    try:
        # Get all pages
        user_id = current_user.get("user_id")
        pages = db.query(Page).filter(Page.user_id == user_id).all()

        # Collect all referenced file URLs from page content
        referenced_files = set()
        for page in pages:
            try:
                content = json.loads(page.content) if page.content else {}

                # Check header image
                if page.header:
                    filename = extract_filename(page.header)
                    if filename:
                        referenced_files.add(filename)

                # Check icon (skip emojis - they don't start with / or http)
                if page.icon and ("/" in page.icon or page.icon.startswith("http")):
                    filename = extract_filename(page.icon)
                    if filename:
                        referenced_files.add(filename)

                # Check content blocks
                if "blocks" in content:
                    for block in content["blocks"]:
                        try:
                            if block.get("type") == "image" and "data" in block:
                                # Support both URL formats: data.file.url and data.url
                                url = block["data"].get("file", {}).get("url", "") or block["data"].get("url", "")
                                if url:
                                    filename = extract_filename(url)
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "audio" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = extract_filename(url)
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "file" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = extract_filename(url)
                                    if filename:
                                        referenced_files.add(filename)
                        except Exception as e:
                            print(f"Error processing block: {e}")
                            continue
            except Exception as e:
                print(f"Error processing page {page.id}: {e}")
                continue

        # Get all files in user's upload directory
        user_dir = UPLOAD_DIR / user_id
        if not user_dir.exists():
            return {"deleted_count": 0, "space_freed": "0 bytes"}

        all_files = [f.name for f in user_dir.iterdir() if f.is_file()]

        # Find orphaned files
        orphaned_files = [f for f in all_files if f not in referenced_files]

        # Delete orphaned files and calculate space freed
        deleted_count = 0
        space_freed = 0
        for filename in orphaned_files:
            file_path = user_dir / filename
            try:
                file_size = file_path.stat().st_size
                file_path.unlink()
                deleted_count += 1
                space_freed += file_size
            except Exception as e:
                print(f"Error deleting {filename}: {e}")

        # Format space freed in human-readable format
        if space_freed < 1024:
            space_str = f"{space_freed} bytes"
        elif space_freed < 1024 * 1024:
            space_str = f"{space_freed / 1024:.2f} KB"
        else:
            space_str = f"{space_freed / (1024 * 1024):.2f} MB"

        return {
            "deleted_count": deleted_count,
            "space_freed": space_str
        }
    except Exception as e:
        print(f"Cleanup error: {e}")
        raise HTTPException(status_code=500, detail="Cleanup failed")


# User Preferences Endpoints

@app.get("/api/preferences")
def get_preferences(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get user preferences"""
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
    """Update user preferences"""
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


# Notepad Endpoint

@app.get("/api/notepad", response_model=PageResponse)
def get_notepad(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get or create the user's notepad page"""
    user_id = current_user.get("user_id")

    notepad = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type == "notepad"
    ).first()

    if not notepad:
        notepad = Page(
            title="Notepad",
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type="notepad",
            icon="📝",
            order=-1,
            user_id=user_id
        )
        db.add(notepad)
        db.commit()
        db.refresh(notepad)

    return serialize_page(notepad)


# Todo Endpoint

@app.get("/api/todo", response_model=PageResponse)
def get_todo(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get or create the user's todo page"""
    user_id = current_user.get("user_id")

    todo = db.query(Page).filter(
        Page.user_id == user_id,
        Page.page_type == "todo"
    ).first()

    if not todo:
        todo = Page(
            title="Todos",
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [],
                "version": "2.28.2"
            }),
            parent_id=None,
            page_type="todo",
            icon="☑️",
            order=-1,
            user_id=user_id
        )
        db.add(todo)
        db.commit()
        db.refresh(todo)

    return serialize_page(todo)


# Calendar Endpoints

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


# ─── Demo Mode ────────────────────────────────────────────────────────────────

from demo_content import DEMO_USER_ID, DEMO_PAGES_SEED


def _serialize_demo_page(page: Page) -> dict:
    content = page.content
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            content = {"blocks": []}
    return {
        "id": page.id,
        "title": page.title,
        "content": content,
        "parent_id": page.parent_id,
        "page_type": page.page_type,
        "icon": page.icon,
        "header": page.header,
        "order": page.order,
        "user_id": page.user_id,
        "created_at": page.created_at.isoformat(),
        "updated_at": page.updated_at.isoformat(),
    }


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


@app.on_event("startup")
def on_startup() -> None:
    db = next(get_db())
    try:
        seed_demo_pages(db)
    finally:
        db.close()


@app.get("/api/demo/pages")
def demo_get_pages(db: Session = Depends(get_db)):
    pages = db.query(Page).filter(
        Page.user_id == DEMO_USER_ID,
        Page.page_type.notin_(["notepad", "todo"])
    ).order_by(Page.order).all()
    return [_serialize_demo_page(p) for p in pages]


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
    return _serialize_demo_page(page)


@app.post("/api/demo/pages")
def demo_create_page(page_data: PageCreate):
    """Demo mode — return a fake page without persisting"""
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
    """Demo mode — return existing page unchanged"""
    page = db.query(Page).filter(
        Page.id == page_id, Page.user_id == DEMO_USER_ID
    ).first()
    if page:
        return _serialize_demo_page(page)
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
    """Demo mode — no-op"""
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


# ─── Notion Importer ──────────────────────────────────────────────────────────

class _StaticToken:
    """Wraps an existing bearer token so notion_importer needs no Keycloak login."""
    def __init__(self, token: str):
        self._token = token

    @property
    def token(self) -> str:
        return self._token


@contextmanager
def _capture_stdout():
    buf = _io.StringIO()
    old = _sys.stdout
    _sys.stdout = buf
    try:
        yield buf
    finally:
        _sys.stdout = old


@app.post("/api/import/notion")
async def import_notion(
    request: Request,
    zip_file: UploadFile = File(...),
    parent_id: Optional[int] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """Import a Notion export ZIP into Molecore."""
    from notion_importer import process_directory

    if not zip_file.filename or not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported")

    content = await zip_file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="ZIP file too large (max 200 MB)")

    auth_header = request.headers.get("Authorization", "")
    bearer_token = auth_header.removeprefix("Bearer ").strip()
    if not bearer_token:
        raise HTTPException(status_code=401, detail="Missing authorization token")
    tm = _StaticToken(bearer_token)

    # Call back to self — works because uvicorn handles concurrent requests
    api_base = os.getenv("INTERNAL_API_BASE", "http://localhost:8000")

    # Extract ZIP before entering thread so we can raise HTTP errors cleanly
    tmpdir_obj = _tempfile.TemporaryDirectory()
    tmpdir = tmpdir_obj.name
    _MAX_UNZIPPED_SIZE = 1024 * 1024 * 1024  # 1 GB decompressed limit
    try:
        with _zipfile.ZipFile(_io.BytesIO(content)) as zf:
            total_uncompressed = sum(info.file_size for info in zf.infolist())
            if total_uncompressed > _MAX_UNZIPPED_SIZE:
                tmpdir_obj.cleanup()
                raise HTTPException(status_code=400, detail="ZIP content too large when extracted (max 1 GB)")
            zf.extractall(tmpdir)
    except _zipfile.BadZipFile:
        tmpdir_obj.cleanup()
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")

    candidates = [
        d for d in Path(tmpdir).iterdir()
        if d.is_dir() and not d.name.startswith("_") and not d.name.startswith(".")
    ]
    root_dir = candidates[0] if candidates else Path(tmpdir)

    # Run the blocking import in a thread so the event loop stays free
    # to handle the HTTP callbacks that process_directory makes back to this server.
    def _run_import():
        buf = _io.StringIO()
        old_stdout = _sys.stdout
        _sys.stdout = buf
        try:
            result = process_directory(root_dir, parent_id, api_base, tm)
        finally:
            _sys.stdout = old_stdout
            tmpdir_obj.cleanup()
        return result, buf.getvalue()

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as executor:
        created, log_output = await loop.run_in_executor(executor, _run_import)

    log_lines = [line for line in log_output.splitlines() if line.strip()]
    return {"pages_created": len(created), "log": log_lines}
