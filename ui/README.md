# Conductor QPU — Control Plane UI

Next.js 16 App Router + shadcn/ui instrument panel for the FastAPI control plane.

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

Optional: `NEXT_PUBLIC_API_BASE=http://localhost:8000`

## Key files

- `app/page.tsx` — control plane composition
- `components/command/command-palette.tsx` — ⌘K goals
- `components/viz/calibration-surface.tsx` — WebGPU/WebGL fidelity landscape
- `lib/api.ts` — FastAPI client
- `lib/store.ts` — zustand UI store
