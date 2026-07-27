import os
from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")

app = Celery("hec_fund")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
