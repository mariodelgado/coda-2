.PHONY: setup install demo demo-calibration demo-circuit test lint format clean run-api run-ui help

PYTHON := python3
PIP := pip3
UV := uv

help:
	@echo "Conductor QPU - AI-to-QPU Integration Layer"
	@echo ""
	@echo "Targets:"
	@echo "  setup         - Create venv and install dependencies"
	@echo "  install       - Install package in editable mode"
	@echo "  demo          - Run both demos (calibration + circuit)"
	@echo "  demo-calibration - Run calibration demo"
	@echo "  demo-circuit  - Run Bell pair circuit demo"
	@echo "  test          - Run pytest suite"
	@echo "  lint          - Run ruff linting"
	@echo "  format        - Format code with ruff"
	@echo "  run-api       - Start FastAPI server"
	@echo "  run-ui        - Start Streamlit UI"
	@echo "  clean         - Remove build artifacts and caches"

setup:
	@echo "Setting up Conductor QPU environment..."
	$(PIP) install --upgrade pip
	$(PIP) install -e ".[dev]"
	@echo "Setup complete. Run 'make demo' to execute demos."

install:
	$(PIP) install -e ".[dev]"

demo: demo-calibration demo-circuit
	@echo ""
	@echo "=== All demos complete ==="

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

run-api:
	$(PYTHON) -m conductor_qpu.api

run-ui:
	streamlit run src/conductor_qpu/ui/app.py
