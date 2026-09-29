# Conductor QPU — AI-to-QPU Integration Layer

> **Spike for Conductor Quantum**: an agent-friendly control plane for quantum hardware calibration and operations. Fake the hardware; make the control plane real.

This repository is a weekend-sized, self-contained prototype that demonstrates a clean separation between:

- Natural language / agent goals
- Deterministic orchestration and planning
- A typed QPU adapter interface
- An iterative calibration service
- Job lifecycle + observability
- A small FastAPI surface + minimal UI

Everything runs **offline with zero external API keys**.

---

## Architecture (in Conductor language)

```
┌─────────────────────────────────────────────────────────────────┐
│                        NL Gateway / Agent                        │
│   "Bring qubit 0 to ready" | "Run a Bell pair and report fidelity"│
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Orchestrator                              │
│  • 5 explicit tools (calibrate, bell, state, status, cancel)     │
│  • Deterministic planner (planner.py) — works without LLM       │
│  • Optional LLM tool-calling behind CONDUCTOR_ENABLE_LLM=1      │
│  • Aggregates calibration + tool metrics                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
┌──────────────────────┐  ┌──────────────┐  ┌─────────────────────┐
│   Calibration        │  │   Jobs /     │  │   QPU Adapter       │
│   Service            │  │   Events     │  │   (Interface)       │
│  • Gradient-free     │  │  • submit    │  │  submit_job         │
│    iterative loop    │  │  • poll      │  │  poll_job           │
│  • Records:          │  │  • cancel    │  │  cancel_job         │
│    time_to_cal       │  │              │  │  get_device_state   │
│    success_rate      │  │              │  │  get_calibration    │
│    interface_latency │  │              │  │  apply_cal_update   │
└──────────┬───────────┘  └──────┬───────┘  └──────────┬──────────┘
           │                     │                     │
           │                     │                     ▼
           │                     │           ┌─────────────────────┐
           │                     │           │ NoisySimulatorBackend│
           │                     │           │ • 1-2 fake qubits   │
           │                     │           │ • Drift + noise     │
           │                     │           │ • Fidelity surface  │
           │                     │           │   that rewards good │
           │                     │           │   calibration       │
           │                     │           └─────────────────────┘
           │                     │
           ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Observability / Metrics                      │
│  GET /metrics  →  { calibration, tools, adapter, aggregator }   │
└─────────────────────────────────────────────────────────────────┘
```

### Why this framing matters for Conductor

- **Calibration is the bottleneck**: Real QPUs drift. Calibration is the tax paid before useful work. The control plane must make calibration first-class, observable, and agent-addressable.
- **Agents are the users**: The "user" of this system is an agent or orchestrator, not a physicist at a terminal. The API and tool surface must be crisp.
- **Interface first**: By defining `QPUAdapter` before any backend, swapping the noisy simulator for real hardware (or a vendor SDK) becomes a localized change.

---

## Must-Ship Requirements (all delivered)

| Requirement | Implementation |
|-------------|----------------|
| QPU adapter interface | `QPUAdapter` with `submit_job`, `poll_job`, `cancel_job`, `get_device_state`, `get_calibration`, `apply_calibration_update` |
| Concrete backend | `NoisySimulatorBackend` — 1-2 qubit toy device with drift, readout error, T1/T2 effects |
| Calibration service | Iterative gradient-free loop (simulated-annealing-ish) targeting fidelity threshold |
| Three metrics | `time_to_calibrated`, `calibration_success_rate`, `interface_latency` (decision→ack) |
| Agent/orchestrator | `Orchestrator` + 5 tools + deterministic planner (no LLM keys required) |
| FastAPI | `POST /goals`, `GET /jobs/{id}`, `GET /metrics`, `GET /health`, `POST /calibrate`, `POST /circuit/bell`, SSE |
| Primary UI | Next.js (App Router) + shadcn/ui + Tailwind at `ui/` (cards, command bar, live jobs via SSE/polling, fidelity climb, metrics dashboard) |
| Two demos | `make demo-calibration` (fidelity climbs → ready), `make demo-circuit` (Bell counts + est. fidelity) |
| README + demo script | This file + 2-minute script below |
| pytest | 18 tests covering adapter contract, calibration convergence, API happy path |
| Run story | `make setup && make demo` works with Python 3.11+ and no external keys |

---

## Quick Start

```bash
# From a fresh clone
python3 -m pip install --upgrade pip
python3 -m pip install -e ".[dev]"

# Run both demos (no keys, fully offline)
make demo

# Or run individually
make demo-calibration
make demo-circuit

# Run tests
make test
```

Start the API + UI (two terminals):

```bash
# Terminal 1 — FastAPI backend (CORS allows :3000)
make run-api
# or: python3 -m conductor_qpu.api

# Terminal 2 — Next.js UI (dev mode recommended)
make run-ui-dev
# or: cd ui && npm run dev
```

Open http://localhost:3000. The UI targets the API at `http://localhost:8000` by default.  
Override via `NEXT_PUBLIC_API_BASE=http://...` if needed.

---

## 2-Minute Demo Script (for stakeholders)

1. **Fresh clone + install** (30s)
   ```bash
   git clone <repo>
   cd conductor-qpu
   python3 -m pip install -e ".[dev]"
   ```

