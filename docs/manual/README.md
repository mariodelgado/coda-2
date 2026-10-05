# Coda 2 — Technical Manual

Sources and the built PDF for the Coda 2 technical manual.

**Open the book:** [`coda-2-manual.pdf`](coda-2-manual.pdf)

The opening pages are the live **three-pane instrument** (left param-drift · center device 3D · right cryostat), not the older one-pane or two-pane layouts.

- `gen/part_*.html` — chapter fragments. `build.sh` assembles them into `book.html`.
- `gen_diagrams.py`, `gen_plates.py`, `gen_qpu_plates.py` — regenerate SVG figures in `diagrams/`.
- `assets/ui/manual-3pane-*.png` — live three-pane screenshots (drift | device 3D | cryostat + dock). Recapture with `capture-shots.mjs`.

Rebuild:

```bash
./docs/manual/build.sh                                   # -> docs/manual/coda-2-manual.pdf
MANUAL_COPY_TO=/path/coda-2-manual.pdf ./docs/manual/build.sh
```

Recapture stills (API on :8000, UI on :3000, Playwright installed):

```bash
OUT=docs/manual/assets/ui node docs/manual/capture-shots.mjs
```
