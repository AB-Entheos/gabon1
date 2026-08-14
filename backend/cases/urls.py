from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CaseViewSet, deleted_cases, list_disbursements

app_name = "cases"

router = DefaultRouter(trailing_slash=False)
router.register(r"cases", CaseViewSet, basename="case")

urlpatterns = router.urls
urlpatterns += [
	path("deleted-cases", deleted_cases, name="deleted-cases"),
	path("disbursements", list_disbursements, name="disbursements"),
]
