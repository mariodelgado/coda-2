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
    low = msg.lower()
    assert "Bell" in msg or "00" in msg
    assert "fidelity" in low or "correlation" in low
    assert "contrast" not in low


def test_narrator_good_bell_language() -> None:
    """A balanced ~0.45/0.45 Bell is high fidelity, not weak.

    Old metric used |p00−p11| ≈ 0, so a good pair narrated as 'weak correlation'.
    """
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    goal = "Run a Bell pair and report fidelity"
    traces = [_trace("run_bell_pair", "00/11=460/450")]
    results = [
        _res(
            True,
            {
                "counts": {"00": 460, "11": 450, "01": 57, "10": 57},
                "shots": 1024,
                "metrics": {"estimated_fidelity": 0.8887, "shots": 1024.0},
            },
        )
    ]

    msg = narrate(goal, traces, results, None)
    assert isinstance(msg, str)
    low = msg.lower()
    assert "weak" not in low
    assert "random" not in low
    assert any(w in low for w in ["strong", "high-fidelity", "high fidelity"])
    assert "0.89" in msg or "0.88" in msg
    assert "1024" in msg
    assert "shot" in low
    assert "contrast" not in low
    # Balanced bins must not be scored by |p00−p11| ≈ 0.01
    assert "0.01" not in msg or "±" in msg


def test_narrator_bad_bell_language() -> None:
    """Near-random same-parity (~0.50) must read as weak, not strong."""
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    goal = "Run a Bell pair"
    traces = [_trace("run_bell_pair", "00/11=260/240")]
    results = [
        _res(
            True,
            {
                "counts": {"00": 260, "11": 240, "01": 250, "10": 250},
                "metrics": {"estimated_fidelity": 0.50, "shots": 1000.0},
            },
        )
    ]

    msg = narrate(goal, traces, results, None)
    assert isinstance(msg, str)
    low = msg.lower()
    assert any(w in low for w in ["weak", "random"])
    assert "strong" not in low
    assert "high-fidelity" not in low
    assert "contrast" not in low
    assert "1000" in msg or "shot" in low


def test_narrator_mediocre_bell_is_not_random() -> None:
    """~0.34 / 0.34 bins are mediocre correlation, not a random pair."""
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    results = [_res(True, {"counts": {"00": 348, "11": 348, "01": 164, "10": 164}})]
    msg = narrate("Run a Bell pair", [_trace("run_bell_pair")], results, None)
    low = msg.lower()
    assert "random" not in low
    assert "weak" not in low
    assert "moderate" in low


def test_narrator_bell_not_ready_recommends_calibrate() -> None:
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    snap = {"is_ready": False, "readiness_score": 0.61, "readout_fidelity": {"0": 0.61}}
    msg = narrate(
        "Run a Bell pair and report fidelity",
        [_trace("run_bell_pair")],
        [_res(True, {"counts": {"00": 260, "11": 240, "01": 250, "10": 250}})],
        snap,
    )
    low = msg.lower()
    assert "calibrat" in low
    assert "not ready" in low


def test_narrator_bell_after_auto_calibrate_mentions_order() -> None:
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    traces = [_trace("calibrate_qubit", "fidelity=0.91"), _trace("run_bell_pair")]
    results = [
        _res(True, {"fidelity": 0.91}),
        _res(
            True,
            {
                "counts": {"00": 460, "11": 450, "01": 57, "10": 57},
                "metrics": {"estimated_fidelity": 0.8887, "shots": 1024.0},
            },
        ),
    ]
    snap = {"is_ready": True, "readout_fidelity": {"0": 0.91}}
    msg = narrate("Run a Bell pair and report fidelity", traces, results, snap)
    low = msg.lower()
    assert "calibrat" in low
    assert "bell" in low


