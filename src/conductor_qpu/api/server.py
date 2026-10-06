"""FastAPI server exposing the QPU control plane.

Same contract as the instrument UI: NL goals compile to typed tools,
every call leaves a trace, readiness is a number with a predicate.

Endpoints:
- POST /goals                 -> run a planner goal, return results + traces
- GET  /jobs/{job_id}         -> poll a job
- GET  /jobs                  -> list recent jobs (in-memory)
- GET  /metrics               -> control-plane + calibration metrics
- GET  /health                -> liveness
- GET  /tools                 -> enumerable tool catalog (cost/risk metadata)
- POST /calibrate             -> direct calibration trigger
- POST /circuit/bell          -> direct Bell pair submission
- GET  /device/state          -> device snapshot
- GET  /readiness_predicate   -> exact READY predicate
- GET  /sse/jobs/{job_id}     -> SSE stream of job status
- GET  /sse/calibration       -> SSE stream of live climb points during anneal
- GET  /openapi.json          -> machine-readable OpenAPI schema
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any
from uuid import UUID

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from conductor_qpu.adapter.factory import create_backend
from conductor_qpu.api.errors import ErrorCode, api_error
from conductor_qpu.api.events import (
    CLIMB_STEP_PAUSE_S,
    ClimbEventBus,
    climb_payload,
    iter_climb_sse,
)
from conductor_qpu.api.schemas import (
    OPENAPI_TAGS,
    TOOLS_CATALOG,
    BellRequest,
    BellResponse,
    CalibrateRequest,
    CalibrateResponse,
    DemoFailCalResponse,
    DemoLongJobResponse,
    DetuningResponse,
    DeviceStateResponse,
    ErrorResponse,
    GoalRequest,
    GoalResponse,
    HealthResponse,
    JobListResponse,
    JobRecord,
    MetricsResponse,
    ReadinessPredicate,
    ToolsCatalogResponse,
    TracesResponse,
)
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.models import types as model_types
from conductor_qpu.models.types import CalibrationResult, JobType, QPUJob
from conductor_qpu.observability.metrics import MetricsAggregator
from conductor_qpu.orchestrator.orchestrator import Orchestrator

# Optional import for demo long-job helper on sim
try:
    from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend  # type: ignore
except Exception:  # noqa: BLE001
    NoisySimulatorBackend = None  # type: ignore

_OPENAPI_DESCRIPTION = """
Coda 2 control plane — the same typed tools the instrument UI uses, over HTTP.

Finance and quant clients can submit natural-language goals (`POST /goals`),
poll jobs and device state, and keep an **audit trail** from `traces`
(every tool: name, args, latency, ok, `shots`, `mutates_calibration`).

