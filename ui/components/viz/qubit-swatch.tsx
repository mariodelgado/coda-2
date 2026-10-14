"use client"

import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  inkOn,
  qubitColor,
  rgbToHex,
  type ThemeMode,
} from "@/lib/qubit-color"

export function QubitSwatch({
  p1,
  phase = 0,
  theme = "dark",
  label,
  size = 12,
  entangled = false,
  className,
  title,
}: {
  p1: number
  phase?: number
  theme?: ThemeMode
  label?: string
  size?: number
  entangled?: boolean
  className?: string
  title?: string
}) {
  const fill = qubitColor(p1, phase, theme)
  const hex = rgbToHex(fill)
  const ink = rgbToHex(inkOn(fill))
  return (
    <span
      className={cn("qubit-swatch", entangled && "qubit-swatch-linked", className)}
      title={title ?? `|1⟩ p=${p1.toFixed(2)}`}
      style={
        {
          "--swatch": hex,
          "--swatch-ink": ink,
          width: size,
          height: size,
        } as CSSProperties
      }
      aria-label={label ? `${label} p1 ${p1.toFixed(2)}` : `p1 ${p1.toFixed(2)}`}
    >
      {label ? <span className="qubit-swatch-label">{label}</span> : null}
    </span>
  )
}

export function QubitChip({
  index,
  p1,
  phase = 0,
  theme = "dark",
  extra,
  entangled = false,
  className,
}: {
  index: 0 | 1
  p1: number
  phase?: number
  theme?: ThemeMode
  extra?: string
  entangled?: boolean
  className?: string
}) {
  const fill = qubitColor(p1, phase, theme)
  const hex = rgbToHex(fill)
  return (
    <span
      className={cn("qubit-chip", entangled && "qubit-chip-linked", className)}
      style={{ "--q-fill": hex } as CSSProperties}
      title={`Q${index}  P(|1⟩)=${p1.toFixed(2)}`}
    >
      <QubitSwatch p1={p1} phase={phase} theme={theme} size={8} entangled={entangled} />
      <span className="qubit-chip-id">Q{index}</span>
      {extra ? <span className="qubit-chip-extra instrument-mono">{extra}</span> : null}
    </span>
  )
}
