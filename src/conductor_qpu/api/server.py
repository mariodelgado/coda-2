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
import os
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from conductor_qpu.adapter.factory import create_backend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.models import types as model_types
from conductor_qpu.models.types import JobType, QPUJob
from conductor_qpu.observability.metrics import MetricsAggregator
from conductor_qpu.orchestrator.orchestrator import Orchestrator

# Optional import for demo long-job helper on sim
try:
    from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend  # type: ignore
except Exception:  # noqa: BLE001
    NoisySimulatorBackend = None  # type: ignore


app = FastAPI(title="Conductor QPU", version="0.1.0", docs_url="/docs")

# CORS for the Next.js UI (dev on :3000, prod builds may be same-origin or behind proxy)
# allow_headers=["*"] covers Access-Control-Request-Private-Network in preflight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Ensure Chromium private-network preflights succeed for local dev.
# CORSMiddleware short-circuits OPTIONS; this small ASGI middleware injects the
# header on responses that already carry ACAO (or for local origins).
@app.middleware("http")
async def add_private_network_header(request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    origin = (request.headers.get("origin") or "").lower()
    is_local = origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")
    # Always allow for local dev; harmless for non-private contexts.
    if is_local or response.headers.get("access-control-allow-origin"):
        # Set on every response (including preflight 204/200) so the browser sees it
        # during the private-network preflight sequence.
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

# Backend selection via env (CONDUCTOR_QPU_BACKEND=stub|sim)
# This is the single seam a real hardware driver plugs into.
_backend = create_backend()
_calibration = CalibrationService(adapter=_backend, fidelity_threshold=0.88, max_iterations=60)
_job_store = InMemoryJobStore()
_orchestrator = Orchestrator(adapter=_backend, calibration=_calibration, job_store=_job_store)
_metrics = MetricsAggregator()


class GoalRequest(BaseModel):
    goal: str = Field(..., description="Natural language goal, e.g. 'Bring qubit 0 to ready'")


class GoalResponse(BaseModel):
    goal: str
    user_message: str | None = None  # echo of the submitted goal for chat UIs
    agent_message: str | None = None  # plain-English narration for the operator
    results: list[dict[str, Any]]
    traces: list[dict[str, Any]] = []
    metrics: dict[str, Any]


class CalibrateRequest(BaseModel):
    qubit_id: int = 0
    target_fidelity: float | None = None


class BellRequest(BaseModel):
    shots: int = 1024
    qubits: list[int] = Field(default_factory=lambda: [0, 1])


@app.get("/health")
def health() -> dict[str, Any]:
    nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    llm_on = os.getenv("CONDUCTOR_ENABLE_LLM", "0") in ("1", "true", "yes") or bool(
        nvidia_key or groq_key or openai_key
    )

    raw_provider = os.getenv("CONDUCTOR_LLM_PROVIDER") or ""
    # normalize aliases for health output
    if raw_provider.lower() in ("nvidia", "nim", "nvidia-nim"):
        provider = "nvidia"
    elif raw_provider:
        provider = raw_provider.lower()
    else:
        provider = None

    if not provider and llm_on:
        if nvidia_key:
            provider = "nvidia"
        elif groq_key:
            provider = "groq"
        elif openai_key:
            provider = "openai"

    model = os.getenv("CONDUCTOR_LLM_MODEL")
    if not model:
        if (provider or "").lower() == "nvidia":
            model = "meta/llama-3.2-11b-vision-instruct"
        elif (provider or "").lower() == "groq":
            model = "llama-3.3-70b-versatile"
        elif provider:
            model = "gpt-4o-mini"
        else:
            model = None

    return {
        "status": "ok",
        "service": "conductor-qpu",
        "llm_planner": "on" if llm_on else "off",
        "llm_narrator": "on" if llm_on else "off",
        "llm_provider": provider,
        "llm_model": model,
    }


@app.get("/device/state")
def device_state() -> dict[str, Any]:
    state = _backend.get_device_state()
    # Surface the exact readiness predicate so UI can show numbers, not vibes.
    predicate = {
        "name": model_types.READINESS_PREDICATE_NAME,
        "readout_fidelity_threshold": model_types.READINESS_READOUT_FIDELITY_THRESHOLD,
        "description": "All qubits must have readout_fidelity >= threshold.",
    }
    return {
        "is_ready": state.is_ready,
        "readiness_score": round(state.readiness_score(), 4),
        "qubits": state.qubits,
        "temperatures_mk": state.temperatures_mk,
        "coherence_us": {q: [round(a, 1), round(b, 1)] for q, (a, b) in state.coherence_us.items()},
        "readout_fidelity": {q: round(v, 4) for q, v in state.readout_fidelity.items()},
        "notes": state.notes,
        "timestamp": state.timestamp.isoformat(),
        "readiness_predicate": predicate,
    }


@app.post("/goals")
def post_goal(req: GoalRequest) -> GoalResponse:
    # Capture a lightweight device snapshot for the narrator to reference
    try:
        dev = _backend.get_device_state()
        device_snapshot = {
            "is_ready": dev.is_ready,
            "readiness_score": round(dev.readiness_score(), 4),
            "readout_fidelity": {q: round(v, 4) for q, v in dev.readout_fidelity.items()},
            "temperatures_mk": dev.temperatures_mk,
        }
    except Exception:  # noqa: BLE001
        device_snapshot = None

    full = _orchestrator.run_goal_full(req.goal, device_snapshot=device_snapshot)
    out = full.get("results", [])
    for r in out:
        if r.get("latency_s"):
            try:
                _metrics.record_latency(float(r["latency_s"]))
            except Exception:  # noqa: BLE001
                pass
    traces = full.get("traces", [])
    snap = _metrics.snapshot()
    agent_msg = full.get("agent_message") or ""
    # Guarantee non-empty narration for the UI contract
    if not agent_msg or not str(agent_msg).strip():
        agent_msg = "Completed the requested action. See traces for details."
    return GoalResponse(
        goal=req.goal,
        user_message=req.goal,
        agent_message=agent_msg,
        results=out,
        traces=traces,
        metrics=snap,
    )


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


@app.get("/jobs")
def list_jobs(limit: int = 50) -> dict[str, Any]:
    """List recent jobs. In-memory; documented as non-durable."""
    jobs = _backend.list_recent_jobs(limit=limit)
    out = []
    for j in jobs:
        out.append(
            {
                "job_id": str(j.id),
                "status": j.status.value,
                "job_type": j.job_type.value,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "result": j.result.data if j.result else None,
                "metrics": j.result.metrics if j.result else None,
                "error": j.error,
            }
        )
    return {"jobs": out, "count": len(out)}


@app.get("/traces")
def get_traces() -> dict[str, Any]:
    """Return the most recent orchestrator tool traces (real control-plane decisions)."""
    return {"traces": _orchestrator.get_last_traces()}


@app.get("/device/detuning/{qubit_id}")
def get_detuning(qubit_id: int) -> dict[str, Any]:
    """Expose how far applied calibration is from the hidden 'true' hardware state.
    This is the 'problem' the calibration loop is solving. Surfaces drift.
    """
    try:
        d = _backend.get_detuning(qubit_id)
        applied = _backend.get_calibration(qubit_id)
        return {
            "qubit_id": qubit_id,
            "detuning": d,
            "applied": {
                "frequency": applied.frequency,
                "amplitude": applied.amplitude,
                "phase": applied.phase,
                "readout_error": applied.readout_error,
            },
        }
    except ValueError as e:
        raise HTTPException(404, str(e)) from e


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


# ---------------- Demo / Guardrail endpoints (founder demo) ----------------


@app.get("/readiness_predicate")
def readiness_predicate() -> dict[str, Any]:
    """Exact predicate used to declare a device 'ready'.
    Founders can point at the numbers.
    """
    return {
        "name": model_types.READINESS_PREDICATE_NAME,
        "readout_fidelity_threshold": model_types.READINESS_READOUT_FIDELITY_THRESHOLD,
        "description": "Device is_ready iff every qubit has readout_fidelity >= threshold.",
    }


@app.post("/demo/fail_next_cal")
def demo_fail_next_cal() -> dict[str, Any]:
    """Force the next calibration on the sim backend to be unable to reach threshold.
    Creates a reproducible 'failure despite trying' path for the founder demo.
    """
    cap = 0.69
    if hasattr(_backend, "set_demo_fid_cap"):
        _backend.set_demo_fid_cap(cap)
    return {
        "ok": True,
        "fid_cap": cap,
        "note": "next calibration attempts will be capped below readiness",
    }


@app.post("/demo/start_long_job")
def demo_start_long_job() -> dict[str, Any]:
    """Start a long-running diagnostic job that stays RUNNING until cancelled.
    Used to demo cancel guardrail in timeline + jobs list.
    """
    if hasattr(_backend, "start_demo_long_running_job"):
        jid = _backend.start_demo_long_running_job()
        return {"job_id": str(jid)}
    # fallback generic job
    job = QPUJob(job_type=JobType.DIAGNOSTIC, payload={"demo": "long_running"})
    jid = _backend.submit_job(job)
    return {"job_id": str(jid)}


def run(host: str = "0.0.0.0", port: int = 8000) -> None:  # noqa: S104
    import uvicorn

    uvicorn.run("conductor_qpu.api.server:app", host=host, port=port, reload=False)
