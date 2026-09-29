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
  apiBase: typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
    : "http://localhost:8000",
  setApiBaseLocal: (base) => set({ apiBase: base }),
}))
