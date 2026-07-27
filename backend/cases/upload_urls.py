from django.urls import path

from .upload_views import dev_put, finish, presign

app_name = "uploads"

urlpatterns = [
    path("uploads/presign", presign, name="uploads-presign"),
    path("uploads/finish", finish, name="uploads-finish"),
    path("uploads/dev-put", dev_put, name="uploads-dev-put"),
]
