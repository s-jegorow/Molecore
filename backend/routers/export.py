import os
import tempfile
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from auth import get_current_user
from database import get_db
from markdown_export import MarkdownExporter
from models import Page

router = APIRouter()


@router.get("/api/export")
def export_pages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    pages = db.query(Page).filter(Page.user_id == user_id).order_by(Page.order, Page.id).all()

    fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        MarkdownExporter(user_id, pages).write_zip(Path(tmp_path))
    except Exception:
        os.remove(tmp_path)
        raise

    return FileResponse(
        tmp_path,
        media_type="application/zip",
        filename=f"molecore-export-{date.today().isoformat()}.zip",
        background=BackgroundTask(os.remove, tmp_path),
    )
