"""Thread-safe fan-out for live calibration climb events.

CalibrationService runs on FastAPI's sync threadpool. The SSE endpoint is
async on the event loop. This bus is the seam between them: publishers
``put`` dicts; each subscriber gets its own ``Queue``.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from queue import Empty, Full, Queue
from threading import Lock
from typing import Any

from conductor_qpu.models.types import CalibrationResult

# When the instrument UI is subscribed, pause briefly so the HUD can paint
# between anneal steps. Headless POST /goals clients (no SSE) stay fast.
CLIMB_STEP_PAUSE_S = 0.03


def format_sse(event: str, data: dict[str, Any]) -> str:
    """One SSE frame: named event + JSON data."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def climb_payload(
    it: int,
    res: CalibrationResult,
    *,
    threshold: float,
    phase: str,
) -> dict[str, Any]:
    """JSON body for a `climb` SSE event (and tests)."""
    last = res.history[-1][1] if res.history else res.fidelity
    done = phase == "done"
    return {
        "phase": phase,
        "qubit_id": int(res.params.qubit_id),
        "iter": int(it),
        "fidelity": float(last),
        "best_fidelity": float(res.fidelity),
        "threshold": float(threshold),
        "success": bool(res.success),
        "done": done,
    }


class ClimbEventBus:
    """Fan-out queue for calibration climb points.

    Slow subscribers drop the oldest queued event so the HUD stays on the
    latest sample rather than stalling the anneal.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._subs: list[Queue[dict[str, Any]]] = []

    def subscribe(self) -> Queue[dict[str, Any]]:
        q: Queue[dict[str, Any]] = Queue(maxsize=256)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: Queue[dict[str, Any]]) -> None:
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    def has_subscribers(self) -> bool:
        with self._lock:
            return bool(self._subs)

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subs)

    def publish(self, event: dict[str, Any]) -> None:
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(event)
            except Full:
                try:
                    q.get_nowait()
                except Empty:
                    pass
                try:
                    q.put_nowait(event)
                except Full:
                    pass


async def iter_climb_sse(
    bus: ClimbEventBus,
    *,
    max_s: float = 1800.0,
    keepalive_s: float = 15.0,
    poll_s: float = 0.05,
) -> AsyncIterator[str]:
    """Yield SSE frames for one calibration-channel subscriber."""
    q = bus.subscribe()
    last_keepalive = time.monotonic()
    try:
        yield format_sse("hello", {"channel": "calibration"})
        deadline = time.monotonic() + max_s
        while time.monotonic() < deadline:
            try:
                event = q.get_nowait()
            except Empty:
                now = time.monotonic()
                if now - last_keepalive >= keepalive_s:
                    yield ": keepalive\n\n"
                    last_keepalive = now
                await asyncio.sleep(poll_s)
                continue
            yield format_sse("climb", event)
        yield format_sse("timeout", {"channel": "calibration"})
    finally:
        bus.unsubscribe(q)
