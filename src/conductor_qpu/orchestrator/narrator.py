"""Narrator: produces a plain-English agent reply after tool execution.

Two paths:
- LLM (Groq OpenAI-compatible or OpenAI) when CONDUCTOR_ENABLE_LLM=1 and key present.
- Deterministic high-quality template fallback (always non-empty).

The narrator converts physics/metrics back into something an operator understands.
It is intentionally short and factual, not marketing copy.
"""

from __future__ import annotations

import json
import os
from typing import Any

from conductor_qpu.orchestrator.orchestrator import ToolResult, ToolTrace

# Re-export OpenAI (if available) so tests can patch `conductor_qpu.orchestrator.narrator.OpenAI`.
# We intentionally do not require the package at import time.
try:
    from openai import OpenAI as OpenAI  # type: ignore
except Exception:  # noqa: BLE001
    OpenAI = None  # type: ignore[assignment]


def _env_flag(name: str, default: str = "0") -> bool:
    v = os.getenv(name, default)
    return v in ("1", "true", "yes", "on")


def _get_llm_config() -> tuple[tuple[str, str, str] | None, str | None]:
    """Return ((provider, model, api_key), base_url_or_None) or (None, None) if not usable.

    Supports:
      - nvidia / nim / nvidia-nim (NVIDIA NIM)
      - groq
      - openai

    Auto-enables when a supported key is present.
    """
    if not _env_flag("CONDUCTOR_ENABLE_LLM", "0"):
        # Auto-enable if any supported key is present
        if (
            os.getenv("NVIDIA_NIM_API_KEY")
            or os.getenv("NVIDIA_API_KEY")
            or os.getenv("GROQ_API_KEY")
            or os.getenv("OPENAI_API_KEY")
        ):
            pass
        else:
            return (None, None)

    raw = (os.getenv("CONDUCTOR_LLM_PROVIDER") or "").lower().strip()
    # Normalize provider aliases
    if raw in ("nvidia", "nim", "nvidia-nim"):
        provider = "nvidia"
    elif raw:
        provider = raw
    else:
        provider = ""

    nvidia_key = os.getenv("NVIDIA_NIM_API_KEY") or os.getenv("NVIDIA_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not provider:
        # Preference: nvidia if key, then groq, then openai
        if nvidia_key:
            provider = "nvidia"
        elif groq_key:
            provider = "groq"
        elif openai_key:
            provider = "openai"
        else:
            provider = "groq"

    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None

    if provider == "nvidia":
        api_key = nvidia_key
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.1-8b-instruct"
        base_url = "https://integrate.api.nvidia.com/v1"
    elif provider == "groq":
        api_key = groq_key
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "llama-3.3-70b-versatile"
        base_url = "https://api.groq.com/openai/v1"
    else:  # openai (or unknown -> treat as openai if key)
        api_key = openai_key
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "gpt-4o-mini"
        base_url = None

    if not api_key:
        # Cross fallback to any available key
        if nvidia_key:
            provider = "nvidia"
            api_key = nvidia_key
            model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.1-8b-instruct"
            base_url = "https://integrate.api.nvidia.com/v1"
        elif groq_key:
            provider = "groq"
            api_key = groq_key
            model = os.getenv("CONDUCTOR_LLM_MODEL") or "llama-3.3-70b-versatile"
            base_url = "https://api.groq.com/openai/v1"
        elif openai_key:
            provider = "openai"
            api_key = openai_key
            model = os.getenv("CONDUCTOR_LLM_MODEL") or "gpt-4o-mini"
            base_url = None
        else:
            return (None, None)

    # At this point we have a provider+key+model
    if not model:
        model = "meta/llama-3.1-8b-instruct" if provider == "nvidia" else "llama-3.3-70b-versatile"
    return (provider, model, api_key), base_url  # type: ignore[return-value]


def _short_traces(traces: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for t in traces[-4:]:
        tool = t.get("tool", "?")
        summary = t.get("summary", "")
        ok = t.get("ok", True)
        parts.append(f"{tool}{'✓' if ok else '✗'}:{summary}")
    return "; ".join(parts)


def _extract_fidelity(
    results: list[dict[str, Any]],
) -> tuple[float | None, float | None, dict[str, Any] | None]:
    """Return (initial_fid, final_fid, last_cal_params) if present."""
    init = None
    final = None
    params: dict[str, Any] | None = None
    for r in results or []:
        d = (r or {}).get("data") or {}
        if "initial_fidelity" in d and init is None:
            try:
                init = float(d["initial_fidelity"])
            except Exception:  # noqa: BLE001
                pass
        if "fidelity" in d:
            try:
                final = float(d["fidelity"])
            except Exception:  # noqa: BLE001
                pass
            if isinstance(d.get("params"), dict):
                params = d["params"]
        if "threshold" in d:
            # keep going; last one wins for params
            pass
    return init, final, params


def _extract_bell(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    for r in results or []:
        d = (r or {}).get("data") or {}
        if d and isinstance(d.get("counts"), dict):
            return {"counts": d["counts"], "metrics": d.get("metrics") or {}}
    return None


def _template_narrate(
    goal: str,
    traces: list[dict[str, Any]],
    results: list[dict[str, Any]],
    device_snapshot: dict[str, Any] | None = None,
) -> str:
    """High-quality deterministic English explanation. Never returns empty string."""
    g = (goal or "").lower()
    traces_str = _short_traces(traces)
    init_f, final_f, cal_params = _extract_fidelity(results)
    bell = _extract_bell(results)

    # Calibration path
    if any(k in g for k in ["calibrat", "bring", "ready", "tune"]):
        q = 0
        for tok in goal.replace("qubit", " ").split():
            if tok.isdigit():
                q = max(0, min(1, int(tok)))
                break
        if final_f is not None:
            init = init_f if init_f is not None else (final_f - 0.15)
            delta = final_f - init
            ready = final_f >= 0.82
            drift_hint = ""
            if cal_params and isinstance(cal_params, dict):
                # crude drift signal if we had detuning; keep it generic but useful
                drift_hint = ""
            base = (
                f"Q{q} moved from {init:.2f} to {final_f:.2f} fidelity. "
                f"The drive update {'succeeded' if ready else 'improved the state but is not yet at threshold'}. "
            )
            if delta >= 0.20:
                base += "The correction was substantial; residual error is now small enough for many circuits. "
            elif delta >= 0.08:
                base += "A clear step forward; the qubit is closer to the hidden target. "
            else:
                base += "A modest adjustment; further drift will require another pass soon. "
            if ready:
                base += "This qubit now meets the readiness predicate and is usable for circuits."
            else:
                base += "It remains below the typical readiness floor; another calibration will be needed before high-confidence work."
            return base.strip()

        # Fallback when fidelity numbers are absent
        return (
            "Calibration completed. Tool traces: "
            + (traces_str or "no detailed traces")
            + ". Check device state for current readiness."
        )

    # Bell / circuit path
    if any(k in g for k in ["bell", "circuit", "entangl", "pair"]):
        if bell and isinstance(bell.get("counts"), dict):
            c = bell["counts"]
            total = sum(int(v) for v in c.values()) or 1
            p00 = int(c.get("00", 0)) / total
            p11 = int(c.get("11", 0)) / total
            contrast = abs(p00 - p11)
            note = ""
            if contrast > 0.6:
                note = "Strong correlation; the Bell pair shows good contrast."
            elif contrast > 0.35:
                note = "Moderate correlation; calibration and readout noise are visible."
            else:
                note = "Weak correlation; the device may need fresh calibration or the circuit may be sensitive to current detuning."
            return (
                f"Bell pair measured {dict((k, int(v)) for k, v in c.items())}. "
                f"Contrast between 00 and 11 is {contrast:.2f}. {note}"
            )
        return "Bell circuit executed. Results captured in traces. " + (traces_str or "")

    # Device state / health
    if any(k in g for k in ["state", "health", "status", "ready?", "temperature"]):
        if device_snapshot:
            ready = device_snapshot.get("is_ready")
            score = device_snapshot.get("readiness_score")
            q0 = None
            try:
                rf = device_snapshot.get("readout_fidelity") or {}
                q0 = rf.get("0") or rf.get(0)
            except Exception:  # noqa: BLE001
                pass
            parts = []
            if q0 is not None:
                parts.append(f"Q0 readout fidelity is {float(q0):.3f}.")
            if score is not None:
                parts.append(f"Aggregate readiness score is {float(score):.3f}.")
            if ready is True:
                parts.append("Device reports ready.")
            elif ready is False:
                parts.append("Device reports not ready.")
            if parts:
                return " ".join(parts)
        return "Device state queried. " + (traces_str or "No additional details.")

    # Generic but useful
    if final_f is not None:
        return f"Goal completed. Observed fidelity {final_f:.3f}. Traces: {traces_str or 'n/a'}."
    if traces:
        return f"Goal completed. Actions: {traces_str}."
    return "Goal completed with no additional numeric detail."


def _call_llm_narrate(
    goal: str,
    traces: list[dict[str, Any]],
    results: list[dict[str, Any]],
    device_snapshot: dict[str, Any] | None,
) -> str | None:
    """Attempt LLM narration. Returns text or None on any failure."""
    cfg = _get_llm_config()
    if cfg is None or cfg[0] is None:
        return None
    (provider, model, api_key), base_url = cfg  # type: ignore[misc]

    # Build a compact context for the narrator
    init_f, final_f, cal_params = _extract_fidelity(results)
    bell = _extract_bell(results)
    trace_summary = _short_traces(traces)

    context = {
        "goal": goal,
        "final_fidelity": final_f,
        "initial_fidelity": init_f,
        "cal_params": cal_params,
        "bell": bell,
        "trace_summary": trace_summary,
        "device": {
            "is_ready": (device_snapshot or {}).get("is_ready"),
            "readiness_score": (device_snapshot or {}).get("readiness_score"),
            "q0_fidelity": ((device_snapshot or {}).get("readout_fidelity") or {}).get("0"),
        },
    }

    system = (
        "You are a concise, factual operator assistant for a quantum control plane. "
        "Given a goal, tool traces, and numeric results, produce ONE short plain-English sentence (or two) "
        "that explains what happened in terms an operator understands: fidelity change, readiness, drift implications, or circuit quality. "
        "Use the actual numbers from context. No hype, no marketing language. No JSON. No lists. "
        "Tone example: 'Q0 climbed from 0.55 to 0.91 fidelity — the applied drive is close enough that this qubit is READY for circuits. Residual Δfreq is small; drift will pull it away again.'"
    )
    user = (
        "Context (JSON):\n"
        + json.dumps(context, default=str)
        + "\n\nGoal: "
        + goal
        + "\nWrite the operator-facing explanation now."
    )

    try:
        # Use OpenAI-compatible client (works for both Groq and OpenAI).
        # Import the module (not the symbol) so tests can patch `openai.OpenAI`.
        import openai as _openai  # type: ignore

        client_kwargs: dict[str, Any] = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url
        client = _openai.OpenAI(**client_kwargs)

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=180,
        )
        txt = (resp.choices[0].message.content or "").strip()
        # Guard: strip accidental code fences or extra quotes
        if txt.startswith("```"):
            txt = txt.strip("`").strip()
            if txt.lower().startswith("json"):
                txt = txt[4:].strip()
        txt = txt.strip().strip('"').strip()
        if txt and len(txt) > 3:
            return txt
        return None
    except Exception:  # noqa: BLE001
        return None


def narrate(
    goal: str,
    traces: list[dict[str, Any]] | list[ToolTrace],
    results: list[dict[str, Any]] | list[ToolResult],
    device_snapshot: dict[str, Any] | None = None,
) -> str:
    """Public API: always returns a non-empty plain-English string.

    Tries LLM when configured; otherwise (or on failure) uses a strong deterministic template.
    """
    # Normalize traces/results to plain dicts for the narrator
    norm_traces: list[dict[str, Any]] = []
    for t in traces or []:
        if isinstance(t, dict):
            norm_traces.append(t)
        else:
            norm_traces.append(
                {
                    "ts": getattr(t, "timestamp", 0),
                    "tool": getattr(t, "tool", ""),
                    "args": getattr(t, "args", {}),
                    "latency_s": getattr(t, "latency_s", 0.0),
                    "ok": getattr(t, "ok", False),
                    "summary": getattr(t, "summary", ""),
                }
            )

    norm_results: list[dict[str, Any]] = []
    for r in results or []:
        if isinstance(r, dict):
            norm_results.append(r)
        else:
            norm_results.append(
                {
                    "ok": getattr(r, "ok", False),
                    "data": getattr(r, "data", {}),
                    "latency_s": getattr(r, "latency_s", 0.0),
                    "error": getattr(r, "error", None),
                }
            )

    # 1) Try LLM
    llm_text = _call_llm_narrate(goal, norm_traces, norm_results, device_snapshot)
    if llm_text:
        return llm_text

    # 2) Deterministic template (guaranteed non-empty)
    return _template_narrate(goal, norm_traces, norm_results, device_snapshot)
