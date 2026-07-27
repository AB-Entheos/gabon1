from django.urls import path, re_path

from .views import (
    delete_attachment,
    download_attachment,
    get_form,
    list_forms,
    list_submissions,
    publish_form,
    submit_form,
)

app_name = "forms"

urlpatterns = [
    path("forms", list_forms, name="forms-list"),
    path("forms/<slug:slug>", get_form, name="forms-detail"),
    path("forms/<slug:slug>/v<int:version>/submissions", submit_form, name="forms-submit"),
    path("cases/<caseuid:uid>/submissions", list_submissions, name="cases-submissions"),
    path("admin/forms", publish_form, name="admin-forms-publish"),
    path(
        "submission/<int:submission_id>/attachment/<int:attachment_id>",
        download_attachment,
        name="attachment-download",
    ),
    path(
        "submission/<int:submission_id>/attachment/<int:attachment_id>/delete",
        delete_attachment,
        name="attachment-delete",
    ),
]
