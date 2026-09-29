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
| Minimal UI | Streamlit app at `src/conductor_qpu/ui/app.py` |
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

Start the API + UI (optional):

```bash
# Terminal 1
python3 -m conductor_qpu.api

# Terminal 2
python3 -m conductor_qpu.ui
# or: streamlit run src/conductor_qpu/ui/app.py
```

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

5. **Optional: Streamlit UI** (20s)
   - Type goals into the text box.
   - Click "Calibrate" / "Run Bell" buttons.
   - Watch readiness and the three metrics update.

**Total human time: ~2 minutes.**

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
src/conductor_qpu/
  adapter/
    base.py                 # QPUAdapter abstract interface
    noisy_sim.py            # Concrete toy backend
  calibration/
    service.py              # Iterative calibration loop + metrics
  orchestrator/
    orchestrator.py         # Tool registry, execution, metrics
    planner.py              # Deterministic planner (+ optional LLM hook)
  api/
    server.py               # FastAPI endpoints + SSE
  ui/
    app.py                  # Streamlit thin client
  jobs/
    store.py                # Bounded in-memory job store
  models/
    types.py                # JobStatus, CalibrationParams, DeviceState, etc.
  observability/
    metrics.py              # Rolling aggregator for latency/fidelity
demo_scripts/
  run_calibration_demo.py
  run_circuit_demo.py
tests/
  test_adapter_contract.py
  test_calibration_converges.py
  test_api_happy_path.py
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
make setup          # pip install -e ".[dev]"
make test           # pytest
make lint
make format
make demo
make run-api
make run-ui
```

Python 3.11+ required. `numpy` and `scipy` are used lightly; no heavy quantum frameworks.

---

## License

MIT — see `LICENSE`.

---

## Notes & Honesty

- This is a **control-plane prototype**, not a quantum simulator. The physics is intentionally cartoonish.
- The fidelity surface is designed to be climbable by the calibration loop while still exhibiting drift and noise.
- No secrets, no network calls, no K8s. The goal is to show how a clean adapter + calibration + orchestration story looks before you plug in real hardware.
