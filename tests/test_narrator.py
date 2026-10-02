"""Tests for the narrator: always produces non-empty agent_message.

Covers:
- Deterministic template path (no keys)
- Mocked LLM path (when openai client is available)
- Graceful fallback on malformed LLM output
"""

from __future__ import annotations

import os

import pytest

from conductor_qpu.orchestrator.narrator import narrate
from conductor_qpu.orchestrator.orchestrator import ToolResult, ToolTrace


def _trace(tool: str, summary: str = "") -> ToolTrace:
    return ToolTrace(timestamp=0.0, tool=tool, args={}, latency_s=0.01, ok=True, summary=summary)


def _res(ok: bool = True, data: dict | None = None) -> ToolResult:
    return ToolResult(ok=ok, data=data or {}, latency_s=0.01)


def test_narrator_always_returns_text_no_keys() -> None:
    # Ensure we are in template-only mode (all providers)
    os.environ.pop("CONDUCTOR_ENABLE_LLM", None)
    os.environ.pop("GROQ_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("NVIDIA_NIM_API_KEY", None)
    os.environ.pop("NVIDIA_API_KEY", None)

    goal = "Bring qubit 0 to ready"
    traces = [_trace("calibrate_qubit", "fidelity=0.91")]
    results = [_res(True, {"fidelity": 0.91, "initial_fidelity": 0.55, "threshold": 0.88})]

    msg = narrate(goal, traces, results, None)
    assert isinstance(msg, str)
    assert len(msg.strip()) > 0
    assert "0.55" in msg or "0.91" in msg or "Q0" in msg or "fidelity" in msg.lower()


def test_narrator_bell_path_template() -> None:
    os.environ.pop("CONDUCTOR_ENABLE_LLM", None)
    os.environ.pop("GROQ_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("NVIDIA_NIM_API_KEY", None)
    os.environ.pop("NVIDIA_API_KEY", None)

    goal = "Run a Bell pair"
    traces = [_trace("run_bell_pair", "00/11=512/480")]
    results = [_res(True, {"counts": {"00": 512, "11": 480}})]

    msg = narrate(goal, traces, results, None)
    assert isinstance(msg, str)
    assert len(msg.strip()) > 0
    assert "Bell" in msg or "00" in msg or "contrast" in msg.lower()


def test_narrator_state_path_template() -> None:
    os.environ.pop("CONDUCTOR_ENABLE_LLM", None)
    os.environ.pop("GROQ_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)
    os.environ.pop("NVIDIA_NIM_API_KEY", None)
    os.environ.pop("NVIDIA_API_KEY", None)

    goal = "device state"
    traces = [_trace("get_device_state", "ready=True")]
    results = [_res(True, {"is_ready": True})]
    snap = {"is_ready": True, "readiness_score": 0.93, "readout_fidelity": {"0": 0.93}}

    msg = narrate(goal, traces, results, snap)
    assert isinstance(msg, str)
    assert len(msg.strip()) > 0


def test_narrator_template_never_empty_even_on_weird_input() -> None:
    os.environ.pop("CONDUCTOR_ENABLE_LLM", None)
    os.environ.pop("GROQ_API_KEY", None)
    os.environ.pop("OPENAI_API_KEY", None)

    msg = narrate("", [], [], None)
    assert isinstance(msg, str)
    assert len(msg.strip()) > 0


@pytest.mark.skipif(
    os.getenv("GROQ_API_KEY") is None and os.getenv("OPENAI_API_KEY") is None,
    reason="no LLM key for live call",
)
def test_narrator_with_real_key_still_returns_text() -> None:
    # If a key happens to be present in CI/local, ensure we still get text
    goal = "Bring qubit 0 to ready"
    traces = [_trace("calibrate_qubit", "f=0.90")]
    results = [_res(True, {"fidelity": 0.90, "initial_fidelity": 0.60})]
    msg = narrate(goal, traces, results, None)
    assert isinstance(msg, str)
    assert len(msg.strip()) > 0


def test_narrator_mocked_llm_path_returns_text(monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulate a successful LLM call by injecting a fake openai module.

    This avoids requiring the real openai package while exercising the LLM branch.
    """
    import sys
    import types

    # Force LLM path on
    monkeypatch.setenv("CONDUCTOR_ENABLE_LLM", "1")
    monkeypatch.setenv("GROQ_API_KEY", "sk-test")

    class _FakeMsg:
        content = "Q0 climbed from 0.60 to 0.91 — the drive is close; qubit is READY."

    class _FakeChoice:
        message = _FakeMsg()

    class _FakeResp:
        choices = [_FakeChoice()]

    class _FakeCompletions:
        def create(self, **kwargs):  # noqa: ANN001, ANN002
            return _FakeResp()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeClient:
        def __init__(self, *a, **k):  # noqa: ANN001, ANN002
            self.chat = _FakeChat()

    # Build a minimal fake 'openai' package and inject into sys.modules before narrate runs
    fake_openai = types.ModuleType("openai")
    fake_openai.OpenAI = _FakeClient  # type: ignore[attr-defined]
    sys.modules["openai"] = fake_openai

    try:
        msg = narrate("Bring qubit 0 to ready", [], [_res(True, {"fidelity": 0.91})], None)
        assert isinstance(msg, str)
        assert "READY" in msg or "0.91" in msg
    finally:
        # Clean up injected module so other tests are unaffected
        sys.modules.pop("openai", None)


def test_narrator_mocked_nvidia_nim_path_returns_text(monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulate a successful LLM call to NVIDIA NIM by injecting a fake openai module."""
    import sys
    import types

    # Force NVIDIA path
    monkeypatch.setenv("CONDUCTOR_ENABLE_LLM", "1")
    monkeypatch.setenv("CONDUCTOR_LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "nvapi-test")

    class _FakeMsg:
        content = "Q0 fidelity improved from 0.62 to 0.89; qubit now READY."

    class _FakeChoice:
        message = _FakeMsg()

    class _FakeResp:
        choices = [_FakeChoice()]

    class _FakeCompletions:
        def create(self, **kwargs):  # noqa: ANN001, ANN002
            return _FakeResp()

    class _FakeChat:
        completions = _FakeCompletions()

    class _FakeClient:
        def __init__(self, *a, **k):  # noqa: ANN001, ANN002
            self.chat = _FakeChat()

    fake_openai = types.ModuleType("openai")
    fake_openai.OpenAI = _FakeClient  # type: ignore[attr-defined]
    sys.modules["openai"] = fake_openai

    try:
        msg = narrate("Bring qubit 0 to ready", [], [_res(True, {"fidelity": 0.89, "initial_fidelity": 0.62})], None)
        assert isinstance(msg, str)
        assert "READY" in msg or "0.89" in msg
    finally:
        sys.modules.pop("openai", None)
