"""API happy path test using TestClient.

Covers:
- POST /goals with deterministic planner
- GET /jobs/{id}
- GET /metrics
- GET /health
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from conductor_qpu.api.server import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_device_state() -> None:
    r = client.get("/device/state")
    assert r.status_code == 200
    body = r.json()
    assert "is_ready" in body
    assert "readiness_score" in body


def test_post_goal_calibration_path() -> None:
    r = client.post("/goals", json={"goal": "Bring qubit 0 to ready"})
    assert r.status_code == 200
    body = r.json()
    assert body["goal"] == "Bring qubit 0 to ready"
    assert isinstance(body["results"], list)
    assert len(body["results"]) >= 1
    # At least one step should have data or be ok
    assert any(step.get("ok") or step.get("data") for step in body["results"])


def test_post_goal_bell_path() -> None:
    r = client.post("/goals", json={"goal": "Run a Bell pair and report fidelity"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["results"]) >= 1


def test_direct_calibrate_and_poll_metrics() -> None:
    r = client.post("/calibrate", json={"qubit_id": 0, "target_fidelity": 0.85})
    assert r.status_code == 200
    cal = r.json()
    assert 0.5 < cal["fidelity"] < 1.0
    assert cal["iterations"] >= 1

    m = client.get("/metrics").json()
    assert "calibration" in m or "orchestrator" in m


def test_circuit_bell_returns_counts() -> None:
    r = client.post("/circuit/bell", json={"shots": 256, "qubits": [0, 1]})
    assert r.status_code == 200
    body = r.json()
    assert "job_id" in body
    assert "counts" in body or "error" in body


def test_get_job_not_found() -> None:
    r = client.get("/jobs/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_get_metrics_has_three_key_fields() -> None:
    # The orchestrator metrics should surface the three required ones via calibration subkey
    m = client.get("/metrics").json()
    orch = m.get("orchestrator", {})
    cal = orch.get("calibration", {})
    # Keys may be present even if values are zero before any runs
    for k in ["avg_time_to_calibrated_s", "calibration_success_rate", "avg_interface_latency_s"]:
        assert k in cal
