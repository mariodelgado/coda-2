# Fix: founder-demo Calibrate → READY path unreliable for UI transcript — COMPLETE

## Summary
- Branch: cursor/fix-calibrate-ready-narration-9912
- PR: https://github.com/mariodelgado/ai-to-qpu-spike/pull/9 (opened against main)

## Root causes addressed
1. Pre-goal snapshot in server.py + orchestrator used stale device state for narration.
2. Calibrate tool ok gated on internal 0.88 threshold; device readiness is 0.82 predicate.
3. LLM narrator context/prompt did not treat device.is_ready as authoritative; no guard against contradictions.
4. Template path was already correct for device.is_ready; LLM path overrode it.

## Changes (small, reviewable)
- src/conductor_qpu/orchestrator/orchestrator.py
  - run_goal_full: capture fresh post-goal device snapshot from adapter; use as authoritative input to narrate.
- src/conductor_qpu/orchestrator/narrator.py
  - _template_narrate (calibrate): if device_snapshot.is_ready is True, affirm "Device reports ready" + "usable for circuits" in plain English regardless of tool fidelity/ok. If False, state another pass needed.
  - _call_llm_narrate: strengthened system prompt to treat device.is_ready as ground truth; ignore calibrate tool threshold when device state present.
  - narrate(): post-LLM guard — for calibrate goals, if is_ready=true but LLM denies/fails to affirm, fall back to template.
- tests/test_narrator.py
  - test_narrator_honors_is_ready_true_authoritative (LLM denial + authoritative snapshot → must affirm)
  - test_narrator_does_not_claim_ready_when_is_ready_false
  - test_narrator_is_ready_true_template_path_affirms

## Verification
- pytest: 42 passed, 1 skipped (full suite).
- Ruff lint: clean on changed modules.
- Ruff format: applied.
- Manual end-to-end:
  - is_ready=true + denying LLM narrator → "Device reports ready. Qubit meets the readiness predicate and is usable for circuits."
  - is_ready=false → does not claim READY; states another pass needed.
  - Founder demo and /goals path continue to work.
- No secrets; product language unchanged.

## Constraints
- PR open against main on branch matching pattern.
- Change kept small and reviewable.
- Done when: PR open, tests pass, calibrate goal with is_ready=true yields affirmative READY agent_message even with LLM narrator configured. ✅

Next: review PR, merge when green in CI.
