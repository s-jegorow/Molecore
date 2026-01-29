import json
import os
import time
import secrets
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
from pathlib import Path
from database import engine, get_db, Base
from models import Page
from auth import get_current_user

# Tabellen erstellen beim Start
Base.metadata.create_all(bind=engine)

app = FastAPI(title="molecore API")

# CORS configuration from environment variable
cors_origins = os.getenv("CORS_ORIGINS")
if not cors_origins:
    raise ValueError("CORS_ORIGINS environment variable is required (comma-separated list of allowed origins)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files für uploads
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Upload limits
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB per file
MAX_USER_STORAGE = 500 * 1024 * 1024  # 500 MB per user

# Pydantic Schemas für Request/Response
from pydantic import BaseModel

class PageCreate(BaseModel):
    title: str
    content: dict
    parent_id: Optional[int] = None
    page_type: Optional[str] = "normal"
    icon: Optional[str] = None
    header: Optional[str] = None
    order: Optional[int] = 0

class PageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[dict] = None
    parent_id: Optional[int] = None
    page_type: Optional[str] = None
    icon: Optional[str] = None
    header: Optional[str] = None
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
    """Alle Pages des authentifizierten Users laden"""
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id
    ).order_by(Page.order).all()

    # Wenn User keine Pages hat, erstelle eine Standard-Home-Page
    if not pages:
        home_page = Page(
            title="Dashboard",
            content=json.dumps({
                "time": int(time.time() * 1000),
                "blocks": [
                    {
                        "type": "paragraph",
                        "data": {
                            "text": "Dies ist deine Startseite, die du nach deinen Wünschen gestalten kannst."
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

    # Content von JSON-String zu dict konvertieren & datetime zu string
    for page in pages:
        if isinstance(page.content, str):
            page.content = json.loads(page.content)
        page.created_at = page.created_at.isoformat()
        page.updated_at = page.updated_at.isoformat()

    return pages


@app.get("/api/pages/{page_id}", response_model=PageResponse)
def get_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Eine einzelne Page laden"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Content von JSON-String zu dict & datetime zu string
    if isinstance(page.content, str):
        page.content = json.loads(page.content)
    page.created_at = page.created_at.isoformat()
    page.updated_at = page.updated_at.isoformat()

    return page

@app.post("/api/pages", response_model=PageResponse)
def create_page(
    page_data: PageCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Neue Page erstellen"""
    user_id = current_user.get("user_id")
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

    # Content zurück zu dict & datetime zu string
    new_page.content = json.loads(new_page.content)
    new_page.created_at = new_page.created_at.isoformat()
    new_page.updated_at = new_page.updated_at.isoformat()

    return new_page

@app.put("/api/pages/{page_id}", response_model=PageResponse)
def update_page(
    page_id: int,
    page_data: PageUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Page updaten"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Nur geänderte Felder updaten
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

    # Content zurück zu dict & datetime zu string
    page.content = json.loads(page.content)
    page.created_at = page.created_at.isoformat()
    page.updated_at = page.updated_at.isoformat()

    return page

@app.delete("/api/pages/{page_id}")
def delete_page(
    page_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Page löschen"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Home Page kann nicht gelöscht werden
    if page.page_type == "home":
        raise HTTPException(status_code=400, detail="Cannot delete home page")

    db.delete(page)
    db.commit()

    return {"message": "Page deleted successfully"}

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

    # Validate file type based on upload_type
    if upload_type in ["header", "icon", "auto"]:
        # Image uploads
        allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
        if uploaded_file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Only image files are allowed")
    elif upload_type == "audio":
        # Audio uploads
        allowed_types = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm", "audio/x-m4a"]
        if uploaded_file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Only audio files are allowed")
    elif upload_type == "file":
        # General file uploads (PDFs, docs, etc.)
        allowed_types = [
            "application/pdf",
            "application/zip",
            "application/x-zip-compressed",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain"
        ]
        if uploaded_file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="File type not allowed")

    # Read content
    content = await uploaded_file.read()

    # Check file size limit (20 MB)
    if len(content) > MAX_FILE_SIZE:
        size_mb = len(content) / 1024 / 1024
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB). Maximum file size is 20MB."
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

    # Generate filename
    timestamp = int(time.time())
    safe_filename = uploaded_file.filename.replace(" ", "_") if uploaded_file.filename else "upload"

    # Determine prefix based on upload_type
    if upload_type == "header":
        prefix = "header"
        new_filename = f"{prefix}_{timestamp}_{safe_filename}"
    elif upload_type == "icon":
        prefix = "icon"
        random_str = secrets.token_hex(6)
        new_filename = f"{prefix}_{timestamp}_{random_str}_{safe_filename}"
    elif upload_type == "audio":
        prefix = "audio"
        new_filename = f"{prefix}_{timestamp}_{safe_filename}"
    elif upload_type == "file":
        prefix = "file"
        new_filename = f"{prefix}_{timestamp}_{safe_filename}"
    else:
        # Auto-detect based on file size (for images)
        prefix = "icon" if len(content) < 50000 else "image"
        random_str = secrets.token_hex(6)
        new_filename = f"{prefix}_{timestamp}_{random_str}_{safe_filename}"

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
                    # Extract path after /uploads/user_id/
                    filename = page.header.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "").replace(f"{user_id}/", "")
                    if filename:
                        referenced_files.add(filename)

                # Check icon
                if page.icon:
                    filename = page.icon.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "").replace(f"{user_id}/", "")
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
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "").replace(f"{user_id}/", "")
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "audio" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "").replace(f"{user_id}/", "")
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "file" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "").replace(f"{user_id}/", "")
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
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")
