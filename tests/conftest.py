"""Pytest configuration and shared fixtures."""

import pytest

from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend
from conductor_qpu.calibration.service import CalibrationService
from conductor_qpu.jobs.store import InMemoryJobStore
from conductor_qpu.orchestrator.orchestrator import Orchestrator


@pytest.fixture
def backend() -> NoisySimulatorBackend:
    return NoisySimulatorBackend(num_qubits=2, seed=1234)


@pytest.fixture
def calibration(backend: NoisySimulatorBackend) -> CalibrationService:
    return CalibrationService(
        adapter=backend,
        fidelity_threshold=0.87,
        max_iterations=50,
        patience=10,
        seed=99,
    )


@pytest.fixture
def job_store() -> InMemoryJobStore:
    return InMemoryJobStore()


@pytest.fixture
def orchestrator(backend: NoisySimulatorBackend, calibration: CalibrationService) -> Orchestrator:
    return Orchestrator(adapter=backend, calibration=calibration)
