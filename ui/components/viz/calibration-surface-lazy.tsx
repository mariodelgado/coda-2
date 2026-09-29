"use client"

import dynamic from "next/dynamic"
import type { CalibrationSurfaceProps } from "./calibration-surface"

const Inner = dynamic(
  () => import("./calibration-surface").then((m) => m.CalibrationSurface),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-950 text-xs text-zinc-500">
        Loading GPU surface…
      </div>
    ),
  },
)

export function CalibrationSurfaceLazy(props: CalibrationSurfaceProps) {
  return <Inner {...props} />
}
