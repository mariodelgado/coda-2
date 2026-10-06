"""Pydantic models that define the OpenAPI control-plane contract.

Additive optional fields (``shots``, ``mutates_calibration``, ``error_code``)
are omitted unless present so existing UI clients stay compatible.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from conductor_qpu.api.errors import ErrorCode
from conductor_qpu.models.types import JobStatus, JobType


class JobStatusName(StrEnum):
    queued = JobStatus.QUEUED.value
    running = JobStatus.RUNNING.value
    succeeded = JobStatus.SUCCEEDED.value
    failed = JobStatus.FAILED.value
    cancelled = JobStatus.CANCELLED.value


class JobTypeName(StrEnum):
    calibration = JobType.CALIBRATION.value
    circuit = JobType.CIRCUIT.value
    diagnostic = JobType.DIAGNOSTIC.value


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    detail: ErrorDetail


class GoalRequest(BaseModel):
    """NL goal — the same payload the instrument dock posts."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"goal": "Bring qubit 0 to ready"},
                {"goal": "Run a Bell pair and report fidelity", "shots": 1024},
                {"goal": "Report qubit 0 readiness and fidelity status"},
            ]
        }
    )

    goal: str = Field(..., description="Natural-language goal, e.g. 'Bring qubit 0 to ready'")
    shots: int | None = Field(
        default=None,
        ge=1,
        le=1_000_000,
        description=(
            "Optional shot budget for circuit tools (run_bell_pair). "
            "Omitted = planner default (256 / 1024 / 4096)."
        ),
    )
    mutates_calibration: bool | None = Field(
        default=None,
        description=(
            "Optional risk declaration. If false and the compiled plan would "
            "call calibrate_qubit, the request is rejected with 409 "
            "CALIBRATION_MUTATION_FORBIDDEN. Omitted = allow calibration."
        ),
    )


class ToolResultModel(BaseModel):
    """One executed tool step from POST /goals."""

    model_config = ConfigDict(extra="allow")

    ok: bool
    data: dict[str, Any] = Field(default_factory=dict)
    latency_s: float = 0.0
    error: str | None = None
    error_code: ErrorCode | None = Field(
        default=None,
        description="Set when ok is false (GOAL_STEP_FAILED or UNKNOWN_TOOL).",
    )
    shots: int | None = Field(default=None, description="Shot cost when this step spent shots.")
    mutates_calibration: bool | None = Field(
        default=None,
        description="True when this step wrote calibration parameters.",
    )


class ToolTraceModel(BaseModel):
    """Auditable record of one control-plane decision."""

    model_config = ConfigDict(extra="allow")

    ts: float = Field(..., description="Unix timestamp of the tool call.")
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    latency_s: float
    ok: bool
    summary: str = ""
    shots: int | None = None
    mutates_calibration: bool | None = None


class GoalResponse(BaseModel):
    """Same contract the UI dock consumes: narration + results + traces."""

    model_config = ConfigDict(extra="allow")

    goal: str
    user_message: str | None = None
    agent_message: str | None = Field(
        default=None,
        description="Plain-English narration. Never empty on this endpoint.",
    )
    results: list[ToolResultModel]
    traces: list[ToolTraceModel] = Field(
        default_factory=list,
        description="Audit trail: every tool the planner ran, with cost/risk metadata.",
    )
    metrics: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str = Field(..., examples=["ok"])
    service: str = Field(..., examples=["conductor-qpu"])
    llm_planner: str = Field(..., examples=["off"])
    llm_narrator: str = Field(..., examples=["off"])
    llm_provider: str | None = None
    llm_model: str | None = None


class ReadinessPredicate(BaseModel):
    name: str = Field(..., examples=["all_qubits_readout_fidelity_above"])
    readout_fidelity_threshold: float = Field(..., examples=[0.82])
    description: str


