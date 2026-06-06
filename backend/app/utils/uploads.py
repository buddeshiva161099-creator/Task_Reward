"""Safe upload helpers for locally stored user attachments."""
from pathlib import Path
from typing import Iterable
from uuid import uuid4
import re

from fastapi import HTTPException, UploadFile, status

from app.config import settings

SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")

CHAT_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

IDENTITY_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def sanitize_upload_filename(filename: str | None) -> str:
    """Return a path-safe display filename without trusting user-supplied paths."""
    base_name = Path(filename or "attachment").name.strip()
    sanitized = SAFE_FILENAME_PATTERN.sub("_", base_name).strip("._")
    return sanitized or "attachment"


def build_stored_filename(original_filename: str | None) -> str:
    """Build a collision-resistant server-side filename."""
    safe_name = sanitize_upload_filename(original_filename)
    return f"{uuid4().hex}_{safe_name}"


def validate_upload_metadata(file: UploadFile, allowed_content_types: Iterable[str]) -> None:
    """Reject unsupported upload metadata before reading the file body."""
    if file.content_type not in set(allowed_content_types):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported file type.",
        )


async def save_upload_file(
    file: UploadFile,
    upload_dir: str | Path,
    allowed_content_types: Iterable[str],
) -> tuple[str, int]:
    """Validate and persist an UploadFile with a safe generated filename."""
    validate_upload_metadata(file, allowed_content_types)

    destination_dir = Path(upload_dir).resolve()
    destination_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = build_stored_filename(file.filename)
    destination = (destination_dir / stored_filename).resolve()

    # Enforce path traversal safety
    if destination_dir not in destination.parents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Directory traversal detected.",
        )

    max_bytes = settings.MAX_UPLOAD_BYTES
    bytes_written = 0
    with destination.open("wb") as buffer:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                buffer.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds the {max_bytes} byte upload limit.",
                )
            buffer.write(chunk)

    if bytes_written == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    return stored_filename, bytes_written
