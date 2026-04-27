from backend.services.collection_scheduler import dispatch_due_collection_jobs
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async


@celery_app.task(name="backend.tasks.dispatch_due_collection_jobs", bind=True)
def dispatch_due_collection_jobs_task(self) -> dict[str, object]:
    summary = run_async(dispatch_due_collection_jobs())
    summary["celery_task_id"] = self.request.id
    return summary
