"""Backend factory for Conductor QPU.

Selects the adapter implementation based on CONDUCTOR_QPU_BACKEND.

- "sim" (default): NoisySimulatorBackend — the toy drifting device used for demos.
- "stub", "hardware", "shaped", "conductor": ConductorShapedAdapter — realistic interface shape, NOT wired to hardware.

This is the only place that decides what "hardware" the control plane talks to.
Founders: to plug in real hardware, implement QPUAdapter and return an instance here
(or monkey the env and your own subclass).
"""

from __future__ import annotations

import os

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.adapter.hardware_stub import ConductorShapedAdapter
from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend


def create_backend() -> QPUAdapter:
    kind = os.getenv("CONDUCTOR_QPU_BACKEND", "sim").lower().strip()
    if kind in {"stub", "hardware", "shaped", "conductor"}:
        return ConductorShapedAdapter()
    # default
    return NoisySimulatorBackend(num_qubits=2, seed=42)
