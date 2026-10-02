# Conductor QPU — AI-to-QPU Control Plane (Founder Spike)

> For Conductor Quantum: an agent-native control plane that treats calibration as first-class work, not an ops afterthought.

**Thesis (in your language):**  
Quantum hardware drifts. Calibration is the recurring tax before any useful circuit runs. Operators and agents spend their time deciding *when* and *how* to calibrate, watching whether it actually moved the needle, and correlating that with downstream job quality. This spike makes that loop legible, instrumented, and callable from code.

Everything here is **offline, zero LLM keys required**, and deliberately small. The goal is signal, not theater.

---

## What is real vs. simulated (honest)

**Real (the control plane):**
- `QPUAdapter` interface (`submit_job`, `poll_job`, `cancel_job`, `get_device_state`, `get_calibration`, `apply_calibration_update`).
- `Orchestrator` + deterministic planner + 5 tools.
- Structured **tool traces** (tool name, args, latency, result summary) emitted on every decision — this is what you see in the UI timeline.
- `CalibrationService` with iterative gradient-free search, explicit fidelity threshold, and the three metrics.
- FastAPI surface (`/goals`, `/jobs`, `/traces`, `/metrics`, `/device/*`, SSE).
- Job history exposed over HTTP (in-memory in this spike; the seam is obvious).
- UI is a real Next.js + shadcn client talking to that API.
- UI stack follows Emil Kowalski skills (`cmdk`, Sonner, NumberFlow, `motion`, `next-themes`, zustand, leva) plus a **WebGPU param-drift surface** (`three` + `@react-three/fiber`) tied to `/device/state` and `/device/detuning`.

**Simulated (the hardware model):**
- `NoisySimulatorBackend` is a toy 1–2 qubit device.
- It maintains a hidden "true" parameter vector per qubit.
- That vector performs a slow random walk + sinusoidal drift on every state read.
- Fidelity is a deterministic but noisy function of distance between applied and true params.
- Bell counts are a cheap stochastic simulation whose contrast depends on current calibration.
- The *dynamics* are representative: calibration is chasing a moving target; miscalibration shows up in temperature-like signals, coherence, readout, and circuit fidelity.

You can replace the backend without touching the orchestrator, API contract, or UI. That is the point.

---

## The three metrics that matter

- `time_to_calibrated` — wall time from start of a calibration attempt to crossing the readiness threshold.
- `calibration_success_rate` — successes / attempts (running).
- `interface_latency` — decision → backend ack, sampled on each calibration step.

These are not vanity numbers. They are the dials a real control plane operator (or agent) would watch.

---

## 2-Minute Founder Demo (precise)

Prerequisites: Python 3.11+, Node 18+, no API keys.

```bash
git clone <repo>
cd conductor-qpu
make setup                 # python deps + ui/ npm install
```

**Terminal A**
```bash
make run-api               # FastAPI on :8000 (CORS allows :3000)
```

**Terminal B**
```bash
make run-ui-dev            # Next.js on :3000
```

Open http://localhost:3000.

**Layout #2 — quantum instrument (this PR):**  
65/35 split (top hero 65% viz, bottom 35% agent). Continuous gradient black (no hard seam). iOS system palette (blue true/target, orange applied, green/red status, label grays, iOS hairlines). Centered composer (max ~42rem) in bottom band. Mono instrument readouts. No bubbles/cards. Details in-rail only.

### Walk (do this in order)

1. **First paint is the instrument.**  
   You see a near-black stage with the live WebGPU param-drift surface (cyan sphere = hidden true target, amber = applied calibration). Top 32 px status bar shows LIVE / READY / Q0 fidelity / mK / Δfreq in instrument mono. Bottom rail holds the soft chips and composer.

2. **Observe drift.**  
   The surface breathes slowly. Watch the cyan marker drift relative to amber as the hidden true params walk. The top bar shows live Δfreq and the current readout fidelity. This is the “problem” the control plane solves.

3. **Run a calibration from the rail.**  
   Click **Calibrate Q0** (or type `Bring qubit 0 to ready` and send).  
   A ledger turn appears in the bottom dock. The stage stays the hero surface; a small fidelity-climb HUD appears in the corner while the loop runs.  
   When done, the turn shows the final fidelity and the surface updates (drift shrinks if it helped).

4. **Inspect a turn.**  
   Click the ledger row. A slim in-rail panel expands with the real step-by-step fidelity line + the last tool traces (no popups stealing the room).

5. **Run a circuit.**  
   Click **Bell pair**. The turn lands in the dock with counts. The surface remains the primary view; the status bar shows the latest device snapshot.

