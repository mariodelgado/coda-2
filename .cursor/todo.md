# Fix: founder-demo Calibrate → READY path unreliable for UI transcript

## Current status
- Branch: cursor/fix-calibrate-ready-narration-9912
- Pre-edit analysis complete: snapshot timing, narrator template vs LLM, 0.88 vs 0.82 mismatch.

## Tasks
- [x] Identified root causes (pre-goal snapshot, narrator not authoritative on device.is_ready, calibrate ok=0.88)
- [ ] Edit orchestrator.run_goal_full to capture POST-goal fresh device snapshot from adapter
- [ ] Strengthen narrator.py:
  - _template_narrate: honor device_snapshot.is_ready as ground truth for calibrate goals
  - _call_llm_narrate: strengthen system prompt to treat device.is_ready as authoritative
  - narrate(): add post-LLM guard that falls back to template if LLM contradicts is_ready=true
- [ ] Add focused tests in test_narrator.py for is_ready=true (must affirm) and is_ready=false (must not claim)
- [ ] Run full verification: pytest, lint, format; manual simulation of is_ready path
- [ ] Commit, push, open PR via ManagePullRequest

## Notes
- Keep changes small and reviewable.
- No secrets.
- Product language stays "Conductor QPU" etc.
