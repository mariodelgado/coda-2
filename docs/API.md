# Coda 2 control-plane API

← [Coda 2](../README.md) · [Quick start](QUICKSTART.md) · [OpenAPI](openapi.json)

The instrument dock and a notebook speak the **same contract**. A natural-language goal is compiled to typed tools (`calibrate_qubit`, `run_bell_pair`, `get_device_state`, …). Every tool call leaves a **trace**. Finance and quant clients can drive the machine without the UI and still have an audit trail.

| Surface | URL |
|---|---|
| Interactive docs (Swagger) | `GET /docs` |
| ReDoc | `GET /redoc` |
| Live schema | `GET /openapi.json` |
| Committed schema | [docs/openapi.json](openapi.json) (regenerate with `make openapi`) |
| Tool catalog | `GET /tools` |

Default base: `http://127.0.0.1:8000` (`make run-api`). The Next.js UI proxies the same routes via `/qpu`.

---

## Why this is the finance surface

Chat is the wrong interface for a physical, probabilistic device. This API is the opposite:

- **Enumerable actions.** `GET /tools` lists every tool the planner may call, with args, result shape, shot cost, and whether it mutates calibration.
- **Same path as the dock.** `POST /goals` is what the chips post. No private UI-only endpoint.
- **Audit trail.** `traces` on the goal response (and `GET /traces`) record tool, args, latency, ok, `shots`, and `mutates_calibration`.
- **Readiness is a predicate.** `GET /readiness_predicate` and `GET /device/state` expose the exact floor (`readout_fidelity >= 0.82` on every qubit). READY is a number at a timestamp, not a vibe.

---

## HTTP map

| Method | Path | Tag | Summary |
|---|---|---|---|
| GET | `/health` | health | Liveness + LLM planner on/off |
| POST | `/goals` | goals | Compile NL goal → tools → execute |
| GET | `/tools` | tools | Enumerable catalog + cost/risk |
| GET | `/jobs` | jobs | Recent jobs (in-memory, not durable) |
| GET | `/jobs/{job_id}` | jobs | Poll one job |
| GET | `/sse/jobs/{job_id}` | jobs | SSE status stream |
| GET | `/device/state` | device | Snapshot + readiness + predicate |
| GET | `/device/detuning/{qubit_id}` | device | Applied vs hidden-true drift |
| GET | `/readiness_predicate` | readiness | Exact READY predicate |
| GET | `/traces` | observability | Last tool traces |
| GET | `/metrics` | observability | Calibration + tool latencies |
| POST | `/calibrate` | tools | Direct calibrate (mutates) |
| POST | `/circuit/bell` | tools | Direct Bell (shot-costed) |

Demo-only: `POST /demo/fail_next_cal`, `POST /demo/start_long_job`.

---

## Typed intents / tools

The planner maps a goal to one or more of these tools. JSON below is the **tool-call** shape (what appears in `traces[].args` and `GET /tools`).

### `calibrate_qubit`

Writes device parameters. **Risk:** `mutates_calibration: true`. No shot cost.

```json
{ "tool": "calibrate_qubit", "args": { "qubit_id": 0, "target_fidelity": 0.88 } }
```

Successful `results[].data`:

```json
{
  "fidelity": 0.91,
  "iterations": 12,
  "duration_s": 0.4,
  "threshold": 0.88,
  "initial_fidelity": 0.71,
  "params": { "frequency": 5.02, "amplitude": 0.48, "readout_error": 0.03 },
  "history": [[1, 0.74], [2, 0.81]]
}
```

Direct REST: `POST /calibrate` with `{ "qubit_id": 0, "target_fidelity": 0.88 }`.

### `run_bell_pair`

Does **not** write calibration. **Cost:** `shots` (default 1024; 256 = quick, 4096 = precise).

```json
{ "tool": "run_bell_pair", "args": { "shots": 1024, "qubits": [0, 1] } }
```

Successful `results[].data`:

```json
{
  "job_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "counts": { "00": 470, "11": 460, "01": 50, "10": 44 },
  "metrics": {
    "estimated_fidelity": 0.91,
    "shots": 1024,
    "p00": 0.46,
    "p11": 0.45
  }
}
```

Direct REST: `POST /circuit/bell` with `{ "shots": 1024, "qubits": [0, 1] }`.

### `get_device_state`

Read-only. No shots. `mutates_calibration: false`.

```json
{ "tool": "get_device_state", "args": {} }
```

`data` / `GET /device/state` (device endpoint also includes `qubits`, `timestamp`, `readiness_predicate`):

```json
{
  "is_ready": true,
  "readiness_score": 0.91,
  "readout_fidelity": { "0": 0.91, "1": 0.90 },
  "coherence_us": { "0": [50.0, 30.0], "1": [48.0, 29.0] },
  "temperatures_mk": { "0": 15.2, "1": 15.4 },
  "notes": ""
}
```

### `get_job_status`

```json
{ "tool": "get_job_status", "args": { "job_id": "<uuid>" } }
```

Direct REST: `GET /jobs/{job_id}`.

```json
{
  "job_id": "<uuid>",
  "status": "succeeded",
  "job_type": "circuit",
  "created_at": "2026-10-06T05:00:00",
  "completed_at": "2026-10-06T05:00:01",
  "result": { "counts": { "00": 470, "11": 460 }, "shots": 1024 },
  "metrics": { "estimated_fidelity": 0.91, "shots": 1024 },
  "error": null
}
```

`status` ∈ `queued | running | succeeded | failed | cancelled`.  
`job_type` ∈ `calibration | circuit | diagnostic`.

