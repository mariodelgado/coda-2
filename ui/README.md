# quantum-chat — UI

Next.js 16 App Router + shadcn/ui instrument panel for the quantum control plane.

## Stack (Emil Kowalski + WebGPU)

Opinionated picks from [emilkowalski/skills](https://github.com/emilkowalski/skills) (`pick-ui-library` + `emil-design-eng`), mirrored in `.cursor/skills` and `ui/.cursor/skills`:

| Concern | Library |
| --- | --- |
| Command palette (⌘K, **no open animation**) | `cmdk` |
| Toasts (cal success/fail/cancel/backend down) | `sonner` |
| Metric counters | `@number-flow/react` |
| Motion (transform/opacity, strong ease-out) | `motion` |
| Theme | `next-themes` (forced dark) |
| Shared UI state | `zustand` |
| Viz debug panel | `leva` |
| Primitives | shadcn/ui + Radix |
| Charts | `recharts` |
| 3D / WebGPU drift surface | `three` + `@react-three/fiber` + `@react-three/drei` |

### WebGPU caveat

The param-drift surface uses an async `WebGPURenderer` factory from `three/webgpu` when `navigator.gpu` exists. If WebGPU init fails or the browser lacks it, R3F falls back to `WebGLRenderer` and shows a banner. Pure `@react-three/fiber/webgpu` (R3F v10) is not required for this build (R3F 9.x + async factory).

## Run

From repo root (with API already up on `:8000`):

```bash
make run-ui-dev
# or
cd ui && npm install && npm run dev
```

Production check:

```bash
cd ui && npm run build && npm start
```

### Same-origin default (no env gymnastics)

- Dev server rewrites `/qpu/*` → `http://127.0.0.1:8000/*` (see `next.config.ts`).
- `lib/api.ts` defaults to `/qpu` (same-origin) when `NEXT_PUBLIC_API_BASE` is unset.
- Toolbar shows **LIVE** / **OFFLINE** based on real `/health` connectivity.
- Toolbar refresh re-checks connection first (so a failed first health can recover).
- On mount we retry health a few times to absorb startup races / Chromium private-network timing.
- FastAPI emits `Access-Control-Allow-Private-Network: true` for local origins.

Only set `NEXT_PUBLIC_API_BASE` if you run the API on a different origin/port intentionally.

Optional (explicit): `NEXT_PUBLIC_API_BASE=http://localhost:8000` (still works; no rewrite needed).

### Tunnel / Safari / remote clients (Cloudflare tunnel, trycloudflare, etc.)

- **Leave `NEXT_PUBLIC_API_BASE` unset at build time.**
- The client will default to same-origin `/qpu` (relative).
- Next dev rewrites `/qpu/*` → the local API only for local dev.
- From the tunnel (which fronts only the UI on :3000), calls to `/qpu/health` etc. will go through the tunnel and be proxied by the dev server (or your production proxy).
- Do **not** bake `http://127.0.0.1:8000`, `http://localhost:8000`, or any `127.0.0.1:3000/qpu` into the client bundle — that URL will be unreachable from a remote Safari (or any client not on the same machine).
- If you previously built with a local `NEXT_PUBLIC_API_BASE`, the client bundle may contain an absolute URL pointing at the builder's machine. Rebuild without the var (or with it unset) to get a same-origin `/qpu` bundle.
- Toolbar will show **LIVE** once `/qpu/health` succeeds over the tunnel.

## Key files

- `app/page.tsx` — control plane composition
- `components/command/command-palette.tsx` — ⌘K goals
- `components/viz/calibration-surface.tsx` — WebGPU/WebGL fidelity landscape
- `lib/api.ts` — FastAPI client
- `lib/store.ts` — zustand UI store
