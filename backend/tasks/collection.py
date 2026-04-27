from uuid import UUID

from backend.services.hunting_runner import run_hunting_job
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async


@celery_app.task(name="backend.tasks.run_hunting_job", bind=True)
def run_hunting_job_task(self, job_id: str) -> dict:
    run_async(run_hunting_job(UUID(job_id)))
    return {
        "job_id": job_id,
        "celery_task_id": self.request.id,
    }
