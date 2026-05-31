import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.config import settings
from app.main import validate_runtime_security_settings
from app.routes.auth import register
from app.schemas.auth import RegisterRequest
from app.utils.uploads import (
    CHAT_ALLOWED_CONTENT_TYPES,
    build_stored_filename,
    sanitize_upload_filename,
    save_upload_file,
)


class AsyncUploadStub:
    def __init__(self, filename: str, content_type: str, body: bytes):
        self.filename = filename
        self.content_type = content_type
        self._body = body
        self._offset = 0

    async def read(self, size: int = -1) -> bytes:
        if self._offset >= len(self._body):
            return b""
        if size < 0:
            size = len(self._body) - self._offset
        chunk = self._body[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


def test_public_registration_is_disabled_by_default(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_PUBLIC_REGISTRATION", False)
    request = RegisterRequest(
        name="Bad Actor",
        email="bad@example.com",
        password="password123",
        role="admin",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(register(request))

    assert exc.value.status_code == 403
    assert "disabled" in exc.value.detail.lower()


def test_public_registration_cannot_create_privileged_roles(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_PUBLIC_REGISTRATION", True)
    request = RegisterRequest(
        name="Bad Actor",
        email="bad@example.com",
        password="password123",
        role="admin",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(register(request))

    assert exc.value.status_code == 403
    assert "employee" in exc.value.detail.lower()


def test_production_rejects_insecure_runtime_settings(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "JWT_SECRET", "change-this-secret")
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://example.com")
    monkeypatch.setattr(settings, "ALLOW_PUBLIC_REGISTRATION", False)

    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        validate_runtime_security_settings()


def test_upload_filename_sanitization_removes_paths():
    assert sanitize_upload_filename("../../evil file.pdf") == "evil_file.pdf"
    stored = build_stored_filename("../../evil file.pdf")
    assert "/" not in stored
    assert ".." not in stored
    assert stored.endswith("_evil_file.pdf")


def test_save_upload_file_rejects_unsupported_content_type(tmp_path):
    file = AsyncUploadStub("payload.html", "text/html", b"<script>alert(1)</script>")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(save_upload_file(file, tmp_path, CHAT_ALLOWED_CONTENT_TYPES))

    assert exc.value.status_code == 415
    assert not list(Path(tmp_path).iterdir())


def test_save_upload_file_enforces_size_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 4)
    file = AsyncUploadStub("notes.txt", "text/plain", b"12345")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(save_upload_file(file, tmp_path, CHAT_ALLOWED_CONTENT_TYPES))

    assert exc.value.status_code == 413
    assert not list(Path(tmp_path).iterdir())
