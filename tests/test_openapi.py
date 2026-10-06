"""OpenAPI contract: tags, summaries, response models, committed schema."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from conductor_qpu.api.server import app

client = TestClient(app)

_REPO = Path(__file__).resolve().parents[1]
_COMMITTED = _REPO / "docs" / "openapi.json"

_REQUIRED_PATHS = {
    "/health",
    "/goals",
    "/jobs/{job_id}",
    "/device/state",
    "/readiness_predicate",
    "/tools",
    "/sse/calibration",
}

_REQUIRED_TAGS = {"health", "goals", "jobs", "device", "readiness", "tools"}


def test_openapi_json_served() -> None:
    r = client.get("/openapi.json")
    assert r.status_code == 200
    spec = r.json()
    assert spec["info"]["title"] == "Coda 2 control plane"
    paths = spec["paths"]
    for p in _REQUIRED_PATHS:
        assert p in paths, f"missing path {p}"


def test_openapi_tags_and_summaries() -> None:
    spec = client.get("/openapi.json").json()
    tag_names = {t["name"] for t in spec.get("tags", [])}
    assert _REQUIRED_TAGS <= tag_names

    health = spec["paths"]["/health"]["get"]
    assert health.get("summary")
    assert "health" in health.get("tags", [])

    goals = spec["paths"]["/goals"]["post"]
    assert goals.get("summary")
    assert "goals" in goals.get("tags", [])
    # Request body documents optional cost/risk fields
    schema_ref = goals["requestBody"]["content"]["application/json"]["schema"]
    assert schema_ref


def test_openapi_response_models_registered() -> None:
    spec = client.get("/openapi.json").json()
    schemas = spec["components"]["schemas"]
    for name in (
        "GoalRequest",
        "GoalResponse",
        "HealthResponse",
        "DeviceStateResponse",
        "ReadinessPredicate",
        "JobRecord",
        "ToolTraceModel",
        "ToolsCatalogResponse",
        "ErrorResponse",
    ):
        assert name in schemas, f"missing schema {name}"

    # Cost/risk fields exist on the goal request and traces
    goal_req = schemas["GoalRequest"]["properties"]
    assert "shots" in goal_req
    assert "mutates_calibration" in goal_req
    trace = schemas["ToolTraceModel"]["properties"]
    assert "shots" in trace
    assert "mutates_calibration" in trace


def test_committed_openapi_matches_app() -> None:
    assert _COMMITTED.is_file(), "docs/openapi.json missing; run make openapi"
    committed = json.loads(_COMMITTED.read_text(encoding="utf-8"))
    live = app.openapi()
    assert json.dumps(committed, sort_keys=True) == json.dumps(live, sort_keys=True)


def test_tools_catalog() -> None:
    r = client.get("/tools")
    assert r.status_code == 200
    body = r.json()
    names = {t["name"] for t in body["tools"]}
    assert names == {
        "calibrate_qubit",
        "run_bell_pair",
        "get_device_state",
        "get_job_status",
        "cancel_job",
    }
    cal = next(t for t in body["tools"] if t["name"] == "calibrate_qubit")
    assert cal["mutates_calibration"] is True
    bell = next(t for t in body["tools"] if t["name"] == "run_bell_pair")
    assert bell["mutates_calibration"] is False
    assert bell["default_shots"] == 1024


def test_goal_traces_include_cost_risk() -> None:
    r = client.post("/goals", json={"goal": "Bring qubit 0 to ready"})
    assert r.status_code == 200
    traces = r.json()["traces"]
    assert traces
    cal = next(t for t in traces if t["tool"] == "calibrate_qubit")
    assert cal["mutates_calibration"] is True


def test_goal_shots_override() -> None:
    r = client.post(
        "/goals",
        json={"goal": "Run a Bell pair and report fidelity", "shots": 256},
    )
    assert r.status_code == 200
    traces = r.json()["traces"]
    bell = next(t for t in traces if t["tool"] == "run_bell_pair")
    assert bell.get("shots") == 256
    assert bell["mutates_calibration"] is False


def test_mutates_calibration_false_rejects_calibrate_goal() -> None:
    r = client.post(
        "/goals",
        json={"goal": "Bring qubit 0 to ready", "mutates_calibration": False},
    )
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert detail["code"] == "CALIBRATION_MUTATION_FORBIDDEN"


def test_job_error_codes() -> None:
    bad = client.get("/jobs/not-a-uuid")
    assert bad.status_code == 400
    assert bad.json()["detail"]["code"] == "INVALID_JOB_ID"

    missing = client.get("/jobs/00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "JOB_NOT_FOUND"


def test_docs_ui_served() -> None:
    r = client.get("/docs")
    assert r.status_code == 200
