from celery import Celery

from backend.config import settings

celery_app = Celery(
    "hunter",
    broker=settings.resolved_celery_broker_url,
    backend=settings.resolved_celery_result_backend,
    include=[
        "backend.tasks.collection",
        "backend.tasks.scheduler",
        "backend.tasks.nlp_pipeline",
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
        }
    },
)
