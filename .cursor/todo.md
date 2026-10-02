# AI-to-QPU Spike Fixes - Task List

## Backend
- [ ] Create narrator module: deterministic template + optional Groq/OpenAI LLM explainer
- [ ] Extend planner.py to support Groq (OpenAI compat) in addition to OpenAI
- [ ] Extend orchestrator to produce `agent_message` (narrate after run_goal)
- [ ] Update API server: GoalResponse includes `user_message`, `agent_message`; /health advertises provider/model
- [ ] Update /goals and any SSE payloads
- [ ] Handle env: CONDUCTOR_ENABLE_LLM, GROQ_API_KEY, CONDUCTOR_LLM_PROVIDER, CONDUCTOR_LLM_MODEL
- [ ] Always produce non-empty agent_message (template fallback)

## Frontend
- [ ] Re-architect dock: scrollable transcript (user+agent), chips, composer at absolute bottom
- [ ] Update Turn/GoalResponse handling to use agent_message for NL display
- [ ] Immediate append of user message; agent NL on completion
- [ ] Auto-scroll transcript to bottom
- [ ] Remove ledger-under-composer; ensure composer is lowest
- [ ] Preserve 65/35, iOS palette, progressive blur, no purple

## Tests & Quality
- [ ] Add narrator tests (template path + mock LLM)
- [ ] Ensure all existing pytest pass
- [ ] `cd ui && npm run build` clean
- [ ] Update README (Groq as default free path, NL always on)

## Git/PR
- [ ] Create branch cursor/nl-narration-dock-llm-groq-5f46
- [ ] Commit logically
- [ ] Push and open PR via ManagePullRequest
- [ ] Include summary + layout/screenshot notes

## Verification
- [ ] No keys: "Calibrate Q0" shows user line + NL agent explanation; composer bottom-most
- [ ] With GROQ_API_KEY: uses Groq, safe fallback
- [ ] PR opened against main
