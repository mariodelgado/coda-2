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


# Q0 readout floor used by the UI/device readiness predicate.
_Q0_READY_FLOOR = 0.82


def _norm(s: str) -> str:
    return " ".join(s.lower().strip().split())


def _q0_from_snapshot(snapshot: dict[str, Any] | None) -> float | None:
    if not snapshot or not isinstance(snapshot, dict):
        return None
    rf = snapshot.get("readout_fidelity") or {}
    if not isinstance(rf, dict):
        return None
    raw = rf.get(0, rf.get("0"))
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def q0_ready_for_circuits(
    snapshot: dict[str, Any] | None = None,
    device_ready: bool | None = None,
) -> bool | None:
    """Whether Q0 is ready enough for a Bell / circuit.

    Prefers an explicit ``device_ready`` flag, then ``is_ready``, then Q0
    readout fidelity against the 0.82 floor. ``None`` means unknown.
    """
    if device_ready is True:
        return True
    if snapshot and isinstance(snapshot, dict):
        if snapshot.get("is_ready") is True:
            return True
        q0 = _q0_from_snapshot(snapshot)
        if q0 is not None:
            return q0 >= _Q0_READY_FLOOR
        if snapshot.get("is_ready") is False:
            return False
    if device_ready is False:
        return False
    return None


def ensure_calibrate_before_bell(
    steps: list[ToolCall],
    device_ready: bool | None = None,
    snapshot: dict[str, Any] | None = None,
) -> list[ToolCall]:
    """If Bell is planned while Q0 is not ready, calibrate first.

    Leaves the plan unchanged when readiness is unknown or already true,
    or when the plan has no Bell step. Reorders an existing calibrate
    step ahead of other tools.
    """
    ready = q0_ready_for_circuits(snapshot=snapshot, device_ready=device_ready)
    if ready is not False:
        return steps
    if not any(s.tool == "run_bell_pair" for s in steps):
        return steps
    cal = [s for s in steps if s.tool == "calibrate_qubit"]
    rest = [s for s in steps if s.tool != "calibrate_qubit"]
    if not cal:
        cal = [ToolCall(tool="calibrate_qubit", args={"qubit_id": 0, "target_fidelity": 0.88})]
    return cal + rest


def _is_status_goal(g: str) -> bool:
    """Readiness / health queries — not 'bring to ready' / calibrate."""
    if any(k in g for k in ["readiness", "ready?", "health", "temperature"]):
        return True
    if any(k in g for k in ["status", "state"]) and not any(
        k in g for k in ["bring", "calibrat", "tune"]
    ):
        return True
    if any(k in g for k in ["report", "check"]) and not any(
        k in g for k in ["bring", "calibrat", "tune", "bell", "circuit", "entangl", "pair"]
    ):
        return True
    return False


def _is_bell_goal(g: str) -> bool:
    return any(k in g for k in ["bell", "circuit", "entangl", "pair"])


def _is_calibrate_goal(g: str) -> bool:
    if any(k in g for k in ["bring", "calibrat", "tune"]):
        return True
    # Word "ready" but not the "readiness" / "ready?" status chips.
    if "ready" in g and "readiness" not in g and "ready?" not in g:
        return True
    return False


def _calibrate_call(goal: str) -> ToolCall:
    q = 0
    for tok in goal.replace("qubit", " ").split():
        if tok.isdigit():
            q = max(0, min(1, int(tok)))
            break
    target = 0.88
    g = _norm(goal)
    if "high" in g or "strict" in g:
        target = 0.92
    return ToolCall(tool="calibrate_qubit", args={"qubit_id": q, "target_fidelity": target})


def _bell_call(goal: str) -> ToolCall:
    g = _norm(goal)
    shots = 1024
    if "few" in g or "quick" in g:
        shots = 256
    if "many" in g or "precise" in g:
        shots = 4096
    return ToolCall(tool="run_bell_pair", args={"shots": shots, "qubits": (0, 1)})


