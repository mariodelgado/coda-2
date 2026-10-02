"""Tests for adapter factory selection and interface compliance."""

import os

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.adapter.factory import create_backend
from conductor_qpu.adapter.hardware_stub import ConductorShapedAdapter
from conductor_qpu.adapter.noisy_sim import NoisySimulatorBackend


def test_default_is_sim():
    # ensure clean
    os.environ.pop("CONDUCTOR_QPU_BACKEND", None)
    b = create_backend()
    assert isinstance(b, NoisySimulatorBackend)
    assert isinstance(b, QPUAdapter)


def test_stub_selection():
    os.environ["CONDUCTOR_QPU_BACKEND"] = "stub"
    try:
        b = create_backend()
        assert isinstance(b, ConductorShapedAdapter)
        assert isinstance(b, QPUAdapter)
        # stub never claims ready
        state = b.get_device_state()
        assert state.is_ready is False
    finally:
        os.environ.pop("CONDUCTOR_QPU_BACKEND", None)


def test_stub_interface_shape():
    b = ConductorShapedAdapter()
    # must implement the six methods
    for name in [
        "submit_job",
        "poll_job",
        "cancel_job",
        "get_device_state",
        "get_calibration",
        "apply_calibration_update",
    ]:
        assert hasattr(b, name) and callable(getattr(b, name))
