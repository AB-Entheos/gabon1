from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CaseViewSet

app_name = "cases"

router = DefaultRouter(trailing_slash=False)
router.register(r"cases", CaseViewSet, basename="case")

urlpatterns = router.urls
