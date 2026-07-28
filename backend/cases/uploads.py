"""S3-compatible object store for form attachments.

Per master spec §5: S3-compatible (MinIO local · Wasabi prod) via
django-storages. Django NEVER proxies bytes — clients PUT directly via
presigned URLs.

Production settings configure `storages.backends.s3.S3Storage` and the
AWS_* env vars. In dev (SQLite + no S3), we fall back to a local-filesystem
implementation that mimics the presigned-URL flow against Django itself,
so the rest of the codebase (uploads/presign, /uploads/finish) is fully
exercisable without MinIO running.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

from django.conf import settings
from django.core.files.storage import default_storage


def _dev_local_root() -> Path:
    p = Path(settings.BASE_DIR) / "files"
    p.mkdir(parents=True, exist_ok=True)
    return p


def is_s3_backend() -> bool:
    """True when prod is configured AND S3 credentials are present.

    Returns False (local-fs fallback) when the storage backend is set to
    S3 but the required endpoint URL or access key is missing — e.g.
    when running docker-compose without a real object store.
    """
    backend = (settings.STORAGES or {}).get("default", {}).get("BACKEND", "")
    if "s3" not in backend.lower():
        return False
    # Need at least an endpoint URL or valid access key to actually use S3.
    endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None) or None
    access_key = getattr(settings, "AWS_ACCESS_KEY_ID", None) or None
    bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
    return bool(bucket and (endpoint or access_key))


def presign_put(*, key: str, mime: str, size: int) -> tuple[str, str, int]:
    """Return (upload_url, expires_at_iso, expires_in_seconds).

    On S3: real S3 presigned PUT URL.
    On dev: a Django URL that accepts the PUT (auth via signed query params).
    """
    expires_in = 60 * 15  # 15 min
    expires_at = int(time.time()) + expires_in

    if is_s3_backend():
        from storages.backends.s3boto3 import S3Boto3Storage
        from botocore.config import Config

        storage = S3Boto3Storage()
        client = storage.connection.meta.client
        url = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": storage.bucket_name,
                "Key": key,
                "ContentType": mime,
                "ContentLength": size,
            },
            ExpiresIn=expires_in,
            HttpMethod="PUT",
        )
        return url, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires_at)), expires_in

    # Dev: local-fs presign. Use a Django endpoint that validates HMAC.
    secret = settings.SECRET_KEY
    params = {
        "key": key,
        "size": str(size),
        "exp": str(expires_at),
    }
    sig = hmac.new(
        secret.encode("utf-8"),
        urlencode(sorted(params.items())).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    params["sig"] = sig
    params["mime"] = mime  # not in HMAC — just passed through
    url = f"/api/v1/uploads/dev-put?{urlencode(params)}"
    return url, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(expires_at)), expires_in


def new_attachment_key(*, case_uid: str, filename: str, file_type: str | None = None) -> str:
    """Generate a collision-resistant S3 key for a new attachment.

    Local layout (dev): {case_short}/evidence/{uuid}-{filename} or
                        {case_short}/case-files/{uuid}-{filename}
    where case_short is the first 8 hex chars of the case UUID.
    """
    safe = "".join(c for c in filename if c.isalnum() or c in {".", "-", "_"})[:128] or "file"
    case_short = str(case_uid).replace("-", "")[:8]
    folder = "case-files" if file_type else "evidence"
    return f"{case_short}/{folder}/{uuid.uuid4().hex[:16]}-{safe}"


def save_attachment_bytes(*, key: str, data: bytes) -> str:
    """Persist the bytes (S3 or local fs) and return the stored sha256."""
    sha = hashlib.sha256(data).hexdigest()
    if is_s3_backend():
        from storages.backends.s3boto3 import S3Boto3Storage
        S3Boto3Storage().save(key, __import__("io").BytesIO(data))
    else:
        root = _dev_local_root()
        path = root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        # Ensure the hec user can write (Docker container runs as hec)
        try:
            os.chmod(path.parent, 0o775)
        except OSError:
            pass
        path.write_bytes(data)
        try:
            os.chmod(path, 0o664)
        except OSError:
            pass
    return sha


def read_attachment_bytes(*, key: str) -> bytes | None:
    """Return the bytes for a stored attachment, or None if missing.

    On S3 we open and stream-read the object; on dev we read the local file.
    """
    if is_s3_backend():
        from storages.backends.s3boto3 import S3Boto3Storage

        storage = S3Boto3Storage()
        try:
            with storage.open(key, "rb") as fh:
                return fh.read()
        except Exception:
            return None
    path = _dev_local_root() / key
    if not path.exists():
        return None
    return path.read_bytes()


def presign_get(*, key: str, expires_in: int = 60 * 15) -> str | None:
    """Return a short-lived presigned GET URL for the object, or None on dev
    (the local backend has no signed GET — the download view serves bytes
    directly with session auth).
    """
    if not is_s3_backend():
        return None
    from storages.backends.s3boto3 import S3Boto3Storage

    storage = S3Boto3Storage()
    try:
        return storage.connection.meta.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": storage.bucket_name, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception:
        return None


def delete_attachment_bytes(*, key: str) -> bool:
    """Remove the underlying object from storage. Returns True if removed
    or did not exist; False on hard error. We never raise — the caller
    will still drop the DB row.
    """
    try:
        if is_s3_backend():
            from storages.backends.s3boto3 import S3Boto3Storage

            storage = S3Boto3Storage()
            try:
                storage.delete(key)
            except Exception:
                return False
            return True
        path = _dev_local_root() / key
        if path.exists():
            path.unlink()
        return True
    except Exception:
        return False
