import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal
from routers import calendar, demo, files, notion_import, pages, preferences
from uploads import UPLOAD_DIR, UploadStaticFiles

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db = SessionLocal()
    try:
        demo.seed_demo_pages(db)
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


@app.get("/api/health")
def health_check():
    return {"status": "healthy"}


app.include_router(pages.router)
app.include_router(files.router)
app.include_router(preferences.router)
app.include_router(calendar.router)
app.include_router(notion_import.router)
app.include_router(demo.router)
