"""Circuit demo: run a Bell pair and report counts + estimated fidelity.

Exercises:
- submit_job (CIRCUIT)
- poll_job
- readout under the current calibration

At the end prints the three high-level metrics from orchestrator.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.orchestrator.orchestrator import Orchestrator


def main() -> int:
    print("=== Conductor QPU — Bell Pair Circuit Demo ===\n")

    backend = NoisySimulatorBackend(num_qubits=2, seed=99)
    cal = CalibrationService(adapter=backend, fidelity_threshold=0.87, max_iterations=50, seed=11)
    orch = Orchestrator(adapter=backend, calibration=cal)

    # Precondition: make sure we're reasonably calibrated so Bell contrast is visible
    print("Pre-calibrating qubit 0 and 1 for visibility...")
    _ = cal.calibrate(0, target_fidelity=0.86)
    _ = cal.calibrate(1, target_fidelity=0.86)

    print("\nSubmitting goal: 'Run a Bell pair and report fidelity'")
    results = orch.run_goal("Run a Bell pair and report fidelity")
    for i, r in enumerate(results, 1):
        print(f"  step {i}: ok={r.ok} latency={r.latency_s:.4f}s")
        if r.data:
            counts = r.data.get("counts", {})
            est = r.data.get("metrics", {}).get("estimated_fidelity")
            print(f"           counts: {counts}")
            if est is not None:
                print(f"           estimated_fidelity: {est:.4f}")

    # Show device state after circuit
    state = backend.get_device_state()
    print(f"\nPost-run readiness: {state.is_ready}  score={state.readiness_score():.3f}")

    m = orch.get_metrics()
    print("\n--- Orchestrator Metrics ---")
    print("calibration:", m["calibration"])
    print(
        "tools:",
        {
            k: {kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()}
            for k, v in m.get("tools", {}).items()
        },
    )
    print("adapter:", m.get("adapter", {}))

    print("\nDemo complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
