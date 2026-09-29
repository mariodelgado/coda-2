"""Orchestrator: thin agent runtime with explicit tools.

Design:
- Tools are plain callables with typed-ish signatures.
- Orchestrator owns job lifecycle and metrics aggregation.
- No LLM required; a planner (planner.py) emits a sequence of ToolCalls.
- Optional LLM tool-calling is gated behind CONDUCTOR_ENABLE_LLM.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable
from uuid import UUID

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.models.types import (
    CalibrationParams,
    JobResult,
    JobStatus,
    JobType,
    QPUJob,
)


@dataclass
class ToolResult:
    ok: bool
    data: dict[str, Any]
    latency_s: float
    error: str | None = None


@dataclass
class ToolCall:
    tool: str
    args: dict[str, Any]


Tool = Callable[..., ToolResult]


class Orchestrator:
    """Coordinates adapter + calibration + jobs for agent goals.

    Public surface:
      - register_tool(name, fn)
      - call_tool(name, **kwargs) -> ToolResult
      - run_goal(goal: str) -> list[ToolResult]
      - get_metrics() -> dict
    """

    def __init__(
        self,
        adapter: QPUAdapter,
        calibration: CalibrationService,
        job_store: InMemoryJobStore | None = None,
    ) -> None:
        self.adapter = adapter
        self.calibration = calibration
        self.job_store = job_store or InMemoryJobStore()

        self._tools: dict[str, Tool] = {}
        self._call_count: dict[str, int] = {}
        self._total_latency: dict[str, float] = {}

        self._register_builtin_tools()

    # ---------------- Tool registration ----------------

    def register_tool(self, name: str, fn: Tool) -> None:
        self._tools[name] = fn

    def list_tools(self) -> list[str]:
        return sorted(self._tools.keys())

    def _time_call(self, name: str, fn: Callable[[], Any]) -> tuple[Any, float]:
        t0 = time.time()
        out = fn()
        dt = time.time() - t0
        self._call_count[name] = self._call_count.get(name, 0) + 1
        self._total_latency[name] = self._total_latency.get(name, 0.0) + dt
        return out, dt

    # ---------------- Built-in tools (4-5 as required) ----------------

    def _register_builtin_tools(self) -> None:
        self.register_tool("calibrate_qubit", self._tool_calibrate_qubit)
        self.register_tool("run_bell_pair", self._tool_run_bell_pair)
        self.register_tool("get_device_state", self._tool_get_device_state)
        self.register_tool("get_job_status", self._tool_get_job_status)
        self.register_tool("cancel_job", self._tool_cancel_job)

    def _tool_calibrate_qubit(self, qubit_id: int = 0, target_fidelity: float | None = None) -> ToolResult:
        t0 = time.time()
        try:
            res = self.calibration.calibrate(qubit_id=qubit_id, target_fidelity=target_fidelity)
            dt = time.time() - t0
            self._call_count["calibrate_qubit"] = self._call_count.get("calibrate_qubit", 0) + 1
            self._total_latency["calibrate_qubit"] = (
                self._total_latency.get("calibrate_qubit", 0.0) + dt
            )
            return ToolResult(
                ok=res.success,
                data={
                    "fidelity": res.fidelity,
                    "iterations": res.iterations,
                    "params": {
                        "frequency": res.params.frequency,
                        "amplitude": res.params.amplitude,
                        "readout_error": res.params.readout_error,
                    },
                    "duration_s": res.duration_s,
                },
                latency_s=round(dt, 4),
            )
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    def _tool_run_bell_pair(self, shots: int = 1024, qubits: tuple[int, int] = (0, 1)) -> ToolResult:
        t0 = time.time()
        try:
            job = QPUJob(
                job_type=JobType.CIRCUIT,
                payload={"circuit": "bell", "shots": int(shots), "qubits": list(qubits)},
            )
            jid = self.adapter.submit_job(job)
            polled = self.adapter.poll_job(jid)
            dt = time.time() - t0
            self._call_count["run_bell_pair"] = self._call_count.get("run_bell_pair", 0) + 1
            self._total_latency["run_bell_pair"] = (
                self._total_latency.get("run_bell_pair", 0.0) + dt
            )

            if polled.result:
                return ToolResult(
                    ok=polled.status == JobStatus.SUCCEEDED,
                    data={
                        "job_id": str(jid),
                        "counts": polled.result.data.get("counts", {}),
                        "metrics": polled.result.metrics,
                    },
                    latency_s=round(dt, 4),
                )
            return ToolResult(
                ok=False,
                data={"job_id": str(jid)},
                latency_s=round(dt, 4),
                error=polled.error or "Bell job did not produce result",
            )
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    def _tool_get_device_state(self) -> ToolResult:
        t0 = time.time()
        try:
            state = self.adapter.get_device_state()
            dt = time.time() - t0
            self._call_count["get_device_state"] = self._call_count.get("get_device_state", 0) + 1
            self._total_latency["get_device_state"] = (
                self._total_latency.get("get_device_state", 0.0) + dt
            )
            return ToolResult(
                ok=True,
                data={
                    "is_ready": state.is_ready,
                    "readiness_score": round(state.readiness_score(), 4),
                    "readout_fidelity": {q: round(v, 4) for q, v in state.readout_fidelity.items()},
                    "coherence_us": {q: [round(a, 1), round(b, 1)] for q, (a, b) in state.coherence_us.items()},
                    "temperatures_mk": state.temperatures_mk,
                    "notes": state.notes,
                },
                latency_s=round(dt, 4),
            )
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    def _tool_get_job_status(self, job_id: str) -> ToolResult:
        t0 = time.time()
        try:
            jid = UUID(job_id)
            job = self.adapter.poll_job(jid)
            dt = time.time() - t0
            self._call_count["get_job_status"] = self._call_count.get("get_job_status", 0) + 1
            self._total_latency["get_job_status"] = (
                self._total_latency.get("get_job_status", 0.0) + dt
            )
            return ToolResult(
                ok=True,
                data={
                    "job_id": str(job.id),
                    "status": job.status.value,
                    "job_type": job.job_type.value,
                    "result": job.result.data if job.result else None,
                    "metrics": job.result.metrics if job.result else None,
                    "error": job.error,
                },
                latency_s=round(dt, 4),
            )
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    def _tool_cancel_job(self, job_id: str) -> ToolResult:
        t0 = time.time()
        try:
            jid = UUID(job_id)
            ok = self.adapter.cancel_job(jid)
            dt = time.time() - t0
            self._call_count["cancel_job"] = self._call_count.get("cancel_job", 0) + 1
            self._total_latency["cancel_job"] = (
                self._total_latency.get("cancel_job", 0.0) + dt
            )
            return ToolResult(ok=ok, data={"cancelled": ok}, latency_s=round(dt, 4))
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    # ---------------- Execution ----------------

    def call_tool(self, name: str, **kwargs: Any) -> ToolResult:
        if name not in self._tools:
            return ToolResult(ok=False, data={}, latency_s=0.0, error=f"Unknown tool: {name}")
        fn = self._tools[name]
        # fn already records timing internally for builtins
        return fn(**kwargs)

    def run_goal(self, goal: str, planner: Callable[[str], list[ToolCall]] | None = None) -> list[ToolResult]:
        """Execute a natural-language-ish goal via a planner + tool calls.

        If no planner is supplied, uses the deterministic planner.
        """
        from conductor_qpu.orchestrator.planner import plan_from_goal as default_planner

        plan_fn = planner or default_planner
        plan = plan_fn(goal)

        results: list[ToolResult] = []
        for step in plan:
            res = self.call_tool(step.tool, **step.args)
            results.append(res)
            # Early exit on critical failure for calibration/circuit goals
            if not res.ok and step.tool in ("calibrate_qubit", "run_bell_pair"):
                break
        return results

    # ---------------- Observability ----------------

    def get_metrics(self) -> dict[str, Any]:
        cal = self.calibration.metrics.to_dict()
        tool_stats: dict[str, dict[str, float]] = {}
        for name in self._call_count:
            calls = self._call_count[name]
            total_lat = self._total_latency.get(name, 0.0)
            tool_stats[name] = {
                "calls": float(calls),
                "avg_latency_s": round(total_lat / max(1, calls), 4),
            }

        adapter_stats: dict[str, float] = {}
        if hasattr(self.adapter, "get_stats"):
            adapter_stats = getattr(self.adapter, "get_stats")()

        return {
            "calibration": cal,
            "tools": tool_stats,
            "adapter": adapter_stats,
            "interface_latency_p50_hint": cal.get("avg_interface_latency_s", 0.0),
        }
