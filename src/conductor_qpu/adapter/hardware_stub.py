"""ConductorShapedAdapter: structural stub for a real hardware control adapter.

This class exists to show *exactly* what a real driver must implement to
plug into the Conductor control plane.

It is deliberately NOT connected to any hardware.

Key realistic surface (what you'd see in a real AWG/DAC/FPGA driver):

- Job payloads carry pulse schedules, AWG channel configs, cal table refs.
- Execution for circuits would involve: compile/validate schedule, load
  waveform memory, arm triggers, wait for or receive completion/result.
- Calibration "apply" would version+commit a calibration table on the
  control system, then optionally verify with a quick measurement.
- Device state would include hardware health (pll lock, fpga temps,
  link status, last committed cal table id).

All paths that would actually touch hardware raise or return explicit
"not connected" errors/results. This makes the seam obvious to founders
and engineers who will replace it.

Usage:
    export CONDUCTOR_QPU_BACKEND=stub   # or 'hardware', 'shaped'
    # then the API server will use this instead of the noisy sim.

To integrate real hardware:
    class MyConductorDriver(ConductorShapedAdapter):
        def submit_job(self, job):
            if job.job_type == JobType.CIRCUIT:
                sched = job.payload.get("pulse_program") or job.payload
                # ... talk to your control stack ...
                # return job id from your queue
            ...
        ...
    # then return MyConductorDriver() from your factory
"""

from __future__ import annotations

import time
from datetime import datetime
from threading import RLock
from uuid import UUID, uuid4

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.models.types import (
    CalibrationParams,
    CalibrationResult,
    DeviceState,
    JobResult,
    JobStatus,
    JobType,
    QPUJob,
)


