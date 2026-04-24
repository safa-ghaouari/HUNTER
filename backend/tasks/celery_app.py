from celery import Celery
from celery.schedules import crontab

from backend.config import settings

celery_app = Celery(
    "hunter",
    broker=settings.resolved_celery_broker_url,
    backend=settings.resolved_celery_result_backend,
    include=[
        "backend.tasks.collection",
        "backend.tasks.scheduler",
        "backend.tasks.nlp_pipeline",
        "backend.tasks.backup",
        "backend.tasks.sigma_scan",
    ],
)

celery_app.conf.update(
    accept_content=["json"],
    task_serializer="json",
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "dispatch-due-collection-jobs": {
            "task": "backend.tasks.dispatch_due_collection_jobs",
            "schedule": settings.collection_scheduler_interval_seconds,
        },
        "daily-postgres-backup": {
            "task": "backend.tasks.run_backup",
            "schedule": crontab(hour=2, minute=0),
        },
        "sigma-rule-scan": {
            "task": "backend.tasks.run_sigma_scan",
            "schedule": crontab(minute="*/15"),
        },
    },
)
