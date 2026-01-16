from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import os
import time
import secrets
from pathlib import Path

from database import engine, get_db, Base
from models import User, Page

# Tabellen erstellen beim Start
Base.metadata.create_all(bind=engine)

app = FastAPI(title="nx API")

# CORS für Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files für uploads
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

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
    user_id: int
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True

# Demo User ID (später durch echtes Auth ersetzen)
DEMO_USER_ID = 1

@app.get("/")
def read_root():
    return {"message": "nx API is running"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}

# Pages Endpoints
@app.get("/api/pages", response_model=List[PageResponse])
def get_pages(db: Session = Depends(get_db)):
    """Alle Pages des Demo-Users laden"""
    pages = db.query(Page).filter(
        Page.user_id == DEMO_USER_ID
    ).order_by(Page.order).all()

    # Content von JSON-String zu dict konvertieren & datetime zu string
    for page in pages:
        if isinstance(page.content, str):
            page.content = json.loads(page.content)
        page.created_at = page.created_at.isoformat()
        page.updated_at = page.updated_at.isoformat()

    return pages

@app.get("/api/pages/{page_id}", response_model=PageResponse)
def get_page(page_id: int, db: Session = Depends(get_db)):
    """Eine einzelne Page laden"""
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == DEMO_USER_ID
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
def create_page(page_data: PageCreate, db: Session = Depends(get_db)):
    """Neue Page erstellen"""
    new_page = Page(
        title=page_data.title,
        content=json.dumps(page_data.content),
        parent_id=page_data.parent_id,
        page_type=page_data.page_type,
        icon=page_data.icon,
        order=page_data.order,
        user_id=DEMO_USER_ID
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
def update_page(page_id: int, page_data: PageUpdate, db: Session = Depends(get_db)):
    """Page updaten"""
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == DEMO_USER_ID
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
def delete_page(page_id: int, db: Session = Depends(get_db)):
    """Page löschen"""
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == DEMO_USER_ID
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Home Page kann nicht gelöscht werden
    if page.page_type == "home":
        raise HTTPException(status_code=400, detail="Cannot delete home page")

    db.delete(page)
    db.commit()

    return {"message": "Page deleted successfully"}

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(None),
    image: UploadFile = File(None),
    upload_type: str = Form("auto")
):
    """File upload (images, audio, documents, etc.)"""
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

    # Generate filename
    timestamp = int(time.time())
    safe_filename = uploaded_file.filename.replace(" ", "_") if uploaded_file.filename else "upload"

    # Read content
    content = await uploaded_file.read()

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

    # Save file
    file_path = UPLOAD_DIR / new_filename
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    # Return URL for frontend (both formats for compatibility)
    return {
        "success": 1,
        "url": f"/uploads/{new_filename}",
        "file": {
            "url": f"http://127.0.0.1:8000/uploads/{new_filename}"
        }
    }

@app.post("/api/cleanup-uploads")
def cleanup_uploads(db: Session = Depends(get_db)):
    """Clean up unused uploaded files"""
    try:
        # Get all pages
        pages = db.query(Page).filter(Page.user_id == DEMO_USER_ID).all()

        # Collect all referenced file URLs from page content
        referenced_files = set()
        for page in pages:
            try:
                content = json.loads(page.content) if page.content else {}

                # Check header image
                if page.header:
                    filename = page.header.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "")
                    if filename:
                        referenced_files.add(filename)

                # Check icon
                if page.icon:
                    filename = page.icon.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "")
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
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "")
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "audio" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "")
                                    if filename:
                                        referenced_files.add(filename)
                            elif block.get("type") == "file" and "data" in block:
                                url = block["data"].get("url", "")
                                if url:
                                    filename = url.replace("http://127.0.0.1:8000", "").replace("http://localhost:8000", "").replace("/uploads/", "")
                                    if filename:
                                        referenced_files.add(filename)
                        except Exception as e:
                            print(f"Error processing block: {e}")
                            continue
            except Exception as e:
                print(f"Error processing page {page.id}: {e}")
                continue

        # Get all files in upload directory
        all_files = [f.name for f in UPLOAD_DIR.iterdir() if f.is_file()]

        # Find orphaned files
        orphaned_files = [f for f in all_files if f not in referenced_files]

        # Delete orphaned files and calculate space freed
        deleted_count = 0
        space_freed = 0
        for filename in orphaned_files:
            file_path = UPLOAD_DIR / filename
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
