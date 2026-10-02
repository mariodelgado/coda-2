"""Deterministic goal planner.

Converts simple natural-language goals into a sequence of ToolCalls.
No LLM required. Works offline. If CONDUCTOR_ENABLE_LLM=1 and a provider key
is present, an optional LLM planner can be swapped in (best-effort).

Supported providers (OpenAI-compatible):
- groq (default when GROQ_API_KEY present): https://api.groq.com/openai/v1
- openai: official OpenAI

Env:
  CONDUCTOR_ENABLE_LLM=1 (or auto when a key is present)
  CONDUCTOR_LLM_PROVIDER=groq|openai
  CONDUCTOR_LLM_MODEL (defaults to a free/stable Groq model or gpt-4o-mini)
  GROQ_API_KEY or OPENAI_API_KEY

On any failure the deterministic plan_from_goal is used.
"""

from __future__ import annotations

import json
import os
import re
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


_JSON_ARRAY_RE = re.compile(r"\[[\s\S]*\]")


def _extract_json_array(text: str) -> list[Any] | None:
    """Best-effort extraction of a top-level JSON array from model output.

    Handles:
      - raw JSON
      - fenced ```json ... ``` or ``` ... ```
      - surrounding prose with an embedded array
    """
    if not text:
        return None
    t = text.strip()
    # Strip common code fences
    if t.startswith("```"):
        # remove opening fence line
        t = re.sub(r"^```(?:json|JSON)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    # Try direct parse first
    try:
        val = json.loads(t)
        if isinstance(val, list):
            return val
    except Exception:  # noqa: BLE001
        pass
    # Find the first [ ... ] block and parse it
    m = _JSON_ARRAY_RE.search(t)
    if m:
        try:
            val = json.loads(m.group(0))
            if isinstance(val, list):
                return val
        except Exception:  # noqa: BLE001
            return None
    return None


def _get_planner_llm_client() -> tuple[Any, str] | None:
    """Return (client, model) for an OpenAI-compatible planner LLM, or None.

    Prefers Groq (free tier) when GROQ_API_KEY is present.
    Falls back to OpenAI if CONDUCTOR_LLM_PROVIDER=openai or only OPENAI_API_KEY present.
    Auto-enables if a key is present even without CONDUCTOR_ENABLE_LLM=1.
    """
    provider = (os.getenv("CONDUCTOR_LLM_PROVIDER") or "").lower().strip()

    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    # Auto-enable logic
    enabled = os.getenv("CONDUCTOR_ENABLE_LLM", "0") in ("1", "true", "yes")
    if not enabled:
        if groq_key or openai_key:
            enabled = True
    if not enabled:
        return None

    if not provider:
        provider = "groq" if groq_key else ("openai" if openai_key else "groq")

    try:
        from openai import OpenAI  # type: ignore
    except Exception:  # noqa: BLE001
        return None

    if provider == "groq" and groq_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "llama-3.3-70b-versatile"
        try:
            client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
            return client, model
        except Exception:  # noqa: BLE001
            return None

    if provider == "openai" and openai_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "gpt-4o-mini"
        try:
            client = OpenAI(api_key=openai_key)
            return client, model
        except Exception:  # noqa: BLE001
            return None

    # Cross fallback
    if groq_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "llama-3.3-70b-versatile"
        try:
            client = OpenAI(api_key=groq_key, base_url="https://api.groq.com/openai/v1")
            return client, model
        except Exception:  # noqa: BLE001
            pass
    if openai_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "gpt-4o-mini"
        try:
            client = OpenAI(api_key=openai_key)
            return client, model
        except Exception:  # noqa: BLE001
            pass
    return None


def maybe_llm_plan(goal: str) -> list[ToolCall] | None:
    """Optional LLM planner. Uses Groq by default when a free key is present.

    Returns None if not enabled or unavailable. On any error (network, parse,
    schema) it falls back to None so callers use the deterministic planner.
    Never raises to callers.
    """
    pair = _get_planner_llm_client()
    if not pair:
        return None
    client, model = pair

    # Constrained prompt: ask for pure JSON only.
    sys = (
        "You are a planner for a quantum control plane. "
        "Output ONLY a JSON array of tool calls. No prose, no explanations. "
        "Available tools: "
        "calibrate_qubit(qubit_id: int, target_fidelity?: float), "
        "run_bell_pair(shots?: int, qubits?: [int,int]), "
        "get_device_state(), get_job_status(job_id: string), cancel_job(job_id: string). "
        "If the goal is ambiguous, return []."
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": goal},
            ],
            temperature=0.0,
            max_tokens=220,
        )
        txt = (resp.choices[0].message.content or "").strip()
        arr = _extract_json_array(txt)
        if not arr:
            return None
        out: list[ToolCall] = []
        for item in arr:
            if isinstance(item, dict) and "tool" in item:
                args = item.get("args") or {}
                if not isinstance(args, dict):
                    args = {}
                out.append(ToolCall(tool=str(item["tool"]), args=dict(args)))
        # If the model returned an empty array or only unknown tools, fall back.
        if not out:
            return None
        return out
    except Exception:  # noqa: BLE001
        # Any failure (auth, network, schema, rate limit, parse) -> fallback
        return None


def plan(goal: str) -> list[ToolCall]:
    """Public entry: tries LLM if enabled, else deterministic planner.

    Groq (llama) is the preferred free path when GROQ_API_KEY is set.
    On any failure the deterministic plan_from_goal is used (no silent bad plans).
    """
    llm = maybe_llm_plan(goal)
    if llm is not None:
        return llm
    return plan_from_goal(goal)
