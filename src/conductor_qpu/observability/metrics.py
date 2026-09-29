"""Lightweight metrics aggregator surfaced via API.

Collects rolling samples for:
- interface_latency (ms)
- fidelity samples during calibration
- job outcomes
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from threading import RLock
from time import time


@dataclass
class MetricsAggregator:
    """Thread-safe rolling metrics for the control plane."""

    max_samples: int = 512
    _lock: RLock = field(default_factory=RLock, repr=False)
    _latencies_ms: deque[float] = field(default_factory=lambda: deque(maxlen=512), repr=False)
    _fidelities: deque[float] = field(default_factory=lambda: deque(maxlen=512), repr=False)
    _job_outcomes: dict[str, int] = field(default_factory=lambda: {"succeeded": 0, "failed": 0, "cancelled": 0})

    def record_latency(self, seconds: float) -> None:
        with self._lock:
            self._latencies_ms.append(seconds * 1000.0)

    def record_fidelity(self, f: float) -> None:
        with self._lock:
            self._fidelities.append(float(f))

    def record_job_outcome(self, status: str) -> None:
        with self._lock:
            if status in self._job_outcomes:
                self._job_outcomes[status] += 1

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            lats = list(self._latencies_ms)
            fids = list(self._fidelities)
            p50 = 0.0
            p95 = 0.0
            if lats:
                sl = sorted(lats)
                n = len(sl)
                p50 = sl[int(n * 0.50)]
                p95 = sl[min(n - 1, int(n * 0.95))]
            avg_f = sum(fids) / len(fids) if fids else 0.0
            return {
                "interface_latency_ms": {
                    "count": len(lats),
                    "p50": round(p50, 2),
                    "p95": round(p95, 2),
                },
                "fidelity": {
                    "count": len(fids),
                    "avg": round(avg_f, 4),
                    "last": round(fids[-1], 4) if fids else 0.0,
                },
                "job_outcomes": dict(self._job_outcomes),
                "timestamp": time(),
            }
