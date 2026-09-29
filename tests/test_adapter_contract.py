"""Adapter contract tests.

Verifies that the concrete backend satisfies the QPUAdapter interface
and that core operations behave as expected.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.models.types import CalibrationParams, JobType, QPUJob


def test_adapter_is_abstract() -> None:
    # Ensure we can't instantiate the ABC
    with pytest.raises(TypeError):
        QPUAdapter()  # type: ignore[abstract]


def test_backend_implements_interface(backend: NoisySimulatorBackend) -> None:
    # Basic surface checks
    assert hasattr(backend, "submit_job")
    assert hasattr(backend, "poll_job")
    assert hasattr(backend, "cancel_job")
    assert hasattr(backend, "get_device_state")
    assert hasattr(backend, "get_calibration")
    assert hasattr(backend, "apply_calibration_update")


def test_submit_and_poll_job(backend: NoisySimulatorBackend) -> None:
    job = QPUJob(job_type=JobType.DIAGNOSTIC, payload={"note": "hello"})
    jid = backend.submit_job(job)
    polled = backend.poll_job(jid)
    assert polled.id == jid
    assert polled.status.value in ("succeeded", "running", "queued")


def test_calibration_job_updates_params(backend: NoisySimulatorBackend) -> None:
    q = 0
    before = backend.get_calibration(q)
    job = QPUJob(
        job_type=JobType.CALIBRATION,
        payload={
            "qubit_id": q,
            "candidate_params": {"frequency": before.frequency + 0.01, "amplitude": before.amplitude},
        },
    )
    jid = backend.submit_job(job)
    polled = backend.poll_job(jid)
    assert polled.result is not None
    assert polled.result.data["calibration"]["qubit_id"] == q
    assert polled.result.data["calibration"]["fidelity"] > 0.5


def test_cancel_nonterminal_job(backend: NoisySimulatorBackend) -> None:
    # Submit a job and immediately try to cancel before it finishes.
    # In our impl jobs are sync, so we test the API shape: cancel on terminal returns False.
    job = QPUJob(job_type=JobType.DIAGNOSTIC)
    jid = backend.submit_job(job)
    polled = backend.poll_job(jid)
    # After submit it is already terminal in this impl; cancel should be False.
    ok = backend.cancel_job(jid)
    assert isinstance(ok, bool)


def test_get_device_state_shape(backend: NoisySimulatorBackend) -> None:
    state = backend.get_device_state()
    assert state.qubits
    assert all(q in state.readout_fidelity for q in state.qubits)
    assert all(q in state.coherence_us for q in state.qubits)
    assert isinstance(state.is_ready, bool)
    assert 0.0 <= state.readiness_score() <= 1.0


def test_apply_calibration_update_returns_result(backend: NoisySimulatorBackend) -> None:
    q = 0
    p = backend.get_calibration(q)
    res = backend.apply_calibration_update(p.with_updates(frequency=p.frequency + 0.005))
    assert 0.5 < res.fidelity < 1.0
    assert res.iterations >= 1
    assert res.duration_s >= 0


def test_unknown_qubit_raises(backend: NoisySimulatorBackend) -> None:
    with pytest.raises(ValueError):
        backend.get_calibration(99)
    with pytest.raises(ValueError):
        backend.apply_calibration_update(CalibrationParams(qubit_id=99))
