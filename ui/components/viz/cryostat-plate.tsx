"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Static isometric cryostat (dilution refrigerator) hairline wireframe.
 *
 * Purely presentational — no WebGPU, no R3F, no animation.
 * Renders the SVG asset with generous padding on a near-black field.
 * Only two labels live on the asset: "FIG 1" (top-left) and "CRYOSTAT" (top-right).
 *
 * Structural reference (not visual copy): stacked thermal stages, support rods,
 * cable bundles, central heat exchanger coil, top flange, qubit package at bottom.
 * Front edges win occlusion; signal path descends top→bottom.
 */

export interface CryostatPlateProps {
  className?: string
}

export function CryostatPlate({ className }: CryostatPlateProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#000000] flex items-center justify-center",
        className
      )}
      aria-label="Cryostat isometric diagram"
    >
      {/* Generous padding container to keep the plate breathing room on all sides */}
      <div className="relative w-full h-full p-8 md:p-10 lg:p-12 flex items-center justify-center">
        {/* The plate asset itself — static SVG, hairline isometric, no interaction.
            Using <img> is intentional for a static illustration asset with object-fit contain. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/plates/cryostat-isometric.svg"
          alt="Cryostat — isometric wireframe of dilution refrigerator thermal stages and signal path"
          className="max-h-full max-w-full object-contain select-none pointer-events-none"
          draggable={false}
        />
      </div>
    </div>
  )
}
