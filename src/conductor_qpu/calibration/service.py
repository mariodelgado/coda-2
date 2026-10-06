"""CalibrationService: iterative, gradient-free tuning loop.

The service drives the adapter's apply_calibration_update until a
fidelity threshold or max iterations. It records the three required
metrics:
  - time_to_calibrated (seconds from start to success)
  - calibration_success_rate (running)
  - interface_latency (decision -> backend ack, sampled each step)
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from conductor_qpu.adapter.base import QPUAdapter
from conductor_qpu.models.types import CalibrationParams, CalibrationResult


@dataclass
class CalibrationMetrics:
    """Accumulated metrics for the control plane."""

    attempts: int = 0
    successes: int = 0
    total_time_to_cal_s: float = 0.0
    total_interface_latency_s: float = 0.0
    latency_samples: int = 0

    @property
    def calibration_success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    @property
    def avg_time_to_calibrated(self) -> float:
        if self.successes == 0:
            return 0.0
        return self.total_time_to_cal_s / self.successes

    @property
    def avg_interface_latency(self) -> float:
        if self.latency_samples == 0:
            return 0.0
        return self.total_interface_latency_s / self.latency_samples

    def to_dict(self) -> dict[str, float]:
        return {
            "attempts": float(self.attempts),
            "successes": float(self.successes),
            "calibration_success_rate": round(self.calibration_success_rate, 4),
            "avg_time_to_calibrated_s": round(self.avg_time_to_calibrated, 4),
            "avg_interface_latency_s": round(self.avg_interface_latency, 4),
        }


class CalibrationService:
    """Drives iterative calibration on a backend until readiness.

    Strategy is deliberately simple and gradient-free:
      1. Start from current params.
      2. Each iteration, sample a small neighborhood (coordinate jitter).
      3. Accept improvements; occasionally accept small regressions (simulated annealing flavor).
      4. Stop on fidelity >= threshold or max iterations.

    The service times:
      - wall time from start() to success
      - per-step roundtrip latency (call to adapter -> result)
    """

    def __init__(
        self,
        adapter: QPUAdapter,
        fidelity_threshold: float = 0.88,
        max_iterations: int = 80,
        patience: int = 14,
        seed: int | None = 123,
    ) -> None:
        self.adapter = adapter
        self.fidelity_threshold = fidelity_threshold
        self.max_iterations = max_iterations
        self.patience = patience
        self._rng = __import__("random").Random(seed)

        self._metrics = CalibrationMetrics()
        self._last_result: CalibrationResult | None = None

    @property
    def metrics(self) -> CalibrationMetrics:
        return self._metrics

    def _sample_neighbor(self, base: CalibrationParams, scale: float) -> CalibrationParams:
        """Generate a nearby parameter set with broader early exploration and
        higher-leverage directions first. Tuned so that starting-from-typical-drift
        states reliably climb above ~0.88 for founder demos.
        """

        def j(v: float, rel: float, lo: float, hi: float) -> float:
            delta = self._rng.gauss(0, rel * scale)
            return max(lo, min(hi, v + delta))

        # Frequency and readout_error dominate fidelity; give them stronger steps.
        # Amplitude/phase are second-order. T1/T2 are coherence levers but slower.
        freq_step = 0.048 if scale > 1.0 else 0.026
        amp_step = 0.085 if scale > 1.0 else 0.042
        ro_step = 0.29 if scale > 1.0 else 0.18

        return base.with_updates(
            frequency=j(base.frequency, freq_step, 4.20, 5.90),
            amplitude=j(base.amplitude, amp_step, 0.24, 0.76),
            phase=j(base.phase, 0.32, -math.pi, math.pi),
            t1=j(base.t1, 0.12, 15.0, 88.0),
            t2=j(base.t2, 0.13, 10.0, 68.0),
            readout_error=j(base.readout_error, ro_step, 0.002, 0.16),
        )

    def calibrate(
        self,
        qubit_id: int,
        target_fidelity: float | None = None,
        on_step: Callable[[int, CalibrationResult], None] | None = None,
    ) -> CalibrationResult:
        """Run the calibration loop for a single qubit.

        Returns the final CalibrationResult. Side-effects:
          - updates internal metrics
          - calls on_step(iter, result) for each iteration if provided
          - commits the reported best params to the adapter (anneal may
            have left the device on a later, worse candidate)
        """
        start_wall = time.time()
        threshold = target_fidelity or self.fidelity_threshold

        current = self.adapter.get_calibration(qubit_id)
        best = current
        best_fid = self.adapter.measure_fidelity(qubit_id)

        history: list[tuple[int, float]] = [(0, round(best_fid, 5))]
        no_improve = 0
        success = False
        final_res: CalibrationResult | None = None

        for it in range(1, self.max_iterations + 1):
            # Temperature-like schedule for accepting worse steps (higher early)
            progress = (it - 1) / max(1, self.max_iterations)
            temp = max(0.015, 0.55 * (1.0 - progress))

            # Scale exploration: wide early, tighten later. Also random restarts.
            base_scale = 1.6 if it < 8 else (1.1 if it < 20 else 0.85)
            if no_improve > (self.patience // 2):
                base_scale = 1.8  # force wider when stuck
            scale = base_scale * (0.6 + 0.8 * self._rng.random())

            candidate = self._sample_neighbor(current, scale)
            t_call = time.time()
            res = self.adapter.apply_calibration_update(candidate)
            latency = time.time() - t_call

            # Record interface latency
            self._metrics.total_interface_latency_s += latency
            self._metrics.latency_samples += 1

            f = res.fidelity
            accepted = False

            if f > best_fid:
                accepted = True
            else:
                # Accept worse with probability exp((f - best)/temp)
                if temp > 0.001 and self._rng.random() < math.exp((f - best_fid) / max(1e-6, temp)):
                    accepted = True

            if accepted:
                current = candidate
                if f > best_fid:
                    best = candidate
                    best_fid = f
                    no_improve = 0
                else:
                    no_improve += 1
            else:
                no_improve += 1

            history.append((it, round(f, 5)))

            final_res = CalibrationResult(
                success=best_fid >= threshold,
                params=best,
                fidelity=round(best_fid, 5),
                iterations=it,
                duration_s=round(time.time() - start_wall, 4),
                history=history[:],
                message="Converged" if best_fid >= threshold else "In progress",
            )

            if on_step:
                on_step(it, final_res)

            if best_fid >= threshold:
                success = True
                break

            if no_improve >= self.patience:
                # Restart around the best known with a wider draw
                current = best
                # Inject a semi-random restart every so often to escape local plateaus
                if self._rng.random() < 0.6:
                    # Sample from a wide band around best
                    wide = self._sample_neighbor(best, 2.4)
                    current = wide
                no_improve = max(0, self.patience // 3)

        if final_res is None:
            final_res = CalibrationResult(
                success=False,
                params=best,
                fidelity=round(best_fid, 5),
                iterations=self.max_iterations,
                duration_s=round(time.time() - start_wall, 4),
                history=history,
                message="Max iterations reached",
            )

        # Every candidate is written to the adapter, including rejected and
        # annealed-worse steps. Re-apply `best` so live state matches the
        # fidelity we report (otherwise Calibrate Q0 can leave the machine
        # worse than claimed).
        self.adapter.apply_calibration_update(best)

        # Update aggregate metrics
        self._metrics.attempts += 1
        if success:
            self._metrics.successes += 1
            self._metrics.total_time_to_cal_s += final_res.duration_s

        self._last_result = final_res
        return final_res

    def get_last_result(self) -> CalibrationResult | None:
        return self._last_result
