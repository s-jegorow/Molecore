import os
import secrets
from pathlib import Path
from typing import Optional

from starlette.staticfiles import StaticFiles
from starlette.types import Scope

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(Path(__file__).parent / "uploads")))

MAX_FILE_SIZE = 50 * 1024 * 1024
MAX_USER_STORAGE = 500 * 1024 * 1024

VALID_UPLOAD_TYPES = {"auto", "header", "icon", "audio", "file"}

BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".sh", ".msi", ".com", ".pif", ".scr",
    ".vbs", ".vbe", ".js", ".mjs", ".jse", ".wsf", ".wsh", ".ps1", ".ps2",
    ".jar", ".app", ".deb", ".rpm", ".dmg", ".pkg", ".elf",
    ".svg", ".svgz", ".html", ".htm", ".shtml", ".xml", ".xhtml", ".xht",
    ".xsl", ".xslt", ".mht", ".mhtml",
}

INLINE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".mp3", ".wav", ".ogg", ".oga", ".webm", ".m4a", ".flac",
}


class UploadError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def detect_image_ext(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def detect_audio_ext(data: bytes) -> Optional[str]:
    if data[:3] == b"ID3":
        return ".mp3"
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return ".mp3"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    if data[:4] == b"OggS":
        return ".ogg"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    if data[:4] == b"fLaC":
        return ".flac"
    if data[4:8] == b"ftyp":
        return ".m4a"
    return None


def get_user_storage_usage(user_id: str) -> int:
    user_dir = UPLOAD_DIR / user_id
    if not user_dir.exists():
        return 0
    return sum(f.stat().st_size for f in user_dir.rglob("*") if f.is_file())


def _safe_stem(filename: str) -> str:
    stem = Path(os.path.basename(filename or "upload")).stem.replace(" ", "_")
    cleaned = "".join(c for c in stem if c.isalnum() or c in "-_.")
    return cleaned.strip(".")[:80] or "upload"


def save_upload(user_id: str, content: bytes, filename: Optional[str], upload_type: str) -> str:
    if upload_type not in VALID_UPLOAD_TYPES:
        raise UploadError(400, "Invalid upload_type")

    if len(content) > MAX_FILE_SIZE:
        raise UploadError(
            413,
            f"File too large ({len(content) / 1024 / 1024:.1f}MB). "
            f"Maximum file size is {MAX_FILE_SIZE // 1024 // 1024}MB.",
        )

    if upload_type in ("auto", "header", "icon"):
        ext = detect_image_ext(content)
        if not ext:
            raise UploadError(400, "Only image files are allowed (JPEG, PNG, GIF, WebP)")
    elif upload_type == "audio":
        ext = detect_audio_ext(content)
        if not ext:
            raise UploadError(400, "Only audio files are allowed (MP3, WAV, OGG, WebM, M4A, FLAC)")
    else:
        ext = Path(filename or "").suffix.lower()
        ext = "".join(c for c in ext if c.isalnum() or c == ".")
        if ext in BLOCKED_EXTENSIONS:
            raise UploadError(400, "This file type is not allowed")

    current_usage = get_user_storage_usage(user_id)
    if current_usage + len(content) > MAX_USER_STORAGE:
        raise UploadError(
            413,
            f"Storage quota exceeded. Used: {current_usage / 1024 / 1024:.1f}MB / "
            f"{MAX_USER_STORAGE // 1024 // 1024}MB",
        )

    if upload_type == "auto":
        prefix = "icon" if len(content) < 50000 else "image"
    else:
        prefix = upload_type

    new_filename = f"{prefix}_{secrets.token_hex(16)}_{_safe_stem(filename)}{ext}"
    user_dir = UPLOAD_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / new_filename).write_bytes(content)
    return f"/uploads/{user_id}/{new_filename}"


class UploadStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self'; media-src 'self'"
        if Path(path).suffix.lower() not in INLINE_EXTENSIONS:
            response.headers["Content-Disposition"] = "attachment"
        return response
