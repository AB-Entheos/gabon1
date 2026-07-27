from django.urls import path

from .views import list_audit

app_name = "audit"

urlpatterns = [
    path("admin/audit", list_audit, name="audit-list"),
]
