import os
os.environ["DRF_SPECTACULAR_DISABLE_SCHEMA_WARNINGS"] = "1"

from .base import *

DEBUG = False
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="hec.example.com").split(",")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="hec"),
        "USER": config("DB_USER", default="hec"),
        "PASSWORD": config("DB_PASSWORD", default=""),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
        "CONN_MAX_AGE": 60,
    }
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="https://hec.example.com").split(",")

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=False, cast=bool)
SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=False, cast=bool)
CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=False, cast=bool)
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = config("EMAIL_HOST", default="smtp.example.com")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="no-reply@hec.example.com")

CELERY_BROKER_URL = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("REDIS_URL", default="redis://localhost:6379/0")

# S3 config (optional — if no endpoint/key, fall back to local filesystem)
AWS_S3_ENDPOINT_URL = config("S3_ENDPOINT_URL", default=None) or None
AWS_STORAGE_BUCKET_NAME = config("S3_BUCKET", default="hec-attachments")
AWS_S3_REGION_NAME = config("S3_REGION", default="eu-central-1")
AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="") or None
AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="") or None
AWS_S3_FILE_OVERWRITE = False
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}

# Use S3 only when endpoint + credentials are provided; otherwise local filesystem
_use_s3 = bool(AWS_STORAGE_BUCKET_NAME and (AWS_S3_ENDPOINT_URL or AWS_ACCESS_KEY_ID))

if _use_s3:
    STORAGES = {
        "default": {"BACKEND": "storages.backends.s3.S3Storage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
    # Ensure local files directory exists
    from pathlib import Path
    _files_dir = BASE_DIR / "files"
    _files_dir.mkdir(parents=True, exist_ok=True)

MEDICAL_CEILING_XAF = config("MEDICAL_CEILING_XAF", default=2_000_000, cast=int)
BURIAL_CEILING_XAF = config("BURIAL_CEILING_XAF", default=1_500_000, cast=int)
CROP_CEILING_XAF = config("CROP_CEILING_XAF", default=400_000, cast=int)
FIRST_AID_PCT = config("ACCELERATED_BENEFIT_PCT", default=20, cast=int)

APPROVAL_HMAC_SECRET = config("APPROVAL_HMAC_SECRET", default="")
