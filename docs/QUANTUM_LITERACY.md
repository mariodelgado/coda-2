# Quantum literacy

← [Coda 2](../README.md) · [Quick start](QUICKSTART.md)

This note is for people who do not run a lab. It explains why the numbers on the instrument move. There is no mysticism here. The machine is physical and probabilistic.

The dock can ask the same ideas in-session: **What does READY mean?** and **Why do counts vary?** Each ask returns live device numbers plus the short observation note below. How those numbers are *colored* — indigo \|0⟩, ice \|1⟩, cyan for superposition — is in [Spectral poles](#spectral-poles--the-qubit-color-language).

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

## Spectral poles — the qubit color language

Coda 2 paints every qubit from a cool spectral gradient. The idea — a two-state color that can *point* — is cousin to FIELD.IO’s IBM Quantum Compass. The hues are ours. IBM’s language is blue → purple → magenta (increasing hue). Ours is electric indigo → cyan → ice mint (decreasing hue, magenta-free). Superposition interpolates in OKLCH so chroma stays high; RGB mixing of these poles goes grey-teal, and we never do that.

| Pole | Ket | Meaning | Dark fill | Light fill |
|---|---|---|---|---|
| **Indigo** | \|0⟩ | Deep electric ultramarine. Ground state. | `#0081e7` | `#004d91` |
| **Cyan** | α\|0⟩+β\|1⟩ | Vivid spectral midpoint. Superposition. | `#00b8d8` | `#006f88` |
| **Ice** | \|1⟩ | Pale ice-mint / violet-free cyan. Excited state. | `#3ce8ce` | `#008d85` |

**How a swatch is computed**

1. Measure (or default) \(p_1 = P(\lvert 1\rangle)\). Unmeasured qubits reset to \(p_1 = 0\) (indigo).
2. Mix indigo → ice in OKLCH by \(p_1\). Hue travels the short decreasing arc (≈252° → 216° → 180°). The midpoint stays cyan, never muddy grey.
3. Phase (radians, from the applied pulse) is a small OKLCH hue rotation, at most ±8°. Identity stays spectral; IBM’s magenta band (280°–340°) is never entered.
4. An entangled pair shares one linked gradient (`linear-gradient(… in oklch, …)`). The bus between Q0 and Q1, the Bell histogram, and the `run_bell_pair` dock pill all use that same stroke — not two independent chips.

Bell bitstrings are `q0q1` (`10` means Q0 = 1, Q1 = 0). Histogram bars:

| Outcome | Color |
|---|---|
| \|00⟩ | indigo |
| \|11⟩ | ice |
| \|01⟩, \|10⟩ | vertical indigo↔ice spectral blend |

The dock’s **state needle** is the directional cue: a compact track whose arm is the indigo→ice gradient. It points at the next golden-path step — Calibrate → READY → Bell — the same three stations the chips already know.

A compact legend sits next to the needle so the language is never a secret. The same fills drive the 3D qubit spheres, cryostat Q0/Q1 chips, readout strip, histogram bars, and Bell pills.

Color lives only on qubit-state elements (swatches, spheres, histogram bars, needle, Bell pills). Chrome stays neutral. Light theme is a cool near-white instrument (`#F4F6F8` paper, `#0E1218` ink, hairline borders, solid fills). Dark fills glow softly; light fills stay saturated jewels, not pastel. Light ice (`#008d85`) is a fill — body ink on paper uses `--q1-fg` (`#005a52`) so text meets AA.

Text on both themes meets WCAG AA (4.5:1). Theme tokens live in `ui/app/globals.css`. Interpolation lives in `ui/lib/qubit-color.ts`. The toolbar sun/moon toggle writes `coda-theme` in `localStorage` and honors `prefers-color-scheme` until you override it. Surfaces are solid tints — no `backdrop-filter` (Safari).

## What the instrument returns

| Ask | What you get |
|---|---|
| What does READY mean? | Live Q0 fidelity / readiness / READY flag, then the observation note |
| Why do counts vary? | Live numbers, then: shots are samples; bins will move; drift continues |
| Bell pair / Improve Bell | Counts, estimated fidelity, shots, uncertainty — plus: this run is one sample |
