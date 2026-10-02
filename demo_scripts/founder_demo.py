"""Founder demo script.

One-command scriptable proof for Conductor founders.

Usage:
  python -m demo_scripts.founder_demo
  CONDUCTOR_QPU_BACKEND=stub python -m demo_scripts.founder_demo

It exercises:
- calibrate via orchestrator goal (captures real traces)
- Bell
- prints traces summary, the three metrics, readiness, exits 0

Optional failure path:
  python -m demo_scripts.founder_demo --fail

No server required. Fully offline.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from conductor_qpu.adapter.hardware_stub import ConductorShapedAdapter
from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.orchestrator.orchestrator import Orchestrator


def build_backend():
    kind = os.getenv("CONDUCTOR_QPU_BACKEND", "sim").lower()
    if kind in ("stub", "hardware", "shaped", "conductor"):
        print("[founder-demo] Using ConductorShapedAdapter (NOT connected to hardware)")
        return ConductorShapedAdapter()
    print("[founder-demo] Using NoisySimulatorBackend (default)")
    return NoisySimulatorBackend(num_qubits=2, seed=123)


def main() -> int:
    fail_mode = "--fail" in sys.argv or os.getenv("FOUNDER_DEMO_FAIL") == "1"

    print("=== Conductor QPU — Founder Demo (scriptable) ===")
    backend = build_backend()

    if fail_mode and hasattr(backend, "set_demo_fid_cap"):
        backend.set_demo_fid_cap(0.65)
        print("[founder-demo] FAIL MODE: fidelity capped at 0.65 (will not converge)")

    cal = CalibrationService(
        adapter=backend,
        fidelity_threshold=0.88,
        max_iterations=40,
        patience=10,
        seed=99,
    )
    orch = Orchestrator(adapter=backend, calibration=cal)

    print("\n[1] Goal: Bring qubit 0 to ready")
    results = orch.run_goal("Bring qubit 0 to ready")
    traces = orch.get_last_traces()
    print(f"    steps: {len(results)}")
    for i, r in enumerate(results):
        print(f"      step {i + 1}: ok={r.ok} latency={r.latency_s:.4f}s")
    print(f"    traces captured: {len(traces)}")
    for t in traces[-3:]:
        print(f"      - {t['tool']} ok={t['ok']} summary={t['summary']} ({t['latency_s']:.4f}s)")

    # In fail mode, we expect the calibrate step to report not-success
    if fail_mode:
        last_cal = [r for r in results if "fidelity" in (r.data or {})]
        if last_cal:
            f = last_cal[-1].data.get("fidelity", 1.0)
            print(f"    [FAIL DEMO] observed fidelity={f} (below threshold, expect FAILED)")

    print("\n[2] Goal: Run a Bell pair and report fidelity")
    results = orch.run_goal("Run a Bell pair and report fidelity")
    for r in results:
        if r.data and "counts" in r.data:
            print(f"    counts: {r.data.get('counts')}")
            est = r.data.get("metrics", {}).get("estimated_fidelity")
            if est is not None:
                print(f"    estimated_fidelity: {est:.4f}")

    print("\n[3] Metrics + Readiness")
    m = orch.get_metrics()
    cal_m = m.get("calibration", {})
    print(f"    time_to_calibrated (avg): {cal_m.get('avg_time_to_calibrated_s', 0):.4f} s")
    print(f"    calibration_success_rate: {cal_m.get('calibration_success_rate', 0):.4f}")
    print(f"    interface_latency (avg):  {cal_m.get('avg_interface_latency_s', 0):.4f} s")

    state = backend.get_device_state()
    print(f"    device ready: {state.is_ready}  readiness_score={state.readiness_score():.3f}")
    print(f"    notes: {state.notes}")

    print("\n=== founder-demo complete (exit 0) ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
