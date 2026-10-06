"""Orchestrator: thin agent runtime with explicit tools.

Design:
- Tools are plain callables with typed-ish signatures.
- Orchestrator owns job lifecycle and metrics aggregation.
- No LLM required; the default planner is plan() (LLM when configured,
  else deterministic plan_from_goal).
- Optional LLM tool-calling is gated behind CONDUCTOR_ENABLE_LLM.

Traces: every tool invocation is recorded as a ToolTrace with args, latency,
    and a short result summary. These are the real control-plane decisions shown
to operators and agents.

After execution, an optional narrator produces a plain-English `agent_message`
that turns physics/metrics into something an operator can act on.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.models.types import (
    JobStatus,
    JobType,
    QPUJob,
)

# Narrator import is lazy to avoid import cycles during minimal loads.


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


@dataclass
class ToolTrace:
    """Structured observability record for one orchestrator tool call.

    This is what powers the execution timeline in the UI. It captures the
    actual decision the control plane made (which tool, with what args) and
    how the backend responded, without any synthetic LLM narrative.
    """

    timestamp: float
    tool: str
    args: dict[str, Any]
    latency_s: float
    ok: bool
    summary: str = ""


Tool = Callable[..., ToolResult]


class Orchestrator:
    """Coordinates adapter + calibration + jobs for agent goals.

    Public surface:
      - register_tool(name, fn)
      - call_tool(name, **kwargs) -> ToolResult
      - run_goal(goal: str) -> list[ToolResult]
      - get_last_traces() -> list[dict]   # for UI observability
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
        self._last_traces: list[ToolTrace] = []

        self._register_builtin_tools()

    # ---------------- Tool registration ----------------

    def register_tool(self, name: str, fn: Tool) -> None:
        self._tools[name] = fn

    def list_tools(self) -> list[str]:
        return sorted(self._tools.keys())

    # ---------------- Traces ----------------

    def _make_summary(self, res: ToolResult) -> str:
        if not res.data:
            return res.error or ""
        d = res.data
        if "fidelity" in d:
            return f"fidelity={d.get('fidelity')}"
        if "counts" in d:
            c = d.get("counts", {})
            return f"00/11={c.get('00', 0)}/{c.get('11', 0)}"
        if "is_ready" in d:
            return f"ready={d.get('is_ready')} score={d.get('readiness_score')}"
        keys = list(d.keys())[:3]
        return ",".join(keys)

    def _record_trace(
        self, tool: str, args: dict[str, Any], latency_s: float, res: ToolResult
    ) -> None:
        self._last_traces.append(
            ToolTrace(
                timestamp=time.time(),
                tool=tool,
                args=dict(args),
                latency_s=latency_s,
                ok=res.ok,
                summary=self._make_summary(res),
            )
        )

    def get_last_traces(self) -> list[dict[str, Any]]:
        return [
            {
                "ts": t.timestamp,
                "tool": t.tool,
                "args": t.args,
                "latency_s": t.latency_s,
                "ok": t.ok,
                "summary": t.summary,
            }
            for t in self._last_traces
        ]

    # ---------------- Built-in tools (4-5 as required) ----------------

    def _register_builtin_tools(self) -> None:
        self.register_tool("calibrate_qubit", self._tool_calibrate_qubit)
        self.register_tool("run_bell_pair", self._tool_run_bell_pair)
        self.register_tool("get_device_state", self._tool_get_device_state)
        self.register_tool("get_job_status", self._tool_get_job_status)
        self.register_tool("cancel_job", self._tool_cancel_job)

    def _tool_calibrate_qubit(
        self, qubit_id: int = 0, target_fidelity: float | None = None
    ) -> ToolResult:
        t0 = time.time()
        try:
            initial = None
            try:
                initial = self.calibration.adapter.measure_fidelity(qubit_id)
            except Exception:
                pass
            res = self.calibration.calibrate(qubit_id=qubit_id, target_fidelity=target_fidelity)
            dt = time.time() - t0
            self._call_count["calibrate_qubit"] = self._call_count.get("calibrate_qubit", 0) + 1
            self._total_latency["calibrate_qubit"] = (
                self._total_latency.get("calibrate_qubit", 0.0) + dt
            )
            data: dict[str, Any] = {
                "fidelity": res.fidelity,
                "iterations": res.iterations,
                "params": {
                    "frequency": res.params.frequency,
                    "amplitude": res.params.amplitude,
                    "readout_error": res.params.readout_error,
                },
                "duration_s": res.duration_s,
                "history": res.history,
            }
            if initial is not None:
                data["initial_fidelity"] = round(initial, 5)
            # surface the service threshold for "why ready"
            thresh = getattr(self.calibration, "fidelity_threshold", 0.88)
            data["threshold"] = thresh
            return ToolResult(
                ok=res.success,
                data=data,
                latency_s=round(dt, 4),
            )
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    def _tool_run_bell_pair(
        self, shots: int = 1024, qubits: tuple[int, int] = (0, 1)
    ) -> ToolResult:
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
                    "coherence_us": {
                        q: [round(a, 1), round(b, 1)] for q, (a, b) in state.coherence_us.items()
                    },
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
            self._total_latency["cancel_job"] = self._total_latency.get("cancel_job", 0.0) + dt
            return ToolResult(ok=ok, data={"cancelled": ok}, latency_s=round(dt, 4))
        except Exception as e:  # noqa: BLE001
            dt = time.time() - t0
            return ToolResult(ok=False, data={}, latency_s=round(dt, 4), error=str(e))

    # ---------------- Execution ----------------

    def call_tool(self, name: str, **kwargs: Any) -> ToolResult:
        if name not in self._tools:
            tr = ToolResult(ok=False, data={}, latency_s=0.0, error=f"Unknown tool: {name}")
            self._record_trace(name, kwargs, 0.0, tr)
            return tr
        fn = self._tools[name]
        t0 = time.time()
        res = fn(**kwargs)
        dt = time.time() - t0
        self._record_trace(name, kwargs, round(dt, 4), res)
        return res

    def run_goal(
        self, goal: str, planner: Callable[[str], list[ToolCall]] | None = None
    ) -> list[ToolResult]:
        """Execute a natural-language-ish goal via a planner + tool calls.

        Default planner is plan() — LLM when configured, with deterministic
        plan_from_goal fallback inside plan(). Traces for this execution are
        available via get_last_traces().
        """
        from conductor_qpu.orchestrator.planner import plan as default_planner

        plan_fn = planner or default_planner
        plan = plan_fn(goal)

        self._last_traces = []
        results: list[ToolResult] = []
        for step in plan:
            res = self.call_tool(step.tool, **step.args)
            results.append(res)
            if not res.ok and step.tool in ("calibrate_qubit", "run_bell_pair"):
                break
        return results

    def run_goal_full(
        self,
        goal: str,
        planner: Callable[[str], list[ToolCall]] | None = None,
        device_snapshot: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run a goal and return results + traces + a plain-English agent_message.

        The agent_message is produced by the narrator (LLM if configured, else
        deterministic high-quality template). It is never empty.

        A fresh post-goal device snapshot is captured from the adapter to ensure
        narration reflects authoritative readiness (is_ready) after calibration.
        The caller-provided snapshot is only used as a last-resort fallback.
        """
        results = self.run_goal(goal, planner=planner)
        traces = self.get_last_traces()

        # Capture a fresh, post-goal snapshot from the live adapter when possible.
        # This is the authoritative state for narrator decisions about READY.
        fresh_snapshot: dict[str, Any] | None = None
        try:
            state = self.adapter.get_device_state()
            fresh_snapshot = {
                "is_ready": state.is_ready,
                "readiness_score": round(state.readiness_score(), 4),
                "readout_fidelity": {q: round(v, 4) for q, v in state.readout_fidelity.items()},
                "temperatures_mk": state.temperatures_mk,
            }
        except Exception:  # noqa: BLE001
            pass

        # Prefer fresh post-goal snapshot; fall back to any caller snapshot.
        effective_snapshot = fresh_snapshot or device_snapshot

        try:
            from conductor_qpu.orchestrator.narrator import narrate

            agent_message = narrate(goal, traces, results, device_snapshot=effective_snapshot)
        except Exception:  # noqa: BLE001
            # Hard safety: never leave the caller without text
            agent_message = _fallback_template_narrate(goal, traces, results)
        return {
            "goal": goal,
            "results": [
                {
                    "ok": r.ok,
                    "data": r.data,
                    "latency_s": r.latency_s,
                    "error": r.error,
                }
                for r in results
            ],
            "traces": traces,
            "agent_message": agent_message or _fallback_template_narrate(goal, traces, results),
        }

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


def _fallback_template_narrate(
    goal: str, traces: list[dict[str, Any]], results: list[ToolResult]
) -> str:
    """Ultra-safe last-resort template so we never emit blank NL text."""
    try:
        from conductor_qpu.orchestrator.narrator import narrate as real_narrate

        return real_narrate(goal, traces, results, None)
    except Exception:  # noqa: BLE001
        # Absolute last resort
        if traces:
            s = "; ".join(t.get("summary", t.get("tool", "")) for t in traces[-3:])
            return f"Completed actions: {s}."
        return "Goal completed."