class DeviceStateResponse(BaseModel):
    is_ready: bool
    readiness_score: float
    qubits: list[int]
    temperatures_mk: dict[str, float]
    coherence_us: dict[str, list[float]]
    readout_fidelity: dict[str, float]
    notes: str = ""
    timestamp: str
    readiness_predicate: ReadinessPredicate


class JobRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    job_id: str
    status: JobStatusName
    job_type: JobTypeName | str
    created_at: str | None = None
    completed_at: str | None = None
    result: dict[str, Any] | None = None
    metrics: dict[str, Any] | None = None
    error: str | None = None


class JobListResponse(BaseModel):
    jobs: list[JobRecord]
    count: int


class TracesResponse(BaseModel):
    traces: list[ToolTraceModel]


class MetricsResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    orchestrator: dict[str, Any] = Field(default_factory=dict)
    aggregator: dict[str, Any] = Field(default_factory=dict)
    calibration: dict[str, Any] = Field(default_factory=dict)


class CalibrateRequest(BaseModel):
    qubit_id: int = Field(default=0, ge=0)
    target_fidelity: float | None = Field(default=None, ge=0.0, le=1.0)


class CalibrateParams(BaseModel):
    qubit_id: int
    frequency: float
    amplitude: float
    readout_error: float


class CalibrateResponse(BaseModel):
    success: bool
    fidelity: float
    iterations: int
    duration_s: float
    params: CalibrateParams
    history: list[list[float]] = Field(
        default_factory=list,
        description="Per-iteration [iter, fidelity] pairs from the climb.",
    )
    mutates_calibration: bool = True


class BellRequest(BaseModel):
    shots: int = Field(default=1024, ge=1, le=1_000_000)
    qubits: list[int] = Field(default_factory=lambda: [0, 1])


class BellResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    job_id: str
    counts: dict[str, int] | None = None
    metrics: dict[str, Any] | None = None
    error: str | None = None
    error_code: ErrorCode | None = None
    shots: int | None = None
    mutates_calibration: bool = False


class DetuningApplied(BaseModel):
    frequency: float
    amplitude: float
    phase: float
    readout_error: float


class DetuningResponse(BaseModel):
    qubit_id: int
    detuning: dict[str, float]
    applied: DetuningApplied


class ToolArgSpec(BaseModel):
    name: str
    type: str
    required: bool = False
    default: Any = None
    description: str = ""


class ToolSpec(BaseModel):
    """Enumerable tool — the action space the planner is allowed to use."""

    name: str
    summary: str
    mutates_calibration: bool
    default_shots: int | None = Field(
        default=None,
        description="Default shot cost; null if the tool does not spend shots.",
    )
    args: list[ToolArgSpec] = Field(default_factory=list)
    result: dict[str, str] = Field(
        default_factory=dict,
        description="JSON field → type for a successful tool data payload.",
    )
    error_codes: list[ErrorCode] = Field(default_factory=list)
    http: str | None = Field(
        default=None,
        description="Direct REST equivalent when one exists.",
    )


class ToolsCatalogResponse(BaseModel):
    tools: list[ToolSpec]
    notes: str


class DemoFailCalResponse(BaseModel):
    ok: bool
    fid_cap: float
    note: str


class DemoLongJobResponse(BaseModel):
    job_id: str


# Shared OpenAPI tag metadata (also used by FastAPI(openapi_tags=...)).
OPENAPI_TAGS = [
    {
        "name": "health",
        "description": "Liveness and whether the optional LLM planner/narrator is on.",
    },
    {
        "name": "goals",
        "description": (
            "Natural-language goals compiled to typed tools. Same contract as the instrument dock."
        ),
    },
    {
        "name": "jobs",
        "description": "Submit-adjacent job poll, list, job SSE, and live calibration climb SSE. In-memory; not durable.",
    },
    {
        "name": "device",
        "description": "Live device snapshot, detuning, and readiness numbers.",
    },
    {
        "name": "readiness",
        "description": "Exact READY predicate the UI and API both honor.",
    },
    {
        "name": "tools",
        "description": "Enumerable control-plane tools and direct (non-NL) triggers.",
    },
    {
        "name": "observability",
        "description": "Traces and metrics — the audit trail for every tool call.",
    },
    {
        "name": "demo",
        "description": "Founder-demo guardrails. Not a production surface.",
    },
]


