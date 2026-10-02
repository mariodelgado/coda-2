"""Core typed models for the QPU control plane."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class JobStatus(str, Enum):
    """Lifecycle states for a QPU job."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    """High-level job categories understood by the orchestrator."""

    CALIBRATION = "calibration"
    CIRCUIT = "circuit"
    DIAGNOSTIC = "diagnostic"


# Exact readiness predicate constants (surfaced to UI/API for founder clarity).
# A device is "ready" only if ALL qubits meet the readout fidelity floor.
READINESS_READOUT_FIDELITY_THRESHOLD: float = 0.82
READINESS_PREDICATE_NAME = "all_qubits_readout_fidelity_above"


@dataclass(frozen=True)
class CalibrationParams:
    """Tunable parameters for a qubit or device.

    These are the knobs the calibration service adjusts. Values are
    intentionally unitless/fake; they only matter relative to the
    NoisySimulatorBackend's internal model.
    """

    qubit_id: int
    frequency: float = 5.0  # GHz-scale fake
    amplitude: float = 0.5  # drive amplitude
    phase: float = 0.0  # radians
    t1: float = 50.0  # us (relaxation)
    t2: float = 30.0  # us (dephasing)
    readout_error: float = 0.05  # probability

    def with_updates(self, **kwargs: float) -> CalibrationParams:
        """Return a new instance with the given fields updated."""
        data = {
            "qubit_id": self.qubit_id,
            "frequency": self.frequency,
            "amplitude": self.amplitude,
            "phase": self.phase,
            "t1": self.t1,
            "t2": self.t2,
            "readout_error": self.readout_error,
        }
        data.update(kwargs)
        return CalibrationParams(**data)


@dataclass(frozen=True)
class DeviceState:
    """Snapshot of device health and readiness."""

    timestamp: datetime
    qubits: list[int]
    temperatures_mk: dict[int, float]
    coherence_us: dict[int, tuple[float, float]]  # (T1, T2) per qubit
    readout_fidelity: dict[int, float]
    is_ready: bool
    notes: str = ""

    def readiness_score(self) -> float:
        """Aggregate 0..1 score. Higher is better."""
        if not self.qubits:
            return 0.0
        fid_sum = sum(self.readout_fidelity.get(q, 0.0) for q in self.qubits)
        return max(0.0, min(1.0, fid_sum / len(self.qubits)))


@dataclass(frozen=True)
class CalibrationResult:
    """Outcome of a calibration run."""

    success: bool
    params: CalibrationParams
    fidelity: float
    iterations: int
    duration_s: float
    history: list[tuple[int, float]] = field(default_factory=list)  # (iter, fidelity)
    message: str = ""


@dataclass(frozen=True)
class JobResult:
    """Structured result returned after a job completes."""

    job_id: UUID
    status: JobStatus
    data: dict[str, Any]
    metrics: dict[str, float]
    error: str | None = None


@dataclass
class QPUJob:
    """Mutable job record tracked by the control plane."""

    id: UUID = field(default_factory=uuid4)
    job_type: JobType = JobType.DIAGNOSTIC
    status: JobStatus = JobStatus.QUEUED
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    result: JobResult | None = None
    error: str | None = None

    def mark_running(self) -> None:
        self.status = JobStatus.RUNNING
        self.started_at = datetime.utcnow()

    def mark_succeeded(self, result: JobResult) -> None:
        self.status = JobStatus.SUCCEEDED
        self.completed_at = datetime.utcnow()
        self.result = result

    def mark_failed(self, error: str) -> None:
        self.status = JobStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error = error

    def mark_cancelled(self) -> None:
        self.status = JobStatus.CANCELLED
        self.completed_at = datetime.utcnow()
