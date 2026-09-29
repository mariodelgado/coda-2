"""QPU adapter interface and backends.

Public surface:
- QPUAdapter (the contract)
- NoisySimulatorBackend (default demo backend with drift)
- ConductorShapedAdapter (realistic stub shape for real hardware integration)
- create_backend() (env-selected factory)
"""

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.adapter.factory import create_backend
from conductor_qpu.adapter.hardware_stub import ConductorShapedAdapter
from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend

__all__ = [
    "QPUAdapter",
    "NoisySimulatorBackend",
    "ConductorShapedAdapter",
    "create_backend",
]
