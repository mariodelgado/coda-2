"""Deterministic goal planner.

Converts simple natural-language goals into a sequence of ToolCalls.
No LLM required. Works offline. If CONDUCTOR_ENABLE_LLM=1 and openai
is importable, an optional LLM planner can be swapped in (best-effort).
"""

from __future__ import annotations

import os
from typing import Any

from conductor_qpu.orchestrator.orchestrator import ToolCall


def _norm(s: str) -> str:
    return " ".join(s.lower().strip().split())


def plan_from_goal(goal: str) -> list[ToolCall]:
    """Rule-based planner for the required demo goals.

    Supported intents:
      - "Bring qubit N to ready" / "calibrate qubit N"
      - "Run a Bell pair and report fidelity" / "bell"
      - "device state" / "health" / "status"
    """
    g = _norm(goal)

    # Calibration goals
    if any(k in g for k in ["bring", "calibrat", "ready", "tune"]):
        q = 0
        for tok in g.replace("qubit", " ").split():
            if tok.isdigit():
                q = max(0, min(1, int(tok)))
                break
        target = 0.88
        if "high" in g or "strict" in g:
            target = 0.92
        return [ToolCall(tool="calibrate_qubit", args={"qubit_id": q, "target_fidelity": target})]

    # Circuit / Bell goals
    if any(k in g for k in ["bell", "circuit", "entangl", "pair"]):
        shots = 1024
        if "few" in g or "quick" in g:
            shots = 256
        if "many" in g or "precise" in g:
            shots = 4096
        return [ToolCall(tool="run_bell_pair", args={"shots": shots, "qubits": (0, 1)})]

    # Device visibility
    if any(k in g for k in ["state", "health", "status", "ready?", "temperature"]):
        return [ToolCall(tool="get_device_state", args={})]

    # Cancel a specific job (founder demo / guardrail)
    if g.startswith("cancel ") or "cancel job" in g:
        # extract last token that looks like uuid or job id
        tokens = g.split()
        for tok in reversed(tokens):
            if len(tok) >= 8:  # crude uuid fragment
                return [ToolCall(tool="cancel_job", args={"job_id": tok})]
        return [ToolCall(tool="cancel_job", args={"job_id": "last"})]

    # Default: surface state, then attempt a light calibration
    return [
        ToolCall(tool="get_device_state", args={}),
        ToolCall(tool="calibrate_qubit", args={"qubit_id": 0, "target_fidelity": 0.85}),
    ]


def maybe_llm_plan(goal: str) -> list[ToolCall] | None:
    """Optional LLM planner. Only used when env var is set.

    Returns None if not enabled or unavailable. Never raises to callers.
    """
    if os.getenv("CONDUCTOR_ENABLE_LLM", "0") not in ("1", "true", "yes"):
        return None
    try:
        import openai  # type: ignore
    except Exception:  # noqa: BLE001
        return None

    # Best-effort; keep prompt tiny and constrained.
    try:
        client = openai.OpenAI()
        sys = (
            "You are a planner for a quantum control plane. "
            "Output ONLY a JSON array of tool calls. Tools: "
            "calibrate_qubit(qubit_id, target_fidelity?), "
            "run_bell_pair(shots?, qubits?), get_device_state(), "
            "get_job_status(job_id), cancel_job(job_id). "
            "Return [] if unsure."
        )
        resp = client.chat.completions.create(
            model=os.getenv("CONDUCTOR_LLM_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": goal},
            ],
            temperature=0.0,
            max_tokens=200,
        )
        txt = resp.choices[0].message.content or "[]"
        import json

        arr = json.loads(txt)
        out: list[ToolCall] = []
        for item in arr:
            if isinstance(item, dict) and "tool" in item:
                out.append(ToolCall(tool=str(item["tool"]), args=dict(item.get("args", {}))))
        return out or None
    except Exception:  # noqa: BLE001
        return None


def plan(goal: str) -> list[ToolCall]:
    """Public entry: tries LLM if enabled, else deterministic planner."""
    llm = maybe_llm_plan(goal)
    if llm is not None:
        return llm
    return plan_from_goal(goal)
