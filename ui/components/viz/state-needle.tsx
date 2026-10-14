"use client"

import { useId } from "react"
import { type GoldenStation } from "@/lib/qubit-color"

const STATIONS: { id: GoldenStation; label: string }[] = [
  { id: "calibrate", label: "Calibrate" },
  { id: "ready", label: "READY" },
  { id: "bell", label: "Bell" },
]

const INDEX: Record<GoldenStation, number> = { calibrate: 0, ready: 1, bell: 2 }

/**
 * Directional spectral needle. Inspired by Quantum Compass's idea of a
 * gradient that points — indigo at the start, ice at the tip. Next
 * golden-path step: Calibrate → READY → Bell.
 */
export function StateNeedle({
  next,
  arrived = false,
}: {
  next: GoldenStation
  arrived?: boolean
}) {
  const uid = useId().replace(/:/g, "")
  const idx = INDEX[next]
  const tip = arrived && next === "bell" ? 100 : idx * 50
  const caption =
    arrived && next === "bell"
      ? "Bell complete"
      : next === "calibrate"
        ? "Next: Calibrate"
        : next === "ready"
          ? "Next: READY"
          : "Next: Bell"

  return (
    <div className="state-needle" title={caption} aria-label={caption}>
      <svg
        className="state-needle-svg"
        viewBox="0 0 168 28"
        width="168"
        height="28"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`needle-grad-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--q0)" />
            <stop offset="100%" stopColor="var(--q1)" />
          </linearGradient>
        </defs>
        <line x1="12" y1="16" x2="156" y2="16" stroke="var(--hairline)" strokeWidth="1" />
        {STATIONS.map((s, i) => {
          const x = 12 + i * 72
          const on = s.id === next
          return (
            <g key={s.id}>
              <circle
                cx={x}
                cy={16}
                r={on ? 3.4 : 2.4}
                fill={on ? "var(--q1)" : "var(--q0)"}
                opacity={on ? 1 : 0.55}
              />
              <text
                x={x}
                y={9}
                textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                fill="var(--secondary-label)"
                fontSize="7.5"
                fontFamily="var(--font-mono-inst)"
              >
                {s.label}
              </text>
            </g>
          )
        })}
        <polygon
          className="state-needle-arm"
          points={`${12 + (tip / 100) * 144 - 5},22 ${12 + (tip / 100) * 144},11 ${12 + (tip / 100) * 144 + 5},22`}
          fill={`url(#needle-grad-${uid})`}
        />
      </svg>
      <span className="state-needle-caption instrument-mono">{caption}</span>
    </div>
  )
}
