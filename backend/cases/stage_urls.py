from django.urls import path

from .comment_views import post_comment
from .stage_views import cases_stages

app_name = "cases-extra"

urlpatterns = [
    path("cases-stages", cases_stages, name="cases-stages"),
    path("cases/<caseuid:uid>/comment", post_comment, name="cases-comment"),
]
