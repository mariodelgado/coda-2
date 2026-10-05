# Coda 2 — Quick start

← [Coda 2](../README.md) · full detail in the [technical manual](manual/coda-2-manual.pdf)

**Prerequisites:** Python 3.11+, Node 18+. No API keys for the default path.

```bash
git clone https://github.com/mariodelgado/coda-2.git
cd coda-2
make setup
```

**Terminal A — API**

```bash
make run-api
```

**Terminal B — UI** (keep `NEXT_PUBLIC_API_BASE` unset so same-origin `/qpu` rewrites work)

```bash
cd ui && env -u NEXT_PUBLIC_API_BASE npm run build
env -u NEXT_PUBLIC_API_BASE npx next start -H 0.0.0.0 -p 3000
# or for iteration:
# cd ui && env -u NEXT_PUBLIC_API_BASE npm run dev
```

Open http://localhost:3000.

`ui/lib/api.ts` defaults to `/qpu` when `NEXT_PUBLIC_API_BASE` is unset. The Next server rewrites `/qpu/*` → `http://127.0.0.1:8000/*`.

## First walk

1. Confirm **LIVE** in the toolbar.
2. Click **Calibrate Q0** — watch the climb HUD and drift pane.
3. Click **Q0 readiness** or **Device status** — fidelity / readiness without running a circuit.
4. Click **Bell pair** (or **Improve Bell** for more shots) — estimated fidelity in the transcript.
5. Use **Diagnose Q0** when you need health / temperature context.

## Useful targets

| Target | What it does |
|---|---|
| `make test` | Run the Python test suite |
| `make lint` | Ruff over `tests/` and the sources |
| `make demo` | Headless calibration + circuit demos, no UI required |
| `make manual` | Rebuild the technical manual PDF |

## Notes for UI contributors

Dock stacking:

- `.dock` stays `pointer-events: none`; interactive children use `pointer-events: auto`.
- Transcript, empty state, chips, and composer sit above `.dock-tint` (`position: relative; z-index: 1`).