2. **Run the calibration demo** (30s)
   ```bash
   make demo-calibration
   ```
   - Observe: initial readiness may be marginal; after the goal "Bring qubit 0 to ready", fidelity rises.
   - Printed metrics include: `time_to_calibrated`, `calibration_success_rate`, `interface_latency`.

3. **Run the circuit demo** (20s)
   ```bash
   make demo-circuit
   ```
   - Observe: Bell counts (high |00⟩/|11⟩ population), estimated fidelity.
   - The circuit runs against the *current* calibration; better calibration → higher contrast.

4. **Exercise the API directly** (20s)
   ```bash
   # In one shell
   python3 -m conductor_qpu.api   # http://localhost:8000

   # In another
   curl -X POST http://localhost:8000/goals \
     -H 'content-type: application/json' \
     -d '{"goal":"Bring qubit 0 to ready"}'

   curl http://localhost:8000/metrics
   curl http://localhost:8000/device/state
   ```

5. **Primary UI (Next.js + shadcn)** (30s)
   - In a second terminal: `make run-ui-dev`
   - Open http://localhost:3000
   - Use the goal/command bar or Quick Action buttons ("Calibrate Qubit 0", "Run Bell Pair").
   - Watch live job status, fidelity climb visualization, device state, and the three metrics update in real time.

**Total human time: ~2 minutes.**

### UI Screenshots (manual)

After running the stack, the primary view shows:
- Top command bar for NL goals + quick action buttons
- Device state card (readiness, temperatures, readout fidelity, coherence)
- Metrics dashboard (time_to_calibrated, success_rate, interface_latency)
- Calibration fidelity climb chart + history
- Live jobs table + last goal results tabs
- Activity log

To capture: run the stack locally and screenshot the dashboard after running both quick actions. No committed screenshots in this spike.

---

## What You Would Swap for Real Hardware

| Layer | Fake Today | Real Tomorrow |
|-------|------------|---------------|
| Backend | `NoisySimulatorBackend` | Vendor SDK (e.g. Qiskit Runtime, Braket, Azure Quantum, or a custom calibration driver) |
| Job execution | Synchronous in `submit_job` | Fire-and-forget to hardware queue + callback/polling |
| Calibration | Toy fidelity surface | Real tomography / randomized benchmarking / RB / XEB |
| Drift | Simple random walk + sine | Telemetry-driven drift model |
| Metrics | In-memory | Persisted (Prometheus + Grafana, or your existing observability) |
| Jobs | `InMemoryJobStore` | Postgres / durable queue |
| Planner | Deterministic rules | LLM planner with tool schemas + guardrails (behind feature flag today) |

The **adapter boundary** (`QPUAdapter`) is the critical seam. Everything above it (orchestrator, calibration service, API, UI) should be reusable with minimal change.

---

## Package Layout

```
src/conductor_qpu/          # Python control plane
  adapter/
    base.py                 # QPUAdapter abstract interface
    noisy_sim.py            # Concrete toy backend
  calibration/
    service.py              # Iterative calibration loop + metrics
  orchestrator/
    orchestrator.py         # Tool registry, execution, metrics
    planner.py              # Deterministic planner (+ optional LLM hook)
  api/
    server.py               # FastAPI endpoints + SSE (+ CORS for :3000)
  jobs/
    store.py
  models/
  observability/

ui/                         # Next.js 16 (App Router) + shadcn/ui + Tailwind
  app/
    page.tsx                # Command bar, device state, metrics, fidelity climb, jobs, log
    layout.tsx
  components/ui/            # shadcn components (card, button, tabs, progress, etc.)
  lib/api.ts                # Typed client against FastAPI

demo_scripts/
tests/
```

---

## Metrics (the three that matter)

Exposed via `GET /metrics` and printed by demos:

- **`time_to_calibrated`** — wall time from calibration start to crossing the fidelity threshold
- **`calibration_success_rate`** — successes / attempts (running)
- **`interface_latency`** — roundtrip time from orchestrator decision to backend acknowledgment (sampled per calibration step)

Additional signals (tool latencies, job counts, adapter shots) are included for operational visibility.

---

## Development

```bash
make setup          # installs Python deps + ui/ npm deps
make test           # pytest (Python)
make lint
make format
make demo           # Python demos only (does not start servers)

# Run the full stack (two terminals):
make run-api        # FastAPI on :8000
make run-ui-dev     # Next.js on :3000 (dev)
```

Python 3.11+ required for the backend. Node 18+ required for the UI. `numpy` and `scipy` are used lightly; no heavy quantum frameworks.

### Run story for a fresh clone

```bash
make setup
make demo               # Python-only demos + metrics
# In two shells:
make run-api
make run-ui-dev
# Open http://localhost:3000
```

---

## License

MIT — see `LICENSE`.

---

## Notes & Honesty

- This is a **control-plane prototype**, not a quantum simulator. The physics is intentionally cartoonish.
- The fidelity surface is designed to be climbable by the calibration loop while still exhibiting drift and noise.
- No secrets, no network calls, no K8s. The goal is to show how a clean adapter + calibration + orchestration story looks before you plug in real hardware.
