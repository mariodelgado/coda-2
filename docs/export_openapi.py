"""Export the FastAPI OpenAPI schema to docs/openapi.json.

python docs/export_openapi.py
make openapi
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    # Import after path setup so this works from repo root without install.
    repo = Path(__file__).resolve().parents[1]
    src = repo / "src"
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))

    from conductor_qpu.api.server import app

    dest = Path(__file__).resolve().parent / "openapi.json"
    dest.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {dest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