Interactive docs: `/docs` (Swagger) and `/redoc`.
Machine-readable schema: `/openapi.json` (also committed as `docs/openapi.json`).
"""

app = FastAPI(
    title="Coda 2 control plane",
    version="0.1.0",
    description=_OPENAPI_DESCRIPTION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=OPENAPI_TAGS,
    contact={"name": "Coda 2", "url": "https://github.com/mariodelgado/coda-2"},
    license_info={"name": "MIT"},
)


class _PrivateNetworkHeaderMiddleware:
    """Pure ASGI wrapper so SSE bodies are not buffered.

    Starlette ``BaseHTTPMiddleware`` (``@app.middleware("http")``) iterates the
    response body before returning, which stalls ``text/event-stream``.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        origin = ""
        for key, value in scope.get("headers") or []:
            if key == b"origin":
                origin = value.decode("latin-1").lower()
                break
        is_local = origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                acao = any(k.lower() == b"access-control-allow-origin" for k, _ in headers)
                if is_local or acao:
                    headers.append((b"access-control-allow-private-network", b"true"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


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

# Outer wrapper: inject private-network header without consuming streaming bodies.
app.add_middleware(_PrivateNetworkHeaderMiddleware)


# Backend selection via env (CONDUCTOR_QPU_BACKEND=stub|sim)
# This is the single seam a real hardware driver plugs into.
_backend = create_backend()
_climb_bus = ClimbEventBus()


def _on_cal_step(it: int, res: CalibrationResult) -> None:
    """Publish anneal samples to SSE subscribers; pace only while watched."""
    if it == 0:
        phase = "start"
    elif res.message != "In progress":
        phase = "done"
    else:
        phase = "step"
    threshold = getattr(_calibration, "fidelity_threshold", 0.88)
    _climb_bus.publish(climb_payload(it, res, threshold=threshold, phase=phase))
    if phase != "done" and _climb_bus.has_subscribers():
        time.sleep(CLIMB_STEP_PAUSE_S)


_calibration = CalibrationService(
    adapter=_backend,
    fidelity_threshold=0.88,
    max_iterations=60,
    on_step=_on_cal_step,
)
_job_store = InMemoryJobStore()
_orchestrator = Orchestrator(adapter=_backend, calibration=_calibration, job_store=_job_store)
_metrics = MetricsAggregator()

_JOB_ERRORS = {
    400: {"model": ErrorResponse, "description": "Invalid job_id (not a UUID)."},
    404: {"model": ErrorResponse, "description": "Job not found."},
}


def _str_keys(d: dict[Any, Any]) -> dict[str, Any]:
    return {str(k): v for k, v in d.items()}


def _job_record(job: QPUJob) -> dict[str, Any]:
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


def _readiness_predicate() -> dict[str, Any]:
    return {
        "name": model_types.READINESS_PREDICATE_NAME,
        "readout_fidelity_threshold": model_types.READINESS_READOUT_FIDELITY_THRESHOLD,
        "description": "Device is_ready iff every qubit has readout_fidelity >= threshold.",
    }


@app.get(
    "/health",
    tags=["health"],
    summary="Liveness and LLM planner status",
    response_model=HealthResponse,
)
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


@app.get(
    "/device/state",
    tags=["device"],
    summary="Live device snapshot and readiness",
    response_model=DeviceStateResponse,
)
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
        "temperatures_mk": _str_keys(state.temperatures_mk),
        "coherence_us": _str_keys(
            {q: [round(a, 1), round(b, 1)] for q, (a, b) in state.coherence_us.items()}
        ),
        "readout_fidelity": _str_keys({q: round(v, 4) for q, v in state.readout_fidelity.items()}),
        "notes": state.notes,
        "timestamp": state.timestamp.isoformat(),
        "readiness_predicate": predicate,
    }


@app.get(
    "/readiness_predicate",
    tags=["readiness"],
    summary="Exact READY predicate",
    response_model=ReadinessPredicate,
)
def readiness_predicate() -> dict[str, Any]:
    """Exact predicate used to declare a device 'ready'. Numbers, not vibes."""
    return _readiness_predicate()


@app.get(
    "/tools",
    tags=["tools"],
    summary="Enumerable tool catalog with cost/risk metadata",
    response_model=ToolsCatalogResponse,
)
def list_tools() -> dict[str, Any]:
    """The action space the planner is allowed to use — inspectable before you trust a run."""
    return {
        "tools": [t.model_dump() for t in TOOLS_CATALOG],
        "notes": (
            "POST /goals compiles a natural-language goal to these tools. "
            "Each executed step is recorded on traces with shots and mutates_calibration. "
            "This is the same contract the instrument dock uses."
        ),
    }


@app.post(
    "/goals",
    tags=["goals"],
    summary="Compile an NL goal to typed tools and execute",
    response_model=GoalResponse,
    responses={
        409: {
            "model": ErrorResponse,
            "description": "Plan would mutate calibration but mutates_calibration=false.",
        }
    },
)
def post_goal(req: GoalRequest) -> GoalResponse:
    # Run the goal first, then capture a *fresh* device snapshot so the narrator
    # sees the post-calibration readiness (is_ready + score) for affirmative messaging.
    if req.mutates_calibration is False:
        planned = _orchestrator.preview_plan(req.goal)
        if any(step.tool == "calibrate_qubit" for step in planned):
            raise api_error(
                409,
                ErrorCode.CALIBRATION_MUTATION_FORBIDDEN,
                "Compiled plan includes calibrate_qubit; refuse because mutates_calibration=false.",
            )

    full = _orchestrator.run_goal_full(req.goal, device_snapshot=None, shots=req.shots)
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

    # Re-narrate with the fresh snapshot if the orchestrator didn't already have one.
    # This ensures "Q0 ... is usable for circuits" appears when the predicate passes.
    if device_snapshot:
        try:
            from conductor_qpu.orchestrator.narrator import narrate as renarrate

            fresh_msg = renarrate(
                req.goal,
                full.get("traces", []),
                full.get("results", []),
                device_snapshot=device_snapshot,
            )
            if fresh_msg:
                full["agent_message"] = fresh_msg
        except Exception:  # noqa: BLE001
            pass
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


@app.get(
    "/jobs/{job_id}",
    tags=["jobs"],
    summary="Poll a job by UUID",
    response_model=JobRecord,
    responses=_JOB_ERRORS,
)
def get_job(job_id: str) -> dict[str, Any]:
    try:
        jid = UUID(job_id)
    except ValueError as e:
        raise api_error(400, ErrorCode.INVALID_JOB_ID, "invalid job_id") from e
    try:
        job = _backend.poll_job(jid)
    except KeyError as e:
        raise api_error(404, ErrorCode.JOB_NOT_FOUND, "job not found") from e
    return _job_record(job)


@app.post(
    "/calibrate",
    tags=["tools"],
    summary="Direct calibration (mutates calibration)",
    response_model=CalibrateResponse,
)
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
        "mutates_calibration": True,
    }


