"""Calibration climb SSE: on_step emission, bus, generator, API route."""

from __future__ import annotations

import asyncio
from queue import Empty

import pytest
from fastapi.testclient import TestClient

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.api.events import ClimbEventBus, climb_payload, format_sse, iter_climb_sse
from conductor_qpu.api.server import app
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.models.types import CalibrationParams, CalibrationResult

client = TestClient(app)


def test_calibrate_on_step_emits_start_progress_and_done(
    backend: NoisySimulatorBackend,
) -> None:
    steps: list[tuple[int, str, float]] = []
    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.86,
        max_iterations=80,
        patience=16,
        seed=42,
    )
    res = cal.calibrate(
        qubit_id=0,
        target_fidelity=0.86,
        on_step=lambda i, r: steps.append((i, r.message, r.history[-1][1])),
    )
    assert len(steps) >= 3
    assert steps[0][0] == 0
    assert steps[0][1] == "In progress"
    assert any(i > 0 and msg == "In progress" for i, msg, _ in steps)
    assert steps[-1][1] != "In progress"
    assert steps[-1][0] == res.iterations
    assert res.history
    assert res.history[0][0] == 0


def test_climb_payload_and_sse_frame() -> None:
    res = CalibrationResult(
        success=False,
        params=CalibrationParams(qubit_id=0),
        fidelity=0.81,
        iterations=3,
        duration_s=0.1,
        history=[(0, 0.60), (3, 0.74)],
        message="In progress",
    )
    payload = climb_payload(3, res, threshold=0.88, phase="step")
    assert payload["iter"] == 3
    assert payload["fidelity"] == 0.74
    assert payload["best_fidelity"] == 0.81
    assert payload["done"] is False
    frame = format_sse("climb", payload)
    assert frame.startswith("event: climb\n")
    assert '"iter": 3' in frame


def test_climb_bus_publish_subscribe() -> None:
    bus = ClimbEventBus()
    assert bus.has_subscribers() is False
    q = bus.subscribe()
    assert bus.subscriber_count() == 1
    bus.publish({"iter": 1, "fidelity": 0.7})
    assert q.get_nowait()["iter"] == 1
    bus.unsubscribe(q)
    assert bus.has_subscribers() is False
    bus.publish({"iter": 2})  # no subscribers: must not raise


@pytest.mark.asyncio
async def test_iter_climb_sse_emits_published_events() -> None:
    bus = ClimbEventBus()
    frames: list[str] = []

    async def consume() -> None:
        async for frame in iter_climb_sse(bus, max_s=2.0, keepalive_s=10.0, poll_s=0.01):
            frames.append(frame)
            if "0.91" in frame:
                break

    task = asyncio.create_task(consume())
    for _ in range(80):
        if bus.has_subscribers():
            break
        await asyncio.sleep(0.01)
    assert bus.has_subscribers()
    bus.publish(
        {
            "phase": "step",
            "qubit_id": 0,
            "iter": 1,
            "fidelity": 0.77,
            "best_fidelity": 0.77,
            "threshold": 0.88,
            "success": False,
            "done": False,
        }
    )
    bus.publish(
        {
            "phase": "done",
            "qubit_id": 0,
            "iter": 2,
            "fidelity": 0.91,
            "best_fidelity": 0.91,
            "threshold": 0.88,
            "success": True,
            "done": True,
        }
    )
    await asyncio.wait_for(task, timeout=3)
    blob = "".join(frames)
    assert "hello" in blob
    assert "calibration" in blob
    assert "0.77" in blob
    assert "0.91" in blob


def test_sse_calibration_listed_in_openapi() -> None:
    spec = client.get("/openapi.json").json()
    route = spec["paths"]["/sse/calibration"]["get"]
    assert route.get("summary")
    assert "jobs" in route.get("tags", [])


def test_server_calibrate_publishes_climb_events() -> None:
    from conductor_qpu.api.server import _calibration, _climb_bus

    q = _climb_bus.subscribe()
    try:
        res = _calibration.calibrate(qubit_id=0, target_fidelity=0.85)
        events = []
        while True:
            try:
                events.append(q.get_nowait())
            except Empty:
                break
        assert len(events) >= 2
        assert events[0]["phase"] == "start"
        assert events[0]["iter"] == 0
        assert events[-1]["done"] is True
        assert events[-1]["iter"] == res.iterations
        assert any(e.get("phase") == "step" for e in events)
    finally:
        _climb_bus.unsubscribe(q)


def test_goals_still_returns_full_history() -> None:
    r = client.post("/goals", json={"goal": "Bring qubit 0 to ready"})
    assert r.status_code == 200
    body = r.json()
    cal = next(
        (s for s in body["results"] if isinstance((s.get("data") or {}).get("history"), list)),
        None,
    )
    assert cal is not None
    hist = cal["data"]["history"]
    assert len(hist) >= 2
    assert hist[0][0] == 0
    assert all(len(row) == 2 for row in hist)
    assert body.get("agent_message")