TOOLS_CATALOG: list[ToolSpec] = [
    ToolSpec(
        name="calibrate_qubit",
        summary="Tune a qubit toward a fidelity target. Writes calibration parameters.",
        mutates_calibration=True,
        default_shots=None,
        args=[
            ToolArgSpec(name="qubit_id", type="int", required=False, default=0),
            ToolArgSpec(
                name="target_fidelity",
                type="float?",
                required=False,
                default=0.88,
                description="Internal climb threshold; device READY uses 0.82 readout fidelity.",
            ),
        ],
        result={
            "fidelity": "float",
            "iterations": "int",
            "params": "object",
            "duration_s": "float",
            "history": "array",
            "threshold": "float",
            "initial_fidelity": "float?",
        },
        error_codes=[ErrorCode.GOAL_STEP_FAILED],
        http="POST /calibrate",
    ),
    ToolSpec(
        name="run_bell_pair",
        summary="Submit a Bell circuit, return counts and estimated fidelity.",
        mutates_calibration=False,
        default_shots=1024,
        args=[
            ToolArgSpec(name="shots", type="int", required=False, default=1024),
            ToolArgSpec(name="qubits", type="[int, int]", required=False, default=[0, 1]),
        ],
        result={
            "job_id": "uuid",
            "counts": "object",
            "metrics": "object",
        },
        error_codes=[ErrorCode.GOAL_STEP_FAILED, ErrorCode.BELL_NO_RESULT],
        http="POST /circuit/bell",
    ),
    ToolSpec(
        name="get_device_state",
        summary="Snapshot readiness, fidelity, temperatures, and coherence.",
        mutates_calibration=False,
        default_shots=None,
        args=[],
        result={
            "is_ready": "bool",
            "readiness_score": "float",
            "readout_fidelity": "object",
            "coherence_us": "object",
            "temperatures_mk": "object",
            "notes": "string",
        },
        error_codes=[ErrorCode.GOAL_STEP_FAILED],
        http="GET /device/state",
    ),
    ToolSpec(
        name="get_job_status",
        summary="Poll one job by UUID.",
        mutates_calibration=False,
        default_shots=None,
        args=[ToolArgSpec(name="job_id", type="uuid", required=True)],
        result={
            "job_id": "uuid",
            "status": "queued|running|succeeded|failed|cancelled",
            "job_type": "calibration|circuit|diagnostic",
            "result": "object?",
            "metrics": "object?",
            "error": "string?",
        },
        error_codes=[ErrorCode.INVALID_JOB_ID, ErrorCode.JOB_NOT_FOUND, ErrorCode.GOAL_STEP_FAILED],
        http="GET /jobs/{job_id}",
    ),
    ToolSpec(
        name="cancel_job",
        summary="Cancel a queued or running job.",
        mutates_calibration=False,
        default_shots=None,
        args=[ToolArgSpec(name="job_id", type="uuid", required=True)],
        result={"cancelled": "bool"},
        error_codes=[ErrorCode.INVALID_JOB_ID, ErrorCode.JOB_NOT_FOUND, ErrorCode.GOAL_STEP_FAILED],
        http=None,
    ),
]


def tool_cost_risk(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    """Derive optional cost/risk fields for a tool call (audit metadata)."""
    args = args or {}
    out: dict[str, Any] = {"mutates_calibration": tool == "calibrate_qubit"}
    raw_shots = args.get("shots")
    if raw_shots is not None:
        try:
            out["shots"] = int(raw_shots)
        except (TypeError, ValueError):
            pass
    return out