6. **Details on demand.**  
   Open the **Device** button (top right) or press ⌘K for more. The surface never leaves the center. Everything else is rail or overlay.

Hard refresh or new tab: still an instrument. No “empty chat void”, no card wall. Real traces, real drift, tight mono readouts.

Total human time: ~90 seconds. All deterministic. No keys.

---

---

## UI stack (Emil + WebGPU)

Skills from `emilkowalski/skills` are vendored under `.cursor/skills` (and `ui/.cursor/skills`).

**Design rules applied:** dark dense instrument panel; animate only `transform`/`opacity`; strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`); **no animation on ⌘K open**; NumberFlow on the three metrics; Sonner toasts for calibration success/fail, job cancel, and backend-down; cmdk command palette for goals.

**WebGPU viz:** live fidelity landscape over Δfreq × Δamp. Cyan marker = hidden true target from detuning; amber = applied calibration. Uses async `WebGPURenderer` (`three/webgpu`) with WebGL fallback + banner when `navigator.gpu` is missing.

```bash
make setup
# Terminal A
make run-api
# Terminal B
make run-ui-dev
# open http://localhost:3000  — press ⌘K for goals
cd ui && npm run build   # must succeed
```

See `ui/README.md` for dependency table and WebGPU caveats.

## What I would do in week 1 on your stack

1. **Make the adapter real.**  
   Implement the six methods against your vendor SDK or internal driver. Keep the same types. Everything above is reusable.

2. **Persist jobs + traces.**  
   Swap `InMemoryJobStore` and the in-process trace buffer for Postgres (or your store) with retention. Add a `goal_id` to correlate a user/agent goal to a set of traces and jobs.

3. **Calibration policy, not just a loop.**  
   Turn the service into a policy object with:
   - pluggable strategies (Bayesian, RL, your existing tuner),
   - cost model (shots, time, drift rate),
   - explicit readiness predicate over multiple qubits / two-qubit gates,
   - "calibrate or not" recommendation surfaced to agents.

4. **Agent surface.**  
   Expose a narrow "plan + execute + observe" API (or MCP tool surface) so higher-level agents can treat calibration as an explicit step with observable outcomes, not a side effect.

5. **Drift observability.**  
   Surface detuning / parameter error estimates from real diagnostics (not just our toy `get_detuning`). Make "how far we are from true" a first-class metric.

6. **Guardrails.**  
   Kill switches, max iterations, backoff, and "refuse circuit if below X fidelity" — all the boring but necessary control-plane bits.

---

## Architecture (same diagram, same contract)

```
Agent / NL goal
      │
      ▼
Orchestrator (real traces)
      │
      ├──► CalibrationService (iterative, thresholded)
      │         │
      │         ▼
      │    QPUAdapter (interface)
      │         │
      │         ▼
      │    NoisySimulatorBackend  (or your real backend)
      │
      ├──► Jobs (submit/poll/cancel/list)
      └──► Traces (tool decisions, not LLM fiction)
```

The adapter is the seam. Traces are the observability.

---

## Run (guarantees)

```bash
make setup
make demo          # Python demos still work; update the three metrics; no keys
# two terminals:
make run-api
make run-ui-dev
# open http://localhost:3000
```

`pytest` must stay green. `make demo` must continue to work.

---

## How to run (API + UI)

Two terminals, no keys required:

```bash
# Terminal A
make run-api                 # FastAPI on :8000

