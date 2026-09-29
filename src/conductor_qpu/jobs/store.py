"""In-memory job store for the control plane.

Keeps a bounded history for observability. Not durable; that's
intentional for a weekend prototype. Swap with a real store later.
"""

from __future__ import annotations

from threading import RLock
from uuid import UUID

from conductor_qpu.models.types import QPUJob


class InMemoryJobStore:
    """Thread-safe in-memory store with optional size bound."""

    def __init__(self, max_items: int = 4096) -> None:
        self._lock = RLock()
        self._jobs: dict[UUID, QPUJob] = {}
        self._order: list[UUID] = []
        self._max = max_items

    def put(self, job: QPUJob) -> None:
        with self._lock:
            if job.id in self._jobs:
                self._jobs[job.id] = job
                return
            if len(self._order) >= self._max:
                old = self._order.pop(0)
                self._jobs.pop(old, None)
            self._jobs[job.id] = job
            self._order.append(job.id)

    def get(self, job_id: UUID) -> QPUJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list_recent(self, limit: int = 50) -> list[QPUJob]:
        with self._lock:
            ids = list(reversed(self._order[-limit:]))
            return [self._jobs[i] for i in ids if i in self._jobs]
