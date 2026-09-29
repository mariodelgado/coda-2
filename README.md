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

**Current UI (ChatGPT-inspired, this PR):**  
Vast empty center is the conversation thread.  
Soft suggested chips (Calibrate Q0, Bell pair, Bring device ready) are the primary path; typing is secondary via a bottom composer.  
Each run appears as a turn in the thread (goal → agent steps → result).  
Device state, WebGPU drift surface, metrics, and per-run details are opt-in (side panel or “Details” on a turn) — never on first paint.  
Minimal top chrome (product name + LIVE + discreet actions). ⌘K still available for power users. Sonner for quiet status.

### Walk (do this in order)

1. **Observe the lab problem (drift).**  
   Look at Device State. Note readiness and readout fidelity. Click Refresh a few times. You should see small movements in temperatures and detuning (Δfreq/Δamp etc). This is the hidden true state drifting.

2. **Calibrate with a goal (watch real traces).**  
   In the command bar type or click:  
   `Bring qubit 0 to ready`  
   Hit Execute.

   Watch:
   - The Execution Timeline populates with real orchestrator traces: `calibrate_qubit`, args, latency, OK/ERR, and a short summary (e.g. `fidelity=0.96...`).
   - The Fidelity Climb chart renders step-by-step points with a threshold line.
   - Device state updates; detuning shrinks if calibration helped.
   - Metrics tick (you may see success count and interface latency change).

3. **See the readiness transition.**  
   If average readout fidelity crosses the internal "ready" bar (~0.82) and the calibration service crossed its threshold, the badge flips to READY and you may see a "CROSSED 0.82" hint. The last applied params are shown under the chart.

4. **Run a circuit against current calibration.**  
   Click **Bell 1024**.  
   A job appears in the Jobs table (history from `/jobs`). If the backend emits SSE, status flips live; otherwise it polls. You’ll see counts and an estimated fidelity derived from |00⟩+|11⟩ population. Contrast is visibly better after a successful calibration.

5. **Correlate.**  
   Look at the three metrics cards and the trace list together. You just exercised:
   - an agent goal,
   - real tool calls with timing,
   - a calibration loop chasing drift,
   - a downstream circuit whose quality depends on that calibration,
   - observability that survives a UI refresh (jobs are served by the backend).

Close the browser tab, hard refresh, reopen. The job list repopulates from the backend. Traces for a *new* goal will appear when you run one.

Total human time: ~2 minutes. All deterministic. No keys.

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

## Notes & Honesty

- This is a control plane demo, not a physics engine.
- The fidelity surface is intentionally climbable while still exhibiting drift.
- No K8s, no secrets, no external services.
- The value is in the traces, the calibration narrative, the clean seam, and a viz that explains drift — not decoration.

If a skeptical quantum + ML founder looks at the execution timeline and the detuning card and says "I see how calibration is a recurring decision with observable cost," we did the job.