# Terminal B
make run-ui-dev              # Next.js on :3000
```

Open http://localhost:3000. The instrument appears immediately.

### Connection and chat chips (no manual env gymnastics)

- The Next.js dev server rewrites `/qpu/*` → `http://127.0.0.1:8000/*`.
- `ui/lib/api.ts` defaults `NEXT_PUBLIC_API_BASE` to `/qpu` (same-origin) when unset.
- Result: opening the UI against a running API shows **LIVE**, enables **Calibrate Q0** / composer, and produces a transcript turn with a non-empty `agent_message`.
- The toolbar **refresh** re-runs health (recovering from a transient first-fetch failure) then device/metrics.
- FastAPI emits `Access-Control-Allow-Private-Network: true` for local origins so Chromium private-network preflights succeed for direct `:8000` usage too.

If you ever need to point elsewhere, set `NEXT_PUBLIC_API_BASE` explicitly (e.g. a full origin).

Hard refresh the UI after starting the API if the first health check raced with API startup.

### See calibration live

1. The **stage** (top) shows the current device view.
2. Toggle **drift** / **device** tabs in the upper-left of the stage:
   - **drift**: param-drift fidelity landscape (cyan = true target, amber = applied). Shows how far calibration is from hidden hardware state.
   - **device**: 3D cryo-stage hardware view (stylized 1–2 qubit chips + resonators). Qubit spheres are colored by live readout fidelity; small dots show applied vs true positions driven by `/device/detuning`.
3. Top toolbar shows LIVE / READY, Q0 fidelity %, mK, Δfreq.
4. Click **Calibrate Q0** (or type `Bring qubit 0 to ready`). A fidelity-climb HUD appears; the surface and 3D view update as params move.
5. Ledger rows below the composer show turns. Click one to expand the step-by-step fidelity line + tool traces.

### Metrics
- GET /metrics returns orchestrator + calibration metrics (success rate, avg time to calibrated, interface latency).
- The three control-plane metrics are the point: time_to_calibrated, calibration_success_rate, interface_latency.

---

## LLM planner + NL narrator (optional, free path available)

Default planner and narrator are deterministic and offline. Natural-language narration is **always produced** for every completed turn (LLM or high-quality template).

### Free / self-hosted LLM paths

#### NVIDIA NIM (OpenAI-compatible)

NVIDIA NIM is now a first-class provider. Both planner and narrator use the same OpenAI-compatible chat completions path.

```bash
export NVIDIA_NIM_API_KEY=nvapi-...
export CONDUCTOR_LLM_PROVIDER=nvidia   # or: nim, nvidia-nim
# optional model override (current default):
# export CONDUCTOR_LLM_MODEL=meta/llama-3.2-11b-vision-instruct
make run-api
```

- Base URL: `https://integrate.api.nvidia.com/v1`
- Auth: `Authorization: Bearer $NVIDIA_NIM_API_KEY` (also accepts `NVIDIA_API_KEY`)
- Auto-enables when the key is present (no need for `CONDUCTOR_ENABLE_LLM=1`).
- Planner and narrator are both wired through the shared client.
- Some catalog models return 410 Gone or 404 "not found for account" until enabled on the NVIDIA account. If the default (or chosen) model 410s/404s, set `CONDUCTOR_LLM_MODEL` to one that is enabled for your key. Known working examples for many accounts:
  - `meta/llama-3.2-11b-vision-instruct` (current default)
  - `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
  - `nvidia/nemotron-3-super-120b-a12b`
  - `nvidia/nemotron-3.5-lightning-30b-a3b`

#### Groq (OpenAI-compatible)

```bash
export GROQ_API_KEY=gsk_...
# optional:
# export CONDUCTOR_LLM_PROVIDER=groq
# export CONDUCTOR_LLM_MODEL=llama-3.3-70b-versatile
make run-api
```

#### OpenAI

```bash
export CONDUCTOR_LLM_PROVIDER=openai
export CONDUCTOR_LLM_MODEL=gpt-4o-mini
export OPENAI_API_KEY=sk-...
make run-api
```

```bash
export CONDUCTOR_ENABLE_LLM=1
export CONDUCTOR_LLM_PROVIDER=openai
export CONDUCTOR_LLM_MODEL=gpt-4o-mini
export OPENAI_API_KEY=sk-...
make run-api
```

Behavior:
- Two LLM jobs:
  1. **Planner**: maps NL goal → tool plan (falls back to deterministic `plan_from_goal` on any error).
  2. **Narrator** (new): after tools run, emits a short plain-English `agent_message` that explains what happened in operator terms (physics/metrics → understandable).
- If no API key (or LLM disabled): a deterministic template narrator guarantees every turn still has an `agent_message`. Templates are factual English, never blank.
- API responses include `user_message` and `agent_message` so chat UIs can render a real transcript.
- Server advertises LLM status on `GET /health` (`llm_planner`, `llm_narrator`, `llm_provider`, `llm_model`).

Founder-demo targets:

```bash
make demo                 # Python calibration + circuit demos
make founder-demo         # Orchestrator-driven founder script
make test                 # full pytest
make lint && make format
cd ui && npm run build    # must be clean
```

---

## Notes & Honesty

- This is a control plane demo, not a physics engine.
- The fidelity surface is intentionally climbable while still exhibiting drift.
- No K8s, no secrets, no external services (unless you opt into the LLM path).
- The value is in the traces, the calibration narrative, the clean seam, and a viz that explains drift — not decoration.

If a skeptical quantum + ML founder looks at the execution timeline and the detuning card and says "I see how calibration is a recurring decision with observable cost," we did the job.