class ConductorShapedAdapter(QPUAdapter):
    """Stub implementation of the QPUAdapter surface.

    This is the *shape* a real hardware adapter would have.
    Clearly marked as disconnected.

    Replace the bodies of submit_job (for circuits), apply_calibration_update
    (for committing cal tables), and get_device_state with calls into your
    AWG / pulse sequencer / calibration store / monitor service.
    """

    # "Hardware" flavored constants / notes for realism in logs and state.
    HARDWARE_LINK = "DOWN"
    NOTES = "STUB - hardware not connected. This adapter only validates shape."

    def __init__(self) -> None:
        self._lock = RLock()
        self._jobs: dict[UUID, QPUJob] = {}
        self._last_applied: dict[int, CalibrationParams] = {}
        self._total_jobs = 0

    # ---------------- QPUAdapter impl (shape only) ----------------

    def submit_job(self, job: QPUJob) -> UUID:
        with self._lock:
            jid = job.id
            self._jobs[jid] = job
            self._total_jobs += 1
            job.mark_running()

            if job.job_type == JobType.CIRCUIT:
                # Real implementation would:
                #   - validate/lower 'pulse_program' or 'schedule'
                #   - allocate AWG channels / memory
                #   - load waveforms / sequences
                #   - arm triggers / start
                #   - wait or register callback for results
                #   - on completion fill counts / kernel / fidelity etc.
                jr = JobResult(
                    job_id=jid,
                    status=JobStatus.FAILED,
                    data={
                        "note": "hardware stub",
                        "payload_shape": {
                            k: (type(v).__name__ if not isinstance(v, (int, float, str, bool, list, dict)) else v)
                            for k, v in job.payload.items()
                        },
                    },
                    metrics={},
                    error=(
                        "NotImplemented: hardware not connected. "
                        "In a real driver you would program the AWG/DAC here, "
                        "arm the experiment, collect shots, and return counts."
                    ),
                )
                job.mark_failed(jr.error or "hardware not connected")

            elif job.job_type == JobType.CALIBRATION:
                # Accept the shape of a calibration job.
                # Real would: take params, write versioned cal table, optionally
                # run a verification sequence and return measured fidelity from hardware.
                q = int(job.payload.get("qubit_id", 0))
                cand = job.payload.get("candidate_params")
                if isinstance(cand, dict):
                    params = CalibrationParams(qubit_id=q, **cand)
                else:
                    params = self._last_applied.get(q, CalibrationParams(qubit_id=q))
                res = self.apply_calibration_update(params)
                jr = JobResult(
                    job_id=jid,
                    status=JobStatus.SUCCEEDED,
                    data={
                        "calibration": {
                            "qubit_id": q,
                            "fidelity": res.fidelity,
                            "note": "STUB - cal shape accepted, no hardware commit",
                            "params": {
                                "frequency": res.params.frequency,
                                "amplitude": res.params.amplitude,
                                "readout_error": res.params.readout_error,
                            },
                        }
                    },
                    metrics={"fidelity": res.fidelity},
                )
                job.mark_succeeded(jr)

            else:
                jr = JobResult(
                    job_id=jid,
                    status=JobStatus.SUCCEEDED,
                    data={"note": "diagnostic stub", "connected": False},
                    metrics={},
                )
                job.mark_succeeded(jr)

            return jid

    def poll_job(self, job_id: UUID) -> QPUJob:
        with self._lock:
            if job_id not in self._jobs:
                raise KeyError(f"Unknown job {job_id}")
            return self._jobs[job_id]

    def list_recent_jobs(self, limit: int = 50) -> list[QPUJob]:
        with self._lock:
            ids = list(self._jobs.keys())[-limit:]
            return [self._jobs[i] for i in ids]

    def cancel_job(self, job_id: UUID) -> bool:
        with self._lock:
            if job_id not in self._jobs:
                return False
            job = self._jobs[job_id]
            if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED):
                return False
            job.mark_cancelled()
            return True

    def get_device_state(self) -> DeviceState:
        with self._lock:
            # Return a plausible "hardware" snapshot but mark disconnected.
            # Real would query your monitor service / FPGA / environmental sensors.
            return DeviceState(
                timestamp=datetime.utcnow(),
                qubits=[0, 1],
                temperatures_mk={0: 18.3, 1: 18.1},
                coherence_us={0: (48.2, 29.1), 1: (47.9, 28.8)},
                readout_fidelity={0: 0.91, 1: 0.90},
                is_ready=False,  # stub is never "ready" for real work
                notes=self.NOTES + " (fpga_temp~42C, pll=LOCKED, link=DOWN in real driver)",
            )

    def get_calibration(self, qubit_id: int) -> CalibrationParams:
        with self._lock:
            if qubit_id not in self._last_applied:
                return CalibrationParams(qubit_id=qubit_id)
            return self._last_applied[qubit_id]

    def apply_calibration_update(
        self, params: CalibrationParams
    ) -> CalibrationResult:
        """Shape of committing a calibration table.

        Real implementation would:
          - validate params against allowed ranges / pulse constraints
          - write a new versioned cal table (or update live params on AWG)
          - optionally trigger a short verification measurement
          - return the table id + measured fidelity from that verification
        """
        with self._lock:
            self._last_applied[params.qubit_id] = params
            return CalibrationResult(
                success=True,
                params=params,
                fidelity=0.90,
                iterations=1,
                duration_s=0.0005,
                history=[(1, 0.90)],
                message=(
                    "STUB: calibration table shape accepted. "
                    "In real driver this would commit to your cal store / AWG memory."
                ),
            )

    # Extra surface for shape illustration (real drivers often have these)
    def get_detuning(self, qubit_id: int) -> dict[str, float]:
        """Would return current measured detuning from hardware diagnostics."""
        raise NotImplementedError(
            "Hardware not connected. Real driver would return measured frequency/amplitude "
            "errors from spectroscopy or Ramsey sequences."
        )

    # Compatibility surface used by the current Orchestrator/CalibrationService in demo paths
    def measure_fidelity(self, qubit_id: int) -> float:
        """Stub never claims high fidelity from real hardware."""
        return 0.55  # below any reasonable threshold
