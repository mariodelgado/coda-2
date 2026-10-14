"use client"

import { useInstrumentTheme } from "@/hooks/use-instrument-theme"
import { pairGradient, qubitHex } from "@/lib/qubit-color"

/**
 * Compact in-UI key for the spectral qubit language.
 * Always visible in the dock so color is never a secret.
 */
export function QubitLegend({ className }: { className?: string }) {
  const theme = useInstrumentTheme()
  const indigo = qubitHex(0, 0, theme)
  const ice = qubitHex(1, 0, theme)
  const mid = qubitHex(0.5, 0, theme)
  const linked = pairGradient(0, 1, 0, theme).css

  return (
    <div className={`qubit-legend ${className ?? ""}`} aria-label="Qubit color language">
      <span className="qubit-legend-item">
        <i style={{ background: indigo, ["--swatch" as string]: indigo }} />
        |0⟩ indigo
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: ice, ["--swatch" as string]: ice }} />
        |1⟩ ice
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: mid, ["--swatch" as string]: mid }} />
        cyan
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: linked }} />
        entangled
      </span>
    </div>
  )
}
