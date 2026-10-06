"""Golden path: Calibrate Q0 → live READY → Bell estimated_fidelity.

Uses the existing noisy sim. Band is wide on purpose — do not overfit a
single seed or shot count. Also covers Bell-first-while-unready, which
must prepend calibrate so the Safari demo cannot skip the climb.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.api.server import app
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.orchestrator.orchestrator import Orchestrator
from conductor_qpu.orchestrator.planner import q0_ready_for_circuits

# Sensible post-cal Bell band for the toy sim (P(00)+P(11) / estimated_fidelity).
_FID_LO = 0.60
_FID_HI = 1.0

client = TestClient(app)


def _force_q0_unready(backend: NoisySimulatorBackend) -> None:
    """Detune Q0 enough to drop below the 0.82 floor, but stay climbable.

    Offsets stay inside CalibrationService's neighbor box so a following
    calibrate can still reach threshold (unlike a 4.0 GHz / 0.18 RO park).
    """
    current = backend.get_calibration(0)
    backend.apply_calibration_update(
        current.with_updates(
            frequency=min(5.85, current.frequency + 0.78),
            readout_error=0.16,
        )
    )


def _bell_fidelity(results: list[dict]) -> float | None:
    for step in results or []:
        data = (step or {}).get("data") or {}
        metrics = data.get("metrics") or {}
        if isinstance(metrics, dict) and metrics.get("estimated_fidelity") is not None:
            return float(metrics["estimated_fidelity"])
        counts = data.get("counts")
        if isinstance(counts, dict) and counts:
            total = sum(int(v) for v in counts.values()) or 1
            return (int(counts.get("00", 0)) + int(counts.get("11", 0))) / total
    return None


def _q0_snapshot(backend: NoisySimulatorBackend) -> dict:
    state = backend.get_device_state()
    return {
        "is_ready": state.is_ready,
        "readiness_score": round(state.readiness_score(), 4),
        "readout_fidelity": {q: round(v, 4) for q, v in state.readout_fidelity.items()},
    }


def test_api_calibrate_ready_bell_fidelity_band() -> None:
    cal = client.post("/goals", json={"goal": "Bring qubit 0 to ready"})
    assert cal.status_code == 200
    cal_body = cal.json()
    assert any(
        (step.get("data") or {}).get("fidelity") is not None for step in cal_body.get("results", [])
    )

    ready = client.post("/goals", json={"goal": "Report qubit 0 readiness and fidelity status"})
    assert ready.status_code == 200
    ready_body = ready.json()
    assert any(t.get("tool") == "get_device_state" for t in ready_body.get("traces", []))

    dev = client.get("/device/state")
    assert dev.status_code == 200
    dbody = dev.json()
    snap = {
        "is_ready": dbody.get("is_ready"),
        "readout_fidelity": dbody.get("readout_fidelity") or {},
    }
    assert q0_ready_for_circuits(snapshot=snap) is True

    bell = client.post("/goals", json={"goal": "Run a Bell pair and report fidelity"})
    assert bell.status_code == 200
    body = bell.json()
    fid = _bell_fidelity(body.get("results") or [])
    assert fid is not None
    assert _FID_LO <= fid <= _FID_HI, f"estimated_fidelity {fid} outside [{_FID_LO}, {_FID_HI}]"
    agent = (body.get("agent_message") or "").lower()
    assert "fidelity" in agent or "correlation" in agent


def test_bell_first_while_unready_calibrates_then_bells(
    backend: NoisySimulatorBackend,
) -> None:
    _force_q0_unready(backend)
    snap0 = _q0_snapshot(backend)
    assert q0_ready_for_circuits(snapshot=snap0) is False

    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.88,
        max_iterations=50,
        patience=10,
        seed=99,
    )
    orch = Orchestrator(adapter=backend, calibration=cal)
    results = orch.run_goal("Run a Bell pair and report fidelity")
    traces = orch.get_last_traces()
    tools = [t["tool"] for t in traces]
    assert tools[0] == "calibrate_qubit"
    assert "run_bell_pair" in tools

    snap1 = _q0_snapshot(backend)
    assert q0_ready_for_circuits(snapshot=snap1) is True

    packed = [
        {"ok": r.ok, "data": r.data, "latency_s": r.latency_s, "error": r.error} for r in results
    ]
    fid = _bell_fidelity(packed)
    assert fid is not None
    assert _FID_LO <= fid <= _FID_HI, f"estimated_fidelity {fid} outside [{_FID_LO}, {_FID_HI}]"


def test_orchestrator_golden_path_calibrate_then_bell(
    backend: NoisySimulatorBackend,
) -> None:
    _force_q0_unready(backend)
    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.88,
        max_iterations=50,
        patience=10,
        seed=99,
    )
    orch = Orchestrator(adapter=backend, calibration=cal)

    cal_results = orch.run_goal("Bring qubit 0 to ready")
    assert any("fidelity" in (r.data or {}) for r in cal_results)
    assert q0_ready_for_circuits(snapshot=_q0_snapshot(backend)) is True

    status = orch.run_goal("Report qubit 0 readiness and fidelity status")
    assert status and status[0].ok
    assert "is_ready" in (status[0].data or {})

    bell_results = orch.run_goal("Run a Bell pair and report fidelity")
    traces = orch.get_last_traces()
    assert [t["tool"] for t in traces] == ["run_bell_pair"]
    packed = [
        {"ok": r.ok, "data": r.data, "latency_s": r.latency_s, "error": r.error}
        for r in bell_results
    ]
    fid = _bell_fidelity(packed)
    assert fid is not None
    assert _FID_LO <= fid <= _FID_HI


def test_literacy_goals_do_not_calibrate_or_bell() -> None:
    """Dock literacy asks are get_device_state + observation copy only."""
    for goal in ("What does READY mean?", "Why do counts vary?"):
        body = client.post("/goals", json={"goal": goal})
        assert body.status_code == 200
        payload = body.json()
        tools = [t.get("tool") for t in payload.get("traces", [])]
        assert tools == ["get_device_state"], goal
        agent = (payload.get("agent_message") or "").lower()
        assert "collaps" in agent or "sample" in agent
        assert "drift" in agent or "recalibrat" in agent
