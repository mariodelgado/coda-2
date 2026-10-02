.PHONY: setup install demo demo-calibration demo-circuit test lint format clean run-api run-ui run-ui-dev founder-demo founder-demo-llm founder-demo-stub help

PYTHON := python3
PIP := pip3
UV := uv

help:
	@echo "Conductor QPU - AI-to-QPU Integration Layer"
	@echo ""
	@echo "Targets:"
	@echo "  setup         - Create venv and install Python deps; also installs UI deps"
	@echo "  install       - Install Python package in editable mode"
	@echo "  demo          - Run both Python demos (calibration + circuit)"
	@echo "  demo-calibration - Run calibration demo (Python)"
	@echo "  demo-circuit  - Run Bell pair circuit demo (Python)"
	@echo "  founder-demo  - Run the scriptable founder demo (orchestrator + traces)"
	@echo "  founder-demo-llm - Same as founder-demo but with CONDUCTOR_ENABLE_LLM=1 (requires OPENAI_API_KEY)"
	@echo "  founder-demo-stub - Run founder demo against the hardware-shaped stub (no sim)"
	@echo "  test          - Run pytest suite"
	@echo "  lint          - Run ruff linting"
	@echo "  format        - Format code with ruff"
	@echo "  run-api       - Start FastAPI backend (http://localhost:8000)"
	@echo "  run-ui        - Build + start Next.js UI (http://localhost:3000)"
	@echo "  run-ui-dev    - Start Next.js UI in dev mode (recommended for development)"
	@echo "  clean         - Remove build artifacts and caches"

setup:
	@echo "Setting up Conductor QPU (Python + Next.js UI)..."
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[dev]"
	@echo "Installing Next.js UI dependencies..."
	cd ui && npm install
	@echo "Setup complete."
	@echo ""
	@echo "Run 'make demo' for Python demos."
	@echo "To run the full stack:  make run-api   (in one shell)"
	@echo "                         make run-ui-dev (in another shell)"

install:
	$(PIP) install -e ".[dev]"

demo: demo-calibration demo-circuit
	@echo ""
	@echo "=== All Python demos complete ==="

demo-calibration:
	@echo "=== Running Calibration Demo ==="
	$(PYTHON) -m demo_scripts.run_calibration_demo

demo-circuit:
	@echo "=== Running Circuit (Bell Pair) Demo ==="
	$(PYTHON) -m demo_scripts.run_circuit_demo

test:
	pytest tests/ -v --tb=short

lint:
	ruff check src/ tests/ demo_scripts/

format:
	ruff format src/ tests/ demo_scripts/

clean:
	rm -rf build/ dist/ *.egg-info .pytest_cache .ruff_cache __pycache__ src/__pycache__ demo_outputs/
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	cd ui && rm -rf .next out node_modules/.cache 2>/dev/null || true

run-api:
	@echo "Starting FastAPI on :8000 (CORS allows :3000; private-network header for Chromium)"
	$(PYTHON) -m conductor_qpu.api

run-ui:
	@echo "Building and starting Next.js UI on :3000"
	cd ui && npm run build && npm run start

run-ui-dev:
	@echo "Starting Next.js dev server on :3000"
	@echo "  - Same-origin proxy: UI calls /qpu/* are rewritten to http://127.0.0.1:8000/*"
	@echo "  - Default NEXT_PUBLIC_API_BASE is '/qpu' (same-origin). No manual env needed."
	@echo "  - LIVE pill and Calibrate Q0 chips will work once API is reachable."
	cd ui && npm run dev

founder-demo:
	@echo "=== Running Founder Demo (scriptable, no UI) ==="
	$(PYTHON) -m demo_scripts.founder_demo

founder-demo-llm:
	@echo "=== Running Founder Demo with LLM planner (CONDUCTOR_ENABLE_LLM=1) ==="
	@echo "Requires OPENAI_API_KEY in env. Falls back to deterministic on any LLM error."
	CONDUCTOR_ENABLE_LLM=1 $(PYTHON) -m demo_scripts.founder_demo

founder-demo-stub:
	@echo "=== Running Founder Demo against ConductorShapedAdapter (stub) ==="
	CONDUCTOR_QPU_BACKEND=stub $(PYTHON) -m demo_scripts.founder_demo
