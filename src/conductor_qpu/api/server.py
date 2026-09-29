"""FastAPI server exposing the QPU control plane.

Endpoints:
- POST /goals                 -> run a planner goal, return results + job ids
- GET  /jobs/{job_id}         -> poll a job
- GET  /metrics               -> control-plane + calibration metrics
- GET  /health                -> liveness
- POST /calibrate             -> direct calibration trigger
- POST /circuit/bell          -> direct Bell pair submission
- GET  /device/state          -> device snapshot
- GET  /sse/jobs/{job_id}     -> simple SSE stream of job status (polling under the hood)
"""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.models.types import JobType, QPUJob
from conductor_qpu.observability.metrics import MetricsAggregator
from conductor_qpu.orchestrator.orchestrator import Orchestrator
from conductor_qpu.orchestrator.planner import plan


app = FastAPI(title="Conductor QPU", version="0.1.0", docs_url="/docs")

# Singletons for the spike (stateless across restarts; fine for demo)
_backend = NoisySimulatorBackend(num_qubits=2, seed=42)
_calibration = CalibrationService(adapter=_backend, fidelity_threshold=0.88, max_iterations=60)
_job_store = InMemoryJobStore()
_orchestrator = Orchestrator(adapter=_backend, calibration=_calibration, job_store=_job_store)
_metrics = MetricsAggregator()


class GoalRequest(BaseModel):
    goal: str = Field(..., description="Natural language goal, e.g. 'Bring qubit 0 to ready'")


class GoalResponse(BaseModel):
    goal: str
    results: list[dict[str, Any]]
    metrics: dict[str, Any]


class CalibrateRequest(BaseModel):
    qubit_id: int = 0
    target_fidelity: float | None = None


class BellRequest(BaseModel):
    shots: int = 1024
    qubits: list[int] = Field(default_factory=lambda: [0, 1])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "conductor-qpu"}


@app.get("/device/state")
def device_state() -> dict[str, Any]:
    state = _backend.get_device_state()
    return {
        "is_ready": state.is_ready,
        "readiness_score": round(state.readiness_score(), 4),
        "qubits": state.qubits,
        "temperatures_mk": state.temperatures_mk,
        "coherence_us": {q: [round(a, 1), round(b, 1)] for q, (a, b) in state.coherence_us.items()},
        "readout_fidelity": {q: round(v, 4) for q, v in state.readout_fidelity.items()},
        "notes": state.notes,
        "timestamp": state.timestamp.isoformat(),
    }


@app.post("/goals")
def post_goal(req: GoalRequest) -> GoalResponse:
    results = _orchestrator.run_goal(req.goal)
    out = []
    for r in results:
        out.append({
            "ok": r.ok,
            "data": r.data,
            "latency_s": r.latency_s,
            "error": r.error,
        })
        if r.latency_s:
            _metrics.record_latency(r.latency_s)
    snap = _metrics.snapshot()
    return GoalResponse(goal=req.goal, results=out, metrics=snap)


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    try:
        jid = UUID(job_id)
    except ValueError as e:
        raise HTTPException(400, "invalid job_id") from e
    try:
        job = _backend.poll_job(jid)
    except KeyError as e:
        raise HTTPException(404, "job not found") from e
    return {
        "job_id": str(job.id),
        "status": job.status.value,
        "job_type": job.job_type.value,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "result": job.result.data if job.result else None,
        "metrics": job.result.metrics if job.result else None,
        "error": job.error,
    }


@app.post("/calibrate")
def post_calibrate(req: CalibrateRequest) -> dict[str, Any]:
    res = _calibration.calibrate(qubit_id=req.qubit_id, target_fidelity=req.target_fidelity)
    _metrics.record_fidelity(res.fidelity)
    return {
        "success": res.success,
        "fidelity": res.fidelity,
        "iterations": res.iterations,
        "duration_s": res.duration_s,
        "params": {
            "qubit_id": res.params.qubit_id,
            "frequency": res.params.frequency,
            "amplitude": res.params.amplitude,
            "readout_error": res.params.readout_error,
        },
        "history": res.history,
    }


@app.post("/circuit/bell")
def post_bell(req: BellRequest) -> dict[str, Any]:
    job = QPUJob(
        job_type=JobType.CIRCUIT,
        payload={"circuit": "bell", "shots": req.shots, "qubits": req.qubits},
    )
    jid = _backend.submit_job(job)
    polled = _backend.poll_job(jid)
    if polled.result:
        for _, v in polled.result.metrics.items():
            if isinstance(v, (int, float)):
                pass  # no-op; we record latency via orchestrator elsewhere
        return {
            "job_id": str(jid),
            "counts": polled.result.data.get("counts", {}),
            "metrics": polled.result.metrics,
        }
    return {"job_id": str(jid), "error": polled.error or "no result"}


@app.get("/metrics")
def get_metrics() -> dict[str, Any]:
    orch = _orchestrator.get_metrics()
    agg = _metrics.snapshot()
    return {
        "orchestrator": orch,
        "aggregator": agg,
        "calibration": _calibration.metrics.to_dict(),
    }


@app.get("/sse/jobs/{job_id}")
async def sse_job(job_id: str) -> StreamingResponse:
    """Minimal SSE: polls the job every 200ms and emits status updates."""
    try:
        jid = UUID(job_id)
    except ValueError as e:
        raise HTTPException(400, "invalid job_id") from e

    async def event_gen():
        last_status = None
        for _ in range(120):  # ~24s max
            try:
                job = _backend.poll_job(jid)
            except KeyError:
                yield f"event: error\ndata: {json.dumps({'error': 'not found'})}\n\n"
                return
            payload = {
                "job_id": str(job.id),
                "status": job.status.value,
                "result": job.result.data if job.result else None,
                "metrics": job.result.metrics if job.result else None,
            }
            if job.status.value != last_status:
                last_status = job.status.value
                yield f"event: update\ndata: {json.dumps(payload)}\n\n"
            if job.status.value in ("succeeded", "failed", "cancelled"):
                return
            await asyncio.sleep(0.2)
        yield f"event: timeout\ndata: {json.dumps({'job_id': str(jid)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


def run(host: str = "0.0.0.0", port: int = 8000) -> None:  # noqa: S104
    import uvicorn

    uvicorn.run("conductor_qpu.api.server:app", host=host, port=port, reload=False)
