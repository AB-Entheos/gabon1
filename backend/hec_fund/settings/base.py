from pathlib import Path
from decouple import AutoConfig

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Use AutoConfig: reads .env if present, otherwise falls back to OS env vars
_config_path = str(BASE_DIR.parent)
config = AutoConfig(_config_path)

SECRET_KEY = config("SECRET_KEY", default="dev-insecure-secret-change-me-in-prod")
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "drf_spectacular",
    "accounts",
    "cases",
    "forms",
    "approvals",
    "audit",
    "reports",
    "payments",
    "notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "audit.middleware.AuditMiddleware",
]

ROOT_URLCONF = "hec_fund.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.i18n",
                "django.template.context_processors.media",
                "django.template.context_processors.static",
            ],
        },
    },
]

WSGI_APPLICATION = "hec_fund.wsgi.application"

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr"
TIME_ZONE = "Africa/Libreville"
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ("en", "English"),
    ("fr", "Français"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

LANGUAGE_COOKIE_NAME = "hec.lang"
LANGUAGE_COOKIE_AGE = 60 * 60 * 24 * 365
LANGUAGE_COOKIE_PATH = "/"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Upload limits — case evidence files (incident photos, PDFs) can be large.
# Raise the default (2.5MB) so the dev-put sink and direct POSTs to /uploads/finish
# can accept up to 30MB. The frontend caps uploads at 25MB.
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024  # 30 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024  # 30 MB (per-file streamed-to-disk threshold)
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10000

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# We use canonical non-trailing-slash URLs (e.g. /api/v1/cases) so the
# OpenAPI schema is clean. APPEND_SLASH=False prevents 301 redirects for
# clients that hit `/api/v1/cases/` by accident.
APPEND_SLASH = False

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min",
        "user": "600/min",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 1000,  # generous; admin tables rarely exceed this. /cases?page=N still works.
}

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "HEC Emergency Fund API",
    "DESCRIPTION": "Approval chain for human–elephant conflict compensation claims in Gabon.",
    "VERSION": "1.0.1",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "CAMELIZE_NAMES": False,
    # We expose both `/foo` and `/foo/` so client + APPEND_SLASH both work.
    # The resulting OpenAPI operationId collisions are cosmetic.
    # We silence them via the WARNINGS setting below.
    "ENUM_NAME_OVERRIDES": {},
    "GENERIC_SERIALIZERS": {},
}

# Silence the OpenAPI generator's cosmetic warnings. These do not affect
# runtime behavior; they're about how the schema document renders.
import os
os.environ.setdefault("DRF_SPECTACULAR_DISABLE_SCHEMA_WARNINGS", "1")

OTP_TOTP_ISSUER = "HEC Emergency Fund"

CORS_ALLOWED_ORIGINS = []
CORS_ALLOW_CREDENTIALS = True

CELERY_BROKER_URL = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60

CELERY_BEAT_SCHEDULE = {
    "nightly-pg-dump": {
        "task": "approvals.tasks.nightly_pg_dump",
        "schedule": 60 * 60 * 24,  # 24h
    },
    "check-sla-breaches": {
        "task": "approvals.tasks.check_sla_breaches",
        "schedule": 60 * 60 * 24,  # daily
    },
    "auto-approve-scans": {
        "task": "approvals.tasks.auto_approve_scans",
        "schedule": 60 * 5,  # every 5 minutes
    },
}

APPROVAL_HMAC_SECRET = config("APPROVAL_HMAC_SECRET", default="dev-hmac-secret-change-me")

# Resend email API
RESEND_API_KEY = config("RESEND_API_KEY", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="hec@ab-entheos.com")
FRONTEND_URL = config("FRONTEND_URL", default="https://hec.ab-entheos.com")

MEDICAL_CEILING_XAF = 2_000_000
BURIAL_CEILING_XAF = 3_000_000

LOGIN_URL = "/admin/login/"
LOGIN_REDIRECT_URL = "/admin/"
