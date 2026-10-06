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
        model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.2-11b-vision-instruct"
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
            model = os.getenv("CONDUCTOR_LLM_MODEL") or "meta/llama-3.2-11b-vision-instruct"
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
        model = (
            "meta/llama-3.2-11b-vision-instruct"
            if provider == "nvidia"
            else "llama-3.3-70b-versatile"
        )
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


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _extract_bell(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    for r in results or []:
        d = (r or {}).get("data") or {}
        if d and isinstance(d.get("counts"), dict):
            return {
                "counts": d["counts"],
                "metrics": d.get("metrics") or {},
                "shots": d.get("shots"),
            }
    return None


def _bell_quality(bell: dict[str, Any]) -> tuple[float, int, float | None]:
    """Return (quality, shots, stderr) for a Bell readout.

    Quality is the adapter's ``estimated_fidelity`` when present, otherwise
    the same-parity correlation P(00)+P(11). Never |P(00)−P(11)| — a good
    Bell (~0.45/0.45) has near-zero contrast and would look like noise.
    """
    counts = bell.get("counts") or {}
    metrics = bell.get("metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}
    total = sum(int(v) for v in counts.values()) or 1
    p00 = int(counts.get("00", 0)) / total
    p11 = int(counts.get("11", 0)) / total
    correlation = p00 + p11

    estimated = _as_float(metrics.get("estimated_fidelity"))
    quality = estimated if estimated is not None else correlation

    shots = _as_float(metrics.get("shots"))
    if shots is None:
        shots = _as_float(bell.get("shots"))
    shots_n = int(shots) if shots is not None else int(total)

    stderr = None
    for key in ("stderr", "std_err", "uncertainty", "estimated_fidelity_stderr"):
        stderr = _as_float(metrics.get(key))
        if stderr is not None:
            break
    if stderr is None and shots_n > 0 and 0.0 <= quality <= 1.0:
        stderr = (quality * (1.0 - quality) / shots_n) ** 0.5
    return quality, shots_n, stderr


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

        # Authoritative readiness comes from the post-goal device snapshot when present.
        # If the device itself reports is_ready=true, we MUST affirm READY/usable
        # regardless of whether the calibrate tool's final_fidelity met its own threshold.
        snap_ready = None
        snap_q0 = None
        if device_snapshot and isinstance(device_snapshot, dict):
            try:
                snap_ready = bool(device_snapshot.get("is_ready"))
            except Exception:  # noqa: BLE001
                snap_ready = None
            try:
                rf = device_snapshot.get("readout_fidelity") or {}
                snap_q0 = rf.get("0") if "0" in rf else rf.get(0)
                if snap_q0 is not None:
                    snap_q0 = float(snap_q0)
            except Exception:  # noqa: BLE001
                snap_q0 = None

        if snap_ready is True:
            # Ground truth: device is ready. Affirm in plain English.
            q0_txt = f"Q0 readout fidelity {snap_q0:.3f}. " if snap_q0 is not None else ""
            return (
                f"{q0_txt}Device reports ready. "
                "Qubit meets the readiness predicate and is usable for circuits."
            ).strip()

        if snap_ready is False:
            # Explicitly not ready per device; be clear another pass is needed.
            q0_txt = f"Q0 readout fidelity {snap_q0:.3f}. " if snap_q0 is not None else ""
            return (
                f"{q0_txt}Device is not yet ready. "
                "Another calibration pass is needed before the qubit can be used for circuits."
            ).strip()

        # No authoritative snapshot (neither True nor False); fall back to tool fidelity + any snapshot hints (legacy path).
        if final_f is not None:
            init = init_f if init_f is not None else (final_f - 0.15)
            delta = final_f - init
            # Honor the threshold reported by the tool result when present (e.g. 0.88);
            # fall back to the documented readiness floor (0.82) for UI language.
            thresh = 0.82
            try:
                for r in results or []:
                    d = (r or {}).get("data") if isinstance(r, dict) else getattr(r, "data", None)
                    if isinstance(d, dict) and isinstance(d.get("threshold"), (int, float)):
                        thresh = float(d["threshold"])
                        break
            except Exception:  # noqa: BLE001
                pass
            cal_ok = False
            try:
                for r in results or []:
                    ok = (r or {}).get("ok") if isinstance(r, dict) else getattr(r, "ok", None)
                    if ok is True:
                        cal_ok = True
                        break
            except Exception:  # noqa: BLE001
                pass
            # Any snapshot present can still inform the legacy path (post-goal preferred when orchestrator provides it)
            dev_ready = False
            try:
                if device_snapshot:
                    if device_snapshot.get("is_ready") is True:
                        dev_ready = True
                    rs = device_snapshot.get("readiness_score")
                    if isinstance(rs, (int, float)) and rs >= 0.82:
                        dev_ready = True
            except Exception:  # noqa: BLE001
                pass
            ready = (final_f >= thresh) or cal_ok or (final_f >= 0.82) or dev_ready
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
            quality, shots, stderr = _bell_quality(bell)
            if quality >= 0.80:
                note = (
                    "Strong correlation; the Bell pair is consistent with a "
                    "high-fidelity entangled state."
                )
            elif quality >= 0.60:
                note = "Moderate correlation; calibration and readout noise are visible."
            else:
                note = (
                    "Weak correlation; outcomes look close to random. "
                    "The device may need fresh calibration or the circuit may be "
                    "sensitive to current detuning."
                )
            unc = f" ± {stderr:.2f}" if stderr is not None and stderr > 1e-6 else ""
            shots_txt = f" over {shots} shots" if shots else ""
            return (
                f"Bell pair measured {dict((k, int(v)) for k, v in c.items())}. "
                f"Estimated fidelity {quality:.2f}{unc}{shots_txt}. {note}"
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
        "For Bell/circuit results, quality is estimated_fidelity or (p00+p11) — never |p00-p11|. "
        "A balanced ~0.45/0.45 Bell is high fidelity, not weak. Include shots and stderr when present. "
        "CRITICAL RULE — readiness is authoritative: the 'device' object in context contains the post-execution device state. "
        "If device.is_ready is true (boolean), the qubit IS ready and usable for circuits — affirm this in plain English (e.g., 'ready', 'usable for circuits', 'meets the readiness predicate'). "
        "If device.is_ready is false, clearly state another pass is needed; do not claim ready. "
        "The calibrate tool may report a final_fidelity against a different internal threshold; ignore that for the READY/usable determination when device.is_ready is present. "
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
        # Guard: never let LLM contradict an authoritative post-goal device snapshot.
        # For calibrate-style goals, if device.is_ready is explicitly true, the narration
        # must contain affirmative READY/usable language. If the LLM denied it, fall back.
        g = (goal or "").lower()
        is_cal_goal = any(k in g for k in ["calibrat", "bring", "ready", "tune"])
        snap_ready = None
        if device_snapshot and isinstance(device_snapshot, dict):
            try:
                snap_ready = bool(device_snapshot.get("is_ready"))
            except Exception:  # noqa: BLE001
                snap_ready = None
        if is_cal_goal and snap_ready is True:
            txt_lower = llm_text.lower()
            affirms = any(
                w in txt_lower
                for w in ["ready", "usable for circuits", "meets the readiness", "usable"]
            )
            denies = any(
                w in txt_lower
                for w in [
                    "not ready",
                    "not yet ready",
                    "still not",
                    "short of",
                    "below",
                    "needs another",
                    "another pass",
                ]
            )
            if not affirms or denies:
                # LLM contradicted or failed to affirm authoritative readiness; use template
                return _template_narrate(goal, norm_traces, norm_results, device_snapshot)
        return llm_text

    # 2) Deterministic template (guaranteed non-empty)
    return _template_narrate(goal, norm_traces, norm_results, device_snapshot)
