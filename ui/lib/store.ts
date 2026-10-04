"use client"

import { create } from "zustand"

interface ControlPlaneUIState {
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  apiBase: string
  setApiBaseLocal: (base: string) => void
}

export const useControlPlaneStore = create<ControlPlaneUIState>((set) => ({
  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),
  // Same-origin /qpu by default (Next dev rewrites to the API, tunnels expose :3000 only).
  // Never default to localhost:8000 here — that breaks Safari/remote clients hitting a tunnel.
  // Leave NEXT_PUBLIC_API_BASE unset for tunnel/remote deploys; set only for explicit non-same-origin.
  apiBase: typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_API_BASE || "/qpu"
    : "/qpu",
  setApiBaseLocal: (base) => set({ apiBase: base }),
}))
