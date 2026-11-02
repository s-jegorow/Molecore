import asyncio
import io
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from auth import get_current_user
from database import SessionLocal, get_db
from notion_importer import ImportContext, process_directory
from routers.files import read_limited
from routers.pages import find_user_page

logger = logging.getLogger("molecore")

router = APIRouter()

MAX_IMPORT_ZIP_SIZE = 200 * 1024 * 1024
MAX_UNZIPPED_SIZE = 1024 * 1024 * 1024


def _run_notion_import(root_dir: Path, parent_id: Optional[int], user_id: str):
    db = SessionLocal()
    try:
        ctx = ImportContext(db, user_id)
        # one transaction for the whole import, a crash shouldn't leave half a page tree
        try:
            process_directory(root_dir, parent_id, ctx)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Notion import failed")
            raise HTTPException(status_code=500, detail="Import failed, nothing was imported")
        return ctx.pages_created, ctx.log_lines
    finally:
        db.close()


@router.post("/api/import/notion")
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
        if not find_user_page(db, parent_id, user_id):
            raise HTTPException(status_code=400, detail="Parent page not found")

    content = await read_limited(zip_file, MAX_IMPORT_ZIP_SIZE)

    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                total_uncompressed = sum(info.file_size for info in zf.infolist())
                if total_uncompressed > MAX_UNZIPPED_SIZE:
                    raise HTTPException(status_code=400, detail="ZIP content too large when extracted (max 1 GB)")
                zf.extractall(tmpdir)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")

        candidates = [
            d for d in Path(tmpdir).iterdir()
            if d.is_dir() and not d.name.startswith("_") and not d.name.startswith(".")
        ]
        root_dir = candidates[0] if candidates else Path(tmpdir)

        created, log_output = await asyncio.to_thread(_run_notion_import, root_dir, parent_id, user_id)

    log_lines = [line for entry in log_output for line in entry.splitlines() if line.strip()]
    return {"pages_created": created, "log": log_lines}
