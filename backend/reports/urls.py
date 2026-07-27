from django.urls import path

from .views import annual_report, quarterly_report, summary

app_name = "reports"

urlpatterns = [
    path("reports/quarterly", quarterly_report, name="reports-quarterly"),
    path("reports/annual", annual_report, name="reports-annual"),
    path("reports/summary", summary, name="reports-summary"),
]
