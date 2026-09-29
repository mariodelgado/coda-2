"""Calibration demo: fidelity climbs until device is 'ready'.

Prints the three required metrics at the end:
- time_to_calibrated
- calibration_success_rate
- interface_latency (avg)
"""

from __future__ import annotations

import os
import sys

# Ensure local src is importable when run as a module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.orchestrator.orchestrator import Orchestrator


def main() -> int:
    print("=== Conductor QPU — Calibration Demo ===\n")

    backend = NoisySimulatorBackend(num_qubits=2, seed=123)
    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.88,
        max_iterations=80,
        patience=14,
        seed=7,
    )
    orch = Orchestrator(adapter=backend, calibration=cal)

    # Initial state
    state0 = backend.get_device_state()
    print(f"Initial readiness: {state0.is_ready}  score={state0.readiness_score():.3f}")
    print(f"Initial readout: { {q: round(v,4) for q,v in state0.readout_fidelity.items()} }")
    print()

    # Run calibration on qubit 0 via the orchestrator tool (exercises full path)
    print("Submitting goal: 'Bring qubit 0 to ready'")
    results = orch.run_goal("Bring qubit 0 to ready")
    for i, r in enumerate(results, 1):
        print(f"  step {i}: ok={r.ok} latency={r.latency_s:.4f}s")
        if r.data:
            print(f"           data: fidelity={r.data.get('fidelity')} iters={r.data.get('iterations')}")

    # Final state
    state1 = backend.get_device_state()
    print(f"\nFinal readiness: {state1.is_ready}  score={state1.readiness_score():.3f}")
    print(f"Final readout: { {q: round(v,4) for q,v in state1.readout_fidelity.items()} }")

    # Metrics
    m = orch.get_metrics()
    cal_m = m["calibration"]
    print("\n--- Calibration Metrics ---")
    print(f"time_to_calibrated (avg): {cal_m['avg_time_to_calibrated_s']:.4f} s")
    print(f"calibration_success_rate: {cal_m['calibration_success_rate']:.4f}")
    print(f"interface_latency (avg):  {cal_m['avg_interface_latency_s']:.4f} s")
    print(f"attempts={int(cal_m['attempts'])} successes={int(cal_m['successes'])}")

    # Also show orchestrator tool latencies
    print("\n--- Tool latencies ---")
    for name, stats in m.get("tools", {}).items():
        print(f"  {name}: calls={int(stats['calls'])}, avg={stats['avg_latency_s']:.4f}s")

    print("\nDemo complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
