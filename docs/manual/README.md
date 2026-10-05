# Coda 2 — Technical Manual (source)

HTML/SVG sources for the Coda 2 technical manual PDF.

- `gen/part_*.html` — chapter fragments (front matter, walkthrough, parts 1–11). `build.sh` assembles them into `book.html`.
- `gen_diagrams.py`, `gen_plates.py`, `gen_qpu_plates.py` — regenerate the SVG figures in `diagrams/`.
- `assets/ui/manual-3pane-*.png` — live three-pane screenshots (drift | device 3D | cryostat + dock), captured with `capture-shots.mjs`.

Build (needs `google-chrome` and `pdfinfo`):

```bash
./docs/manual/build.sh                                   # -> docs/manual/coda-2-manual.pdf (gitignored)
MANUAL_COPY_TO=/path/coda-2-manual.pdf ./docs/manual/build.sh   # also copy the PDF elsewhere
```
