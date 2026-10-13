"use client"

import { useInstrumentTheme } from "@/hooks/use-instrument-theme"
import { qubitHex } from "@/lib/qubit-color"

/**
 * Compact in-UI key for the fridge-pole language.
 * Always visible in the dock so color is never a secret.
 */
export function QubitLegend({ className }: { className?: string }) {
  const theme = useInstrumentTheme()
  const cryo = qubitHex(0, 0, theme)
  const ember = qubitHex(1, 0, theme)
  const mid = qubitHex(0.5, 0, theme)
  const linked = `linear-gradient(90deg, ${cryo}, ${ember})`

  return (
    <div className={`qubit-legend ${className ?? ""}`} aria-label="Qubit color language">
      <span className="qubit-legend-item">
        <i style={{ background: cryo }} />
        |0⟩ cryo
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: ember }} />
        |1⟩ ember
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: mid }} />
        mix
      </span>
      <span className="qubit-legend-item">
        <i style={{ background: linked }} />
        entangled
      </span>
    </div>
  )
}
