"""Minimal Streamlit UI for quantum-chat.

Focus is on demonstrating the control plane, not on UI polish:
- Accept goals like "Bring qubit 0 to ready" and "Run a Bell pair and report fidelity"
- Show status + the three key metrics
- Run calibration and circuit demos from buttons
"""

from __future__ import annotations

import httpx
import streamlit as st

API_BASE = "http://localhost:8000"


def api_get(path: str) -> dict:
    try:
        r = httpx.get(f"{API_BASE}{path}", timeout=10.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


def api_post(path: str, json: dict | None = None) -> dict:
    try:
        r = httpx.post(f"{API_BASE}{path}", json=json or {}, timeout=30.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


st.set_page_config(page_title="quantum-chat", layout="wide")
st.title("quantum-chat — Quantum Instrument")
st.caption("visual · text · math  —  agent control plane for a quantum device")

colA, colB = st.columns([1, 1])

with colA:
    st.subheader("Goals (Natural Language)")
    goal = st.text_input(
        "Enter goal",
        value="Bring qubit 0 to ready",
        help="Try: 'Bring qubit 0 to ready', 'Run a Bell pair and report fidelity', 'device state'",
    )
    if st.button("Submit Goal", type="primary"):
        resp = api_post("/goals", {"goal": goal})
        st.session_state["last_goal"] = resp
    if st.session_state.get("last_goal"):
        lg = st.session_state["last_goal"]
        if "error" in lg:
            st.error(lg["error"])
        else:
            st.write("**Results**")
            for i, r in enumerate(lg.get("results", [])):
                st.markdown(f"**Step {i + 1}** — ok={r['ok']} latency={r['latency_s']}s")
                st.json(r.get("data", {}))
                if r.get("error"):
                    st.warning(r["error"])
            st.write("**Metrics snapshot**")
            st.json(lg.get("metrics", {}))

with colB:
    st.subheader("Direct Controls")
    if st.button("Calibrate Qubit 0 (target 0.88)"):
        r = api_post("/calibrate", {"qubit_id": 0, "target_fidelity": 0.88})
        st.session_state["last_cal"] = r
    if st.button("Run Bell Pair (1024 shots)"):
        r = api_post("/circuit/bell", {"shots": 1024, "qubits": [0, 1]})
        st.session_state["last_bell"] = r

    if st.session_state.get("last_cal"):
        st.write("**Last calibration**")
        st.json(st.session_state["last_cal"])
    if st.session_state.get("last_bell"):
        st.write("**Last Bell**")
        st.json(st.session_state["last_bell"])

st.divider()

st.subheader("Live Device State")
if st.button("Refresh Device"):
    st.session_state["device"] = api_get("/device/state")
dev = st.session_state.get("device") or api_get("/device/state")
if "error" in dev:
    st.error(dev["error"])
else:
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Ready?", "YES" if dev.get("is_ready") else "NO", delta=None)
    c2.metric("Readiness", f"{dev.get('readiness_score', 0):.3f}")
    c3.metric("Qubits", ", ".join(map(str, dev.get("qubits", []))))
    temps = dev.get("temperatures_mk", {})
    c4.metric("Temps (mK)", ", ".join(f"{q}:{t}" for q, t in temps.items()))
    st.caption(dev.get("notes", ""))
    st.json(
        {
            "readout_fidelity": dev.get("readout_fidelity"),
            "coherence_us": dev.get("coherence_us"),
        }
    )

st.divider()

st.subheader("Metrics (time_to_calibrated, success_rate, interface_latency)")
m = api_get("/metrics")
if "error" in m:
    st.error(m["error"])
else:
    st.json(m)

st.divider()
st.caption(
    "This UI talks to the FastAPI control plane. Start API first: "
    "`uvicorn conductor_qpu.api.server:app --port 8000`. "
    "Demos can also be run via `make demo`."
)
