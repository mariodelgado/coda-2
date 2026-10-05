#!/usr/bin/env bash
# Assemble book.html and print coda-2-manual.pdf via a local HTTP server.
# Chrome file:// print often drops large PNGs; HTTP makes the stills embed.
set -euo pipefail
cd "$(dirname "$0")"
python3 gen_diagrams.py
python3 gen_plates.py
python3 gen_qpu_plates.py
# Reassemble from gen parts if present
python3 - <<'PY'
from pathlib import Path
gen = Path("gen")
required = [
    "part_front.html",
    "part_1_2.html",
    "part_diagrams.html",
    "part_3_6.html",
    "part_7_11.html",
    "part_expand.html",
    "part_expand2.html",
]
if all((gen / r).exists() for r in required):
    parts = [
        (gen / "part_front.html").read_text(),
        (gen / "part_1_2.html").read_text(),
        (gen / "part_diagrams.html").read_text(),
        (gen / "part_3_6.html").read_text(),
    ]
    p711 = (gen / "part_7_11.html").read_text().rstrip()
    if p711.endswith("</html>"):
        p711 = p711[:-7]
    if p711.rstrip().endswith("</body>"):
        p711 = p711.rstrip()[:-7]
    parts.append(p711)
    parts.append((gen / "part_expand.html").read_text())
    parts.append((gen / "part_expand2.html").read_text())
    Path("book.html").write_text("\n".join(parts) + "\n</body></html>\n")
    print("assembled book.html", Path("book.html").stat().st_size)
else:
    missing = [r for r in required if not (gen / r).exists()]
    print("using existing book.html; missing:", missing)
PY

PORT="${MANUAL_HTTP_PORT:-8765}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/coda-manual-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "$HTTP_PID" 2>/dev/null || true; }
trap cleanup EXIT
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/book.html" >/dev/null; then
    break
  fi
  sleep 0.15
done

OUT=coda-2-manual.pdf
google-chrome --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=20000 --run-all-compositor-stages-before-draw \
  --print-to-pdf="$OUT" "http://127.0.0.1:${PORT}/book.html"

if [ -n "${MANUAL_COPY_TO:-}" ]; then cp -f "$OUT" "$MANUAL_COPY_TO"; fi
if command -v pdfinfo >/dev/null 2>&1; then
  pdfinfo "$OUT" | egrep 'Pages|Page size|File size|Title' || true
else
  python3 - <<'PY'
from pathlib import Path
p = Path("coda-2-manual.pdf")
print(f"wrote {p} ({p.stat().st_size} bytes)")
PY
fi
echo "PDF: $(pwd)/$OUT"
