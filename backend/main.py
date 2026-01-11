from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
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
    is_favorite: Optional[bool] = False
    order: Optional[int] = 0

class PageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[dict] = None
    parent_id: Optional[int] = None
    is_favorite: Optional[bool] = None
    order: Optional[int] = None

class PageResponse(BaseModel):
    id: int
    title: str
    content: dict
    parent_id: Optional[int]
    is_favorite: bool
    is_home: bool
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
        is_favorite=page_data.is_favorite,
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
    if page_data.is_favorite is not None:
        page.is_favorite = page_data.is_favorite
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
    if page.is_home:
        raise HTTPException(status_code=400, detail="Cannot delete home page")

    db.delete(page)
    db.commit()

    return {"message": "Page deleted successfully"}

@app.post("/api/upload")
async def upload_file(image: UploadFile = File(...)):
    """Bild hochladen"""
    # Validate file type
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
    if image.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    # Generate filename: image_{timestamp}_{random}_{original}
    timestamp = int(time.time())
    random_str = secrets.token_hex(6)
    safe_filename = image.filename.replace(" ", "_") if image.filename else "upload"
    new_filename = f"image_{timestamp}_{random_str}_{safe_filename}"

    # Save file
    file_path = UPLOAD_DIR / new_filename
    with open(file_path, "wb") as buffer:
        content = await image.read()
        buffer.write(content)

    # Return URL for frontend
    return {
        "success": 1,
        "file": {
            "url": f"http://127.0.0.1:8000/uploads/{new_filename}"
        }
    }
