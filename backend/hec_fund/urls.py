from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .url_converters import register_caseuid_converter

# Register the loose UUID converter that accepts both 32-char hex and the standard 36-char dashed UUID form.
register_caseuid_converter()


def health(_request):
    return JsonResponse({"status": "ok", "service": "hec-emergency-fund"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health, name="health"),
    path("api/v1/health", health, name="api-health"),
    path("api/v1/auth/login", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/auth/refresh", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/", include("accounts.urls")),
    path("api/v1/", include("cases.urls")),
    path("api/v1/", include("cases.upload_urls")),
    path("api/v1/", include("cases.stage_urls")),
    path("api/v1/", include("forms.urls")),
    path("api/v1/", include("approvals.urls")),
    path("api/v1/", include("audit.urls")),
    path("api/v1/", include("reports.urls")),
    path("api/v1/", include("payments.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
