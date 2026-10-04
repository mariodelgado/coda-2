"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CryostatPlateProps {
  className?: string
  // Live data props are accepted for future overlays/chips but not required for the static asset.
  device?: {
    is_ready?: boolean
    temperatures_mk?: Record<string | number, number>
    readout_fidelity?: Record<string | number, number>
  } | null
  detuning?: Record<string, number> | null
  stageMachine?: { key?: string; label?: string; colorClass?: string; dotClass?: string } | null
  hasActiveJob?: boolean
  activeJobStatus?: string | null
  lastTrace?: { tool: string; summary?: string } | null
}

/**
 * Static isometric cryostat (dilution refrigerator) plate.
 *
 * Uses the finished hairline wireframe asset:
 *   ui/public/plates/cryostat-isometric.svg
 *
 * - Near-black field (#0a0a0b)
 * - Generous padding inside the pane
 * - object-fit: contain so the drawing breathes
 * - Only two labels on the asset itself: FIG 1 (top-left) and DILUTION FRIDGE (top-right)
 *
 * The component remains a thin presentational wrapper so live data can be
 * overlaid later (small status chips) without changing the hero visual.
 */

export function CryostatPlate({ className }: CryostatPlateProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#000000] flex items-center justify-center",
        className
      )}
      aria-label="Cryostat isometric diagram — dilution fridge"
    >
      {/* Generous padding container to keep the plate breathing on all sides */}
      <div className="relative w-full h-full p-8 md:p-10 lg:p-12 flex items-center justify-center">
        {/* The finished asset — static, hairline isometric, no WebGPU/R3F */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/plates/cryostat-isometric.svg"
          alt="Dilution fridge — isometric wireframe (stacked thermal stages, rods, cable looms, heat-exchanger coil, qubit package)"
          className="max-h-full max-w-full object-contain select-none pointer-events-none"
          draggable={false}
        />
      </div>
    </div>
  )
}