def test_narrator_good_bell_without_adapter_metrics() -> None:
    """Correlation P(00)+P(11) is the fallback when estimated_fidelity is absent."""
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    # 0.45 / 0.45 — contrast is ~0, correlation is 0.90
    results = [_res(True, {"counts": {"00": 450, "11": 450, "01": 62, "10": 62}})]
    msg = narrate("Run a Bell pair", [_trace("run_bell_pair")], results, None)
    low = msg.lower()
    assert "weak" not in low
    assert any(w in low for w in ["strong", "high-fidelity", "high fidelity"])
    assert "0.90" in msg or "0.88" in msg


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
        msg = narrate(
            "Bring qubit 0 to ready",
            [],
            [_res(True, {"fidelity": 0.89, "initial_fidelity": 0.62})],
            None,
        )
        assert isinstance(msg, str)
        assert "READY" in msg or "0.89" in msg
    finally:
        sys.modules.pop("openai", None)


def test_narrator_honors_is_ready_true_authoritative(monkeypatch: pytest.MonkeyPatch) -> None:
    """When device_snapshot.is_ready is true, narration MUST affirm READY/usable.

    Even if an LLM path is configured and the LLM would contradict, the guard
    ensures an affirmative plain-English READY message for calibrate goals.
    """
    import sys
    import types

    # Force an LLM narrator path (NVIDIA NIM style) that tries to deny readiness.
    monkeypatch.setenv("CONDUCTOR_ENABLE_LLM", "1")
    monkeypatch.setenv("CONDUCTOR_LLM_PROVIDER", "nvidia")
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "nvapi-test")

    class _DenyingMsg:
        # Intentionally contradictory LLM output (as observed in the bug report)
        content = "Q0 fidelity is still short of the READY threshold; another pass is needed."

    class _FakeChoice:
        message = _DenyingMsg()

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
        # Post-goal authoritative snapshot: device itself says ready with high fidelity.
        snap = {
            "is_ready": True,
            "readiness_score": 0.93,
            "readout_fidelity": {"0": 0.93, "1": 0.91},
        }
        msg = narrate(
            "Calibrate qubit 0 to ready",
            [_trace("calibrate_qubit", "fidelity=0.71")],  # tool may report below its 0.88
            [_res(False, {"fidelity": 0.71, "initial_fidelity": 0.55, "threshold": 0.88})],
            snap,
        )
        assert isinstance(msg, str)
        low = msg.lower()
        # Must affirm readiness per device snapshot, not echo the tool's ok=false or LLM denial.
        assert any(w in low for w in ["ready", "usable for circuits", "meets the readiness"])
        # Must not claim "not ready" or "another pass needed" when device is authoritative ready.
        assert "not ready" not in low and "another pass" not in low
    finally:
        sys.modules.pop("openai", None)


def test_narrator_does_not_claim_ready_when_is_ready_false() -> None:
    """When device_snapshot.is_ready is false, narration must not claim READY."""
    # Ensure template path
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    snap = {
        "is_ready": False,
        "readiness_score": 0.61,
        "readout_fidelity": {"0": 0.61},
    }
    msg = narrate(
        "Bring qubit 0 to ready",
        [_trace("calibrate_qubit", "fidelity=0.61")],
        [_res(False, {"fidelity": 0.61, "initial_fidelity": 0.50, "threshold": 0.88})],
        snap,
    )
    assert isinstance(msg, str)
    low = msg.lower()
    # Must clearly indicate not ready / needs another pass.
    assert any(
        w in low for w in ["not yet ready", "not ready", "another calibration", "another pass"]
    )
    # Must not claim the device IS currently ready or usable now.
    # Acceptable: future conditional phrasing like "before the qubit can be used".
    assert "device reports ready" not in low
    assert "meets the readiness predicate and is usable" not in low
    assert "is usable for circuits" not in low  # exact positive claim
    # Never claim the positive "ready for circuits" outcome when device snapshot says false.
    assert "ready for circuits" not in low


def test_narrator_is_ready_true_template_path_affirms() -> None:
    """Template path with is_ready=true snapshot produces affirmative language."""
    for k in (
        "CONDUCTOR_ENABLE_LLM",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        os.environ.pop(k, None)

    snap = {"is_ready": True, "readiness_score": 0.90, "readout_fidelity": {"0": 0.90}}
    msg = narrate("Calibrate qubit 0", [], [_res(True, {"fidelity": 0.71})], snap)
    assert isinstance(msg, str)
    low = msg.lower()
    assert any(w in low for w in ["ready", "usable for circuits", "meets the readiness"])