### `cancel_job`

```json
{ "tool": "cancel_job", "args": { "job_id": "<uuid>" } }
```

`data`: `{ "cancelled": true }`.

---

## `POST /goals`

The dock posts `{ "goal": "…" }`. Optional cost/risk fields are additive and may be omitted.

**Request**

```json
{
  "goal": "Run a Bell pair and report fidelity",
  "shots": 256,
  "mutates_calibration": false
}
```

| Field | Required | Meaning |
|---|---|---|
| `goal` | yes | Natural language. Same strings the chips use. |
| `shots` | no | Overrides `run_bell_pair` shot count after planning. |
| `mutates_calibration` | no | If `false` and the compiled plan includes `calibrate_qubit`, HTTP **409** `CALIBRATION_MUTATION_FORBIDDEN`. Omitted = allow calibration. |

**Response** (HTTP 200 even when a tool step fails — see error codes)

```json
{
  "goal": "Bring qubit 0 to ready",
  "user_message": "Bring qubit 0 to ready",
  "agent_message": "Device reports ready. Qubit meets the readiness predicate and is usable for circuits.",
  "results": [
    {
      "ok": true,
      "data": { "fidelity": 0.91, "iterations": 12 },
      "latency_s": 0.42,
      "error": null,
      "mutates_calibration": true
    }
  ],
  "traces": [
    {
      "ts": 1728000000.1,
      "tool": "calibrate_qubit",
      "args": { "qubit_id": 0, "target_fidelity": 0.88 },
      "latency_s": 0.42,
      "ok": true,
      "summary": "fidelity=0.91",
      "mutates_calibration": true
    }
  ],
  "metrics": {}
}
```

Chip → tool (same table as the README):

| Chip | Goal (approx.) | Tool |
|---|---|---|
| Calibrate Q0 | Bring qubit 0 to ready | `calibrate_qubit` |
| Bell pair | Run a Bell pair and report fidelity | `run_bell_pair` |
| Q0 readiness | Report qubit 0 readiness and fidelity status | `get_device_state` |
| Device status | Report device health and temperature status | `get_device_state` |
| Improve Bell | Run a precise Bell pair and report fidelity | `run_bell_pair` (more shots) |
| Diagnose Q0 | Check qubit 0 health and readout status | `get_device_state` |

A Bell goal while Q0 is not ready **prepends** `calibrate_qubit` (golden-path gate). Set `mutates_calibration: false` if that write must be refused.

---

## Readiness

`GET /readiness_predicate`

```json
{
  "name": "all_qubits_readout_fidelity_above",
  "readout_fidelity_threshold": 0.82,
  "description": "Device is_ready iff every qubit has readout_fidelity >= threshold."
}
```

`GET /device/state` repeats that predicate next to live `is_ready` and `readiness_score`. The calibration **tool** threshold (default 0.88) is an internal climb target and can differ from this floor. Treat device `is_ready` as authoritative.

---

## Error codes

HTTP errors use `{"detail": {"code": "…", "message": "…"}}`. FastAPI validation (missing `goal`, bad types) is HTTP 422 (`VALIDATION_ERROR`).

| HTTP | `code` | When |
|---|---|---|
| 400 | `INVALID_JOB_ID` | `job_id` is not a UUID |
| 404 | `JOB_NOT_FOUND` | Unknown job |
| 404 | `QUBIT_NOT_FOUND` | Detuning for an unknown qubit |
| 409 | `CALIBRATION_MUTATION_FORBIDDEN` | `mutates_calibration=false` but plan would calibrate |
| 422 | `VALIDATION_ERROR` | Request body failed schema checks |

In-band (HTTP **200**, step failed — UI contract):

| Where | `error_code` | When |
|---|---|---|
| `results[]` | `GOAL_STEP_FAILED` | Tool ran and returned `ok: false` |
| `results[]` | `UNKNOWN_TOOL` | Planner emitted a name that is not registered |
| `POST /circuit/bell` | `BELL_NO_RESULT` | Job finished without counts |

Jobs are **in-memory** and do not survive process restart.

---

## Python example (notebook-friendly)

Requires the API (`make run-api`) and `httpx` (already a package dependency). A copy lives at [examples/control_plane_client.py](examples/control_plane_client.py).

```python
import httpx

BASE = "http://127.0.0.1:8000"

with httpx.Client(base_url=BASE, timeout=60.0) as c:
    assert c.get("/health").json()["status"] == "ok"
    print("predicate", c.get("/readiness_predicate").json())
    print("tools", [t["name"] for t in c.get("/tools").json()["tools"]])

    goal = c.post("/goals", json={"goal": "Bring qubit 0 to ready"}).json()
    for t in goal["traces"]:
        print(t["tool"], t["ok"], "mutates=", t.get("mutates_calibration"), t["summary"])

    device = c.get("/device/state").json()
    print("ready", device["is_ready"], "score", device["readiness_score"])

    bell = c.post(
        "/goals",
        json={"goal": "Run a Bell pair and report fidelity", "shots": 256},
    ).json()
    job_id = next(
        (r["data"]["job_id"] for r in bell["results"] if (r.get("data") or {}).get("job_id")),
        None,
    )
    if job_id:
        job = c.get(f"/jobs/{job_id}").json()
        print(job["status"], job.get("metrics") or job.get("result"))
```

This is the SDK: `httpx` plus the OpenAPI types. There is no published package.

---

## Regenerating the schema

```bash
make openapi
# writes docs/openapi.json from conductor_qpu.api.server:app
```
