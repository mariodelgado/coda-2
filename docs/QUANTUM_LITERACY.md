# Quantum literacy

← [Coda 2](../README.md) · [Quick start](QUICKSTART.md)

This note is for people who do not run a lab. It explains why the numbers on the instrument move. There is no mysticism here. The machine is physical and probabilistic.

The dock can ask the same ideas in-session: **What does READY mean?** and **Why do counts vary?** Each ask returns live device numbers plus the short observation note below.

## Observation

A qubit holds a prepared state. A measurement does not read a hidden answer that was sitting there. The measurement collapses that state into a classical outcome: 0 or 1.

After the shot, the prepared state is gone. The next shot starts from a new prepare, not from the last bit.

## Counts are samples

A Bell pair with 1024 shots is 1024 independent draws from a distribution. The bins (00, 01, 10, 11) will move if you run again.

Fidelity is an estimate. It has uncertainty. The uncertainty shrinks when you spend more shots. It does not become a fact.

One run is one sample. It is not the number.

## Drift and decoherence

The device changes while you look at it. Frequencies wander. Coherence times shift with temperature. A prepared state also leaks into the environment (decoherence).

The fidelity you just measured is already a number from the past.

## Recalibration is ongoing

READY means Q0 meets the readout-fidelity floor (0.82) at the time of the last check. It is a threshold at a time, not a permanent property.

Calibration is a steady-state practice. Parameters wander after the climb. The drift pane and the climb HUD exist because the machine will leave the ready region.

Recalibration is not a phase you finish. It is work you keep doing.

## What the instrument returns

| Ask | What you get |
|---|---|
| What does READY mean? | Live Q0 fidelity / readiness / READY flag, then the observation note |
| Why do counts vary? | Live numbers, then: shots are samples; bins will move; drift continues |
| Bell pair / Improve Bell | Counts, estimated fidelity, shots, uncertainty — plus: this run is one sample |
