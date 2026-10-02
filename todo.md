# Conductor QPU UI Connection Fix — Task List

## Root cause (investigated)
- Hardcoded green "LIVE" pill in toolbar (page.tsx), ignores `connected`.
- `checkConnection` only called once on mount, no retries; direct cross-origin fetch from :3000 to :8000 often fails in Chromium (private-network).
- Toolbar refresh button only refreshes device/metrics, never re-runs health.
- No same-origin proxy; `NEXT_PUBLIC_API_BASE` defaults to `http://localhost:8000`.
- FastAPI CORS did not emit `Access-Control-Allow-Private-Network: true`.
- Chips/composer correctly gate on `connected`, but initial failure left UI dead.

## Changes
1. `ui/next.config.ts` — add dev rewrites `/qpu/:path*` → `http://127.0.0.1:8000/:path*`.
2. `ui/lib/api.ts` — default `_base` to `/qpu` (same-origin) when `NEXT_PUBLIC_API_BASE` unset.
3. `ui/app/page.tsx`:
   - Render LIVE vs OFFLINE pill based on real `connected`.
   - Refresh button now: `checkConnection()` then device+metrics if ok.
   - Mount: retry health up to ~4 times with backoff.
   - Minor: improve disabled logic for palette.
4. `src/conductor_qpu/api/server.py` — add middleware to emit `Access-Control-Allow-Private-Network: true` for local origins (keeps direct :8000 working).
5. `README.md` + `Makefile` — document "just run make run-api + make run-ui-dev; chips work by default".
6. `ui/README.md` — mention same-origin default.

## Verification
- `cd ui && npm run build` clean.
- Python: `make lint && make test`.
- Manual: start API, start UI, observe LIVE, click Calibrate Q0, see non-empty agent_message in transcript.
- No change to POST /goals response shape.

## Branch
cursor/fix-qpu-ui-connection-72bb