@app.post(
    "/circuit/bell",
    tags=["tools"],
    summary="Direct Bell pair (shot-costed, does not mutate calibration)",
    response_model=BellResponse,
)
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
            "shots": req.shots,
            "mutates_calibration": False,
        }
    return {
        "job_id": str(jid),
        "error": polled.error or "no result",
        "error_code": ErrorCode.BELL_NO_RESULT,
        "shots": req.shots,
        "mutates_calibration": False,
    }


@app.get(
    "/metrics",
    tags=["observability"],
    summary="Control-plane and calibration metrics",
    response_model=MetricsResponse,
)
def get_metrics() -> dict[str, Any]:
    orch = _orchestrator.get_metrics()
    agg = _metrics.snapshot()
    return {
        "orchestrator": orch,
        "aggregator": agg,
        "calibration": _calibration.metrics.to_dict(),
    }


@app.get(
    "/jobs",
    tags=["jobs"],
    summary="List recent jobs (in-memory, not durable)",
    response_model=JobListResponse,
)
def list_jobs(limit: int = Query(default=50, ge=1, le=500)) -> dict[str, Any]:
    """List recent jobs. In-memory; documented as non-durable."""
    jobs = _backend.list_recent_jobs(limit=limit)
    out = [_job_record(j) for j in jobs]
    return {"jobs": out, "count": len(out)}


@app.get(
    "/traces",
    tags=["observability"],
    summary="Most recent tool traces (audit trail)",
    response_model=TracesResponse,
)
def get_traces() -> dict[str, Any]:
    """Return the most recent orchestrator tool traces (real control-plane decisions)."""
    return {"traces": _orchestrator.get_last_traces()}


@app.get(
    "/device/detuning/{qubit_id}",
    tags=["device"],
    summary="Applied vs hidden-true detuning for a qubit",
    response_model=DetuningResponse,
    responses={404: {"model": ErrorResponse, "description": "Unknown qubit_id."}},
)
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
        raise api_error(404, ErrorCode.QUBIT_NOT_FOUND, str(e)) from e


@app.get(
    "/sse/jobs/{job_id}",
    tags=["jobs"],
    summary="SSE job status stream",
    responses=_JOB_ERRORS,
)
async def sse_job(job_id: str) -> StreamingResponse:
    """Minimal SSE: polls the job every 200ms and emits status updates."""
    try:
        jid = UUID(job_id)
    except ValueError as e:
        raise api_error(400, ErrorCode.INVALID_JOB_ID, "invalid job_id") from e

    async def event_gen():
        last_status = None
        for _ in range(120):  # ~24s max
            try:
                job = _backend.poll_job(jid)
            except KeyError:
                yield f"event: error\ndata: {json.dumps({'error': 'not found', 'code': 'JOB_NOT_FOUND'})}\n\n"
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


@app.get(
    "/sse/calibration",
    tags=["jobs"],
    summary="SSE calibration climb stream",
)
async def sse_calibration() -> StreamingResponse:
    """Live fidelity samples while CalibrationService anneals.

    Named events: ``hello`` (subscribe ack), ``climb`` (start/step/done),
    ``timeout``. POST /goals and POST /calibrate still return the full
    history when they finish — this stream is additive.
    """

    async def event_gen():
        async for frame in iter_climb_sse(_climb_bus):
            yield frame

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------- Demo / Guardrail endpoints (founder demo) ----------------


@app.post(
    "/demo/fail_next_cal",
    tags=["demo"],
    summary="Force the next calibration below READY (demo only)",
    response_model=DemoFailCalResponse,
)
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


@app.post(
    "/demo/start_long_job",
    tags=["demo"],
    summary="Start a long-running diagnostic job (demo only)",
    response_model=DemoLongJobResponse,
)
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
