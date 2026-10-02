"""Abstract QPU adapter contract.

This interface is the narrow waist between the orchestrator/agent layer
and any concrete backend (simulated or real). All methods are synchronous
for simplicity in a weekend prototype; real hardware would likely be async.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from uuid import UUID

from conductor_qpu.models.types import (
    CalibrationParams,
    CalibrationResult,
    DeviceState,
    QPUJob,
)


class QPUAdapter(ABC):
    """Control-plane surface for a QPU (or its simulator).

    Implementations must be thread/process safe for concurrent job
    submission if they maintain internal mutable state.
    """

    @abstractmethod
    def submit_job(self, job: QPUJob) -> UUID:
        """Accept a job and return its identifier.

        The job may be queued internally. Callers should poll via
        poll_job to observe progress.
        """
        raise NotImplementedError

    @abstractmethod
    def poll_job(self, job_id: UUID) -> QPUJob:
        """Return the current job record (with result if terminal)."""
        raise NotImplementedError

    @abstractmethod
    def cancel_job(self, job_id: UUID) -> bool:
        """Attempt to cancel a queued or running job.

        Returns True if cancellation took effect.
        """
        raise NotImplementedError

    @abstractmethod
    def get_device_state(self) -> DeviceState:
        """Snapshot of temperatures, coherence, readiness, etc."""
        raise NotImplementedError

    @abstractmethod
    def get_calibration(self, qubit_id: int) -> CalibrationParams:
        """Return the current best-known calibration for a qubit."""
        raise NotImplementedError

    @abstractmethod
    def apply_calibration_update(self, params: CalibrationParams) -> CalibrationResult:
        """Apply a candidate parameter set and measure its quality.

        Returns a result indicating fidelity and whether the device
        considers itself improved.
        """
        raise NotImplementedError
