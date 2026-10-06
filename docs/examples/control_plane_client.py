"""Notebook-friendly control-plane client (not a published package).

Start the API first: ``make run-api`` (http://127.0.0.1:8000).

    python docs/examples/control_plane_client.py
"""

from __future__ import annotations

import argparse
import sys

import httpx


def run(base: str) -> int:
    with httpx.Client(base_url=base, timeout=60.0) as c:
        health = c.get("/health")
        health.raise_for_status()
        assert health.json()["status"] == "ok"
        print("health", health.json()["status"], health.json().get("llm_planner"))

        pred = c.get("/readiness_predicate").json()
        print("predicate", pred["name"], ">=", pred["readout_fidelity_threshold"])

        tools = c.get("/tools").json()["tools"]
        print("tools", [t["name"] for t in tools])

        goal = c.post("/goals", json={"goal": "Bring qubit 0 to ready"}).json()
        print("agent:", (goal.get("agent_message") or "")[:160])
        for t in goal.get("traces") or []:
            print(
                " trace",
                t["tool"],
                "ok=",
                t["ok"],
                "mutates=",
                t.get("mutates_calibration"),
                t.get("summary"),
            )

        device = c.get("/device/state").json()
        print("ready", device["is_ready"], "score", device["readiness_score"])

        bell = c.post(
            "/goals",
            json={"goal": "Run a Bell pair and report fidelity", "shots": 256},
        ).json()
        job_id = next(
            (
                (r.get("data") or {}).get("job_id")
                for r in bell.get("results") or []
                if (r.get("data") or {}).get("job_id")
            ),
            None,
        )
        if job_id:
            job = c.get(f"/jobs/{job_id}").json()
            print("job", job["status"], job.get("metrics") or job.get("result"))
        else:
            print("bell traces", [t.get("summary") for t in bell.get("traces") or []])
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Coda 2 control-plane example client")
    p.add_argument("--base", default="http://127.0.0.1:8000")
    args = p.parse_args()
    try:
        return run(args.base)
    except httpx.ConnectError:
        print(f"API not reachable at {args.base}. Start it with: make run-api", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