def plan_from_goal(
    goal: str,
    device_ready: bool | None = None,
    snapshot: dict[str, Any] | None = None,
) -> list[ToolCall]:
    """Rule-based planner for the required demo goals.

    Supported intents:
      - "Bring qubit N to ready" / "calibrate qubit N"
      - "Run a Bell pair and report fidelity" / "bell"
      - "Q0 readiness" / "device state" / "health" / "status"

    Golden-path gate: a Bell goal while Q0 is not ready prepends
    ``calibrate_qubit`` so the Safari demo cannot skip calibration.
    """
    g = _norm(goal)

    # Status / readiness queries before the "ready" calibrate keyword so
    # "Report qubit 0 readiness" is get_device_state, not calibrate_qubit.
    if _is_status_goal(g) and not _is_bell_goal(g) and not (
        any(k in g for k in ["bring", "calibrat", "tune"])
    ):
        return [ToolCall(tool="get_device_state", args={})]

    # Circuit / Bell goals (optionally calibrate-first when not ready)
    if _is_bell_goal(g):
        steps = [_bell_call(goal)]
        if _is_calibrate_goal(g):
            steps = [_calibrate_call(goal), *steps]
        return ensure_calibrate_before_bell(steps, device_ready=device_ready, snapshot=snapshot)

    # Calibration goals
    if _is_calibrate_goal(g):
        return [_calibrate_call(goal)]

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

    Providers (OpenAI-compatible):
      - nvidia / nim / nvidia-nim: NVIDIA NIM (https://integrate.api.nvidia.com/v1)
      - groq: Groq
      - openai: OpenAI

    Prefers NVIDIA NIM when NVIDIA_NIM_API_KEY (or NVIDIA_API_KEY) is present.
    Falls back to Groq, then OpenAI.
    Auto-enables if any supported key is present even without CONDUCTOR_ENABLE_LLM=1.
    """
    raw_provider = (os.getenv("CONDUCTOR_LLM_PROVIDER") or "").lower().strip()
    # Normalize aliases
    if raw_provider in ("nvidia", "nim", "nvidia-nim"):
        provider = "nvidia"
    else:
        provider = raw_provider

    nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    # Auto-enable logic
    enabled = os.getenv("CONDUCTOR_ENABLE_LLM", "0") in ("1", "true", "yes")
    if not enabled:
        if nvidia_key or groq_key or openai_key:
            enabled = True
    if not enabled:
        return None

    if not provider:
        # Preference order: nvidia (if key), groq, openai
        if nvidia_key:
            provider = "nvidia"
        elif groq_key:
            provider = "groq"
        elif openai_key:
            provider = "openai"
        else:
            provider = "groq"

    try:
        from openai import OpenAI  # type: ignore
    except Exception:  # noqa: BLE001
        return None

    if provider == "nvidia" and nvidia_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.2-11b-vision-instruct"
        try:
            client = OpenAI(
                api_key=nvidia_key, base_url="https://integrate.api.nvidia.com/v1"
            )
            return client, model
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

    # Cross fallbacks (respect any present keys)
    if nvidia_key:
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.2-11b-vision-instruct"
        try:
            client = OpenAI(
                api_key=nvidia_key, base_url="https://integrate.api.nvidia.com/v1"
            )
            return client, model
        except Exception:  # noqa: BLE001
            pass
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


def maybe_llm_plan(
    goal: str,
    device_ready: bool | None = None,
    snapshot: dict[str, Any] | None = None,
) -> list[ToolCall] | None:
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
    ready_note = ""
    if device_ready is False:
        ready_note = (
            " The device is NOT ready. If the goal is a Bell pair or circuit, "
            "include calibrate_qubit first, then run_bell_pair."
        )
    elif device_ready is True:
        ready_note = " The device is ready for circuits."
    sys = (
        "You are a planner for a quantum control plane. "
        "Output ONLY a JSON array of tool calls. No prose, no explanations. "
        "Available tools: "
        "calibrate_qubit(qubit_id: int, target_fidelity?: float), "
        "run_bell_pair(shots?: int, qubits?: [int,int]), "
        "get_device_state(), get_job_status(job_id: string), cancel_job(job_id: string). "
        "Golden path: calibrate Q0, then check readiness/status, then Bell. "
        "If the device is not ready and the user asks for a Bell pair, "
        "include calibrate_qubit before run_bell_pair."
        f"{ready_note} "
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
        return ensure_calibrate_before_bell(
            out, device_ready=device_ready, snapshot=snapshot
        )
    except Exception:  # noqa: BLE001
        # Any failure (auth, network, schema, rate limit, parse) -> fallback
        return None


def plan(
    goal: str,
    device_ready: bool | None = None,
    snapshot: dict[str, Any] | None = None,
) -> list[ToolCall]:
    """Public entry: tries LLM if enabled, else deterministic planner.

    Groq (llama) is the preferred free path when GROQ_API_KEY is set.
    On any failure the deterministic plan_from_goal is used (no silent bad plans).

    When ``device_ready``/``snapshot`` say Q0 is not ready, a Bell goal
    includes ``calibrate_qubit`` first.
    """
    llm = maybe_llm_plan(goal, device_ready=device_ready, snapshot=snapshot)
    if llm is not None:
        return llm
    return plan_from_goal(goal, device_ready=device_ready, snapshot=snapshot)
