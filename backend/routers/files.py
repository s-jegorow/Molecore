import logging
import time

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Page
from routers.pages import load_content
from uploads import (
    MAX_FILE_SIZE,
    MAX_USER_STORAGE,
    UPLOAD_DIR,
    UploadError,
    get_user_storage_usage,
    save_upload,
)

logger = logging.getLogger("molecore")

router = APIRouter()


async def read_limited(upload: UploadFile, limit: int) -> bytes:
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


@router.post("/api/upload")
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

    content = await read_limited(uploaded_file, MAX_FILE_SIZE)
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


@router.get("/api/storage-usage")
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


@router.post("/api/cleanup-uploads")
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
                content = load_content(page.content)

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
