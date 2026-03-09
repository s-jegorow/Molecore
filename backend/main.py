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

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="nx API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend-domain.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Static files for uploads
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# Upload limits
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB per file
MAX_USER_STORAGE = 500 * 1024 * 1024  # 500 MB per user

# Pydantic schemas for request/response
from pydantic import BaseModel

class PageCreate(BaseModel):
    title: str
    content: dict
    parent_id: Optional[int] = None
    page_type: Optional[str] = "normal"
    icon: Optional[str] = None
    header: Optional[str] = None
    order: Optional[int] = 0

# Valid page types
VALID_PAGE_TYPES = {"home", "favorite", "normal", "template"}

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
    """Get all pages for the authenticated user"""
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(
        Page.user_id == user_id
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

    # Convert content from JSON string to dict & datetime to string
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
    """Get a single page"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Convert content from JSON string to dict & datetime to string
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

    # Convert content back to dict & datetime to string
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
        # Prevent circular reference
        if page_data.parent_id == page_id:
            raise HTTPException(status_code=400, detail="Page cannot be its own parent")

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

    # Convert content back to dict & datetime to string
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
    """Delete a page"""
    user_id = current_user.get("user_id")
    page = db.query(Page).filter(
        Page.id == page_id,
        Page.user_id == user_id
    ).first()

    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    # Home page cannot be deleted
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
        # General file uploads - allow all types except executables
        blocked_types = [
            "application/x-msdownload",
            "application/x-executable",
            "application/x-msdos-program"
        ]
        blocked_extensions = [".exe", ".bat", ".cmd", ".sh", ".msi"]
        file_ext = Path(uploaded_file.filename).suffix.lower() if uploaded_file.filename else ""

        if uploaded_file.content_type in blocked_types or file_ext in blocked_extensions:
            raise HTTPException(status_code=400, detail="Executable files are not allowed")

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
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")
