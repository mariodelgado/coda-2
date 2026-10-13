# Quantum literacy

← [Coda 2](../README.md) · [Quick start](QUICKSTART.md)

This note is for people who do not run a lab. It explains why the numbers on the instrument move. There is no mysticism here. The machine is physical and probabilistic.

The dock can ask the same ideas in-session: **What does READY mean?** and **Why do counts vary?** Each ask returns live device numbers plus the short observation note below. How those numbers are *colored* — cryo \|0⟩, ember \|1⟩, blend for superposition — is in [Fridge poles](#fridge-poles--the-qubit-color-language).

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

## Fridge poles — the qubit color language

Coda 2 paints every qubit from two thermodynamic poles, not a brand gradient.

The idea — a two-state color that can *point* — is cousin to FIELD.IO’s IBM Quantum Compass. The poles are ours. IBM’s language is a cool blue → purple. Ours is the dilution fridge: a cryogenic ground and a thermal excited state. Superposition is the blend between them. We interpolate in RGB so the midpoint is olive/bronze. The short HSL arc between teal and copper runs through blue → purple; that path is IBM’s, and we do not take it.

| Pole | Ket | Meaning | Dark fill | Light fill |
|---|---|---|---|---|
| **Cryo** | \|0⟩ | Mixing-chamber argon. Ground state. ~10–20 mK. | `#1FB8A0` | `#0B6B5C` |
| **Ember** | \|1⟩ | Copper thermal leak. Excited state. Heat that the fridge is fighting. | `#E07030` | `#B04412` |
| **Mix** | α\|0⟩+β\|1⟩ | RGB blend. Superposition. Olive / bronze, never lavender. | `#809468` | `#5E5A37` |

**How a swatch is computed**

1. Measure (or default) \(p_1 = P(\lvert 1\rangle)\). Unmeasured qubits reset to \(p_1 = 0\) (cryo).
2. Mix cryo → ember in RGB by \(p_1\).
3. Phase (radians, from the applied pulse) is a small hue rotation, at most ±16°. Identity stays fridge-poles; the IBM blue/purple band (220°–300°) is never entered.
4. An entangled pair shares one linked gradient. The bus between Q0 and Q1, the Bell histogram, and the `run_bell_pair` dock pill all use that same stroke — not two independent chips.

Bell bitstrings are `q0q1` (`10` means Q0 = 1, Q1 = 0). Histogram bars:

| Outcome | Color |
|---|---|
| \|00⟩ | cryo |
| \|11⟩ | ember |
| \|01⟩, \|10⟩ | vertical cryo↔ember blend |

The dock’s **state needle** is the directional cue: a small compass whose arm is the cryo→ember gradient. It points at the next golden-path step — Calibrate → READY → Bell — the same three stations the chips already know.

A compact legend sits next to the needle so the language is never a secret. The same fills drive the 3D qubit spheres, cryostat Q0/Q1 chips, readout strip, histogram bars, and Bell pills.

Text on both themes meets WCAG AA (4.5:1). Theme tokens live in `ui/app/globals.css`. Interpolation lives in `ui/lib/qubit-color.ts`. The toolbar sun/moon toggle writes `coda-theme` in `localStorage` and honors `prefers-color-scheme` until you override it. Surfaces are solid tints — no `backdrop-filter` (Safari).

## What the instrument returns

| Ask | What you get |
|---|---|
| What does READY mean? | Live Q0 fidelity / readiness / READY flag, then the observation note |
| Why do counts vary? | Live numbers, then: shots are samples; bins will move; drift continues |
| Bell pair / Improve Bell | Counts, estimated fidelity, shots, uncertainty — plus: this run is one sample |
