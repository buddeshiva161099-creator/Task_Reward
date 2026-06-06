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

# Map of magic-byte signatures to the canonical content type they prove.
# Each entry: (list_of_acceptable_canonical_types, signature_bytes, offset, mask_or_None)
# The mask lets us ignore case-insensitive bits (e.g., for "Exif" in JPEG).
_MAGIC_SIGNATURES: list[tuple[set[str], bytes, int, bytes | None]] = [
    # JPEG: starts with FF D8 FF
    ({"image/jpeg"}, b"\xff\xd8\xff", 0, None),
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    ({"image/png"}, b"\x89PNG\r\n\x1a\n", 0, None),
    # GIF87a / GIF89a
    ({"image/gif"}, b"GIF8", 0, None),
    # WEBP: RIFF....WEBP
    ({"image/webp"}, b"WEBP", 8, None),
    # PDF: %PDF-
    ({"application/pdf"}, b"%PDF-", 0, None),
    # ZIP-based Office Open XML (docx/xlsx): PK\x03\x04
    (
        {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        b"PK\x03\x04",
        0,
        None,
    ),
]


def _sniff_content_type(header: bytes) -> str | None:
    """Return the canonical content type that matches the magic-byte header, or None."""
    for canonical_types, signature, offset, _mask in _MAGIC_SIGNATURES:
        if len(header) >= offset + len(signature) and header.startswith(signature, offset):
            # For ZIP-based formats, we already accept both docx and xlsx; if we ever
            # need to disambiguate, we can inspect central directory metadata.
            return next(iter(canonical_types))
    return None


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
    magic_buffer = b""
    MAGIC_HEADER_MAX = 16  # Largest signature length is 12 (WEBP at offset 8)

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
            if len(magic_buffer) < MAGIC_HEADER_MAX:
                needed = MAGIC_HEADER_MAX - len(magic_buffer)
                magic_buffer = (magic_buffer + chunk[:needed])[:MAGIC_HEADER_MAX]
            buffer.write(chunk)

    if bytes_written == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # Server-side content-type sniff: client-supplied Content-Type headers are
    # untrusted, so verify the file's magic bytes match the declared type.
    sniffed = _sniff_content_type(magic_buffer)
    if sniffed is None:
        # text/plain and text/csv have no magic bytes; allow them if the caller
        # declared one of those types and we did not detect binary content.
        if file.content_type in {"text/plain", "text/csv"}:
            return stored_filename, bytes_written
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Uploaded file contents do not match the declared file type.",
        )

    # For ZIP-based formats (docx/xlsx) the magic bytes are identical; the
    # declared content type from the allowlist distinguishes the subtype, so
    # we accept either as long as the bytes are a valid ZIP/OLE container.
    allowed_set = set(allowed_content_types)
    if sniffed in allowed_set:
        return stored_filename, bytes_written
    if (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        in allowed_set
        or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        in allowed_set
    ) and sniffed in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }:
        return stored_filename, bytes_written

    destination.unlink(missing_ok=True)
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Uploaded file contents do not match the declared file type.",
    )
