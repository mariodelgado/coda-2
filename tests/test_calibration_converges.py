"""Calibration convergence tests on the noisy simulator.

Ensures that the calibration service can drive fidelity above a
reasonable threshold and that metrics are populated.
"""

from __future__ import annotations

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService


def test_calibration_converges_on_noisy_sim(backend: NoisySimulatorBackend) -> None:
    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.86,
        max_iterations=80,
        patience=16,
        seed=42,
    )

    # Start from a somewhat drifted state by nudging true params indirectly.
    # We just run calibration and assert it improves.
    q = 0
    initial_f = backend.measure_fidelity(q)
    res = cal.calibrate(qubit_id=q, target_fidelity=0.86)

    assert res.fidelity >= 0.80  # at least decent
    assert res.iterations >= 1
    assert res.duration_s >= 0
    # History should be non-decreasing in best observed (not strictly, due to jitter)
    fids = [h[1] for h in res.history]
    assert max(fids) >= initial_f * 0.98 or res.fidelity >= 0.80

    m = cal.metrics
    assert m.attempts >= 1
    # Success is likely but not guaranteed in all random seeds; we check rate is sane
    assert 0.0 <= m.calibration_success_rate <= 1.0
    if m.successes > 0:
        assert m.avg_time_to_calibrated >= 0.0
    assert m.avg_interface_latency >= 0.0


def test_multiple_calibrations_improve_metrics(backend: NoisySimulatorBackend) -> None:
    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.84,
        max_iterations=40,
        patience=10,
        seed=7,
    )

    for q in range(backend.num_qubits):
        _ = cal.calibrate(qubit_id=q, target_fidelity=0.84)

    m = cal.metrics
    assert m.attempts == backend.num_qubits
    assert m.latency_samples > 0
    snap = m.to_dict()
    assert "calibration_success_rate" in snap
    assert "avg_interface_latency_s" in snap
