"""Planner tests: LLM plan() path vs deterministic fallback.

Covers the contract that run_goal's default planner is plan() (LLM when a
client is available, else plan_from_goal). A free-form goal that the
deterministic rules would not map to the mocked tool list must still produce
that list when an LLM client is injected.
"""

from __future__ import annotations

import pytest

from conductor_qpu.orchestrator.orchestrator import Orchestrator, ToolCall
from conductor_qpu.orchestrator.planner import plan, plan_from_goal

# Free-form phrasing that misses every plan_from_goal keyword, so the
# deterministic default (get_device_state + calibrate_qubit) would apply.
_FREEFORM_GOAL = "Please look up experiment deadbeef-dead-beef-dead-beefdeadbeef"
_LLM_JOB_ID = "deadbeef-dead-beef-dead-beefdeadbeef"
_LLM_PLAN_JSON = '[{"tool": "get_job_status", "args": {"job_id": "' + _LLM_JOB_ID + '"}}]'


def _clear_llm_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "CONDUCTOR_ENABLE_LLM",
        "CONDUCTOR_LLM_PROVIDER",
        "CONDUCTOR_LLM_MODEL",
        "GROQ_API_KEY",
        "OPENAI_API_KEY",
        "NVIDIA_NIM_API_KEY",
        "NVIDIA_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


class _FakeMsg:
    def __init__(self, content: str) -> None:
        self.content = content


class _FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = _FakeMsg(content)


class _FakeResp:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, content: str) -> None:
        self._content = content
        self.calls: list[dict] = []

    def create(self, **kwargs):  # noqa: ANN003
        self.calls.append(kwargs)
        return _FakeResp(self._content)


class _FakeChat:
    def __init__(self, content: str) -> None:
        self.completions = _FakeCompletions(content)


class _FakeClient:
    def __init__(self, content: str = _LLM_PLAN_JSON) -> None:
        self.chat = _FakeChat(content)


def _install_fake_llm(
    monkeypatch: pytest.MonkeyPatch, content: str = _LLM_PLAN_JSON
) -> _FakeClient:
    client = _FakeClient(content)
    monkeypatch.setattr(
        "conductor_qpu.orchestrator.planner._get_planner_llm_client",
        lambda: (client, "mock-model"),
    )
    return client


def test_plan_from_goal_freeform_uses_deterministic_default() -> None:
    steps = plan_from_goal(_FREEFORM_GOAL)
    assert [s.tool for s in steps] == ["get_device_state", "calibrate_qubit"]


def test_plan_falls_back_without_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_llm_env(monkeypatch)
    steps = plan("Bring qubit 0 to ready")
    assert len(steps) == 1
    assert steps[0].tool == "calibrate_qubit"
    assert steps[0].args.get("qubit_id") == 0


def test_plan_freeform_falls_back_without_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_llm_env(monkeypatch)
    steps = plan(_FREEFORM_GOAL)
    assert [s.tool for s in steps] == ["get_device_state", "calibrate_qubit"]


def test_plan_uses_llm_for_freeform_goal(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _install_fake_llm(monkeypatch)
    steps = plan(_FREEFORM_GOAL)
    assert [s.tool for s in steps] == ["get_job_status"]
    assert steps[0].args.get("job_id") == _LLM_JOB_ID
    assert client.chat.completions.calls, "LLM client should have been invoked"


def test_run_goal_default_uses_plan_llm_path(
    monkeypatch: pytest.MonkeyPatch, orchestrator: Orchestrator
) -> None:
    """POST /goals / run_goal() must honor plan() so a mocked LLM plan is executed."""
    _install_fake_llm(monkeypatch)
    results = orchestrator.run_goal(_FREEFORM_GOAL)
    traces = orchestrator.get_last_traces()
    assert traces, "run_goal should record traces for the planned tools"
    assert traces[0]["tool"] == "get_job_status"
    assert traces[0]["args"].get("job_id") == _LLM_JOB_ID
    assert len(results) == 1


def test_run_goal_default_falls_back_without_llm(
    monkeypatch: pytest.MonkeyPatch, orchestrator: Orchestrator
) -> None:
    _clear_llm_env(monkeypatch)
    results = orchestrator.run_goal("Bring qubit 0 to ready")
    traces = orchestrator.get_last_traces()
    assert traces
    assert traces[0]["tool"] == "calibrate_qubit"
    assert len(results) >= 1


def test_run_goal_explicit_planner_still_overrides(
    monkeypatch: pytest.MonkeyPatch, orchestrator: Orchestrator
) -> None:
    """An explicit planner argument must still win over the plan() default."""
    _install_fake_llm(monkeypatch)

    def custom(goal: str) -> list[ToolCall]:
        return [ToolCall(tool="get_device_state", args={})]

    results = orchestrator.run_goal(_FREEFORM_GOAL, planner=custom)
    traces = orchestrator.get_last_traces()
    assert [t["tool"] for t in traces] == ["get_device_state"]
    assert results[0].ok is True
