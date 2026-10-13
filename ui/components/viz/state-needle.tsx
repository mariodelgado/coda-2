"use client"

import { needleAngle, type GoldenStation } from "@/lib/qubit-color"

const STATIONS: { id: GoldenStation; label: string; x: number }[] = [
  { id: "calibrate", label: "Calibrate", x: 18 },
  { id: "ready", label: "READY", x: 64 },
  { id: "bell", label: "Bell", x: 110 },
]

/**
 * Directional fridge-pole needle. Inspired by Quantum Compass's idea of a
 * gradient that points — not IBM's blue/purple brand. Cryo at the hub,
 * ember at the tip: the next golden-path step (Calibrate → READY → Bell).
 */
export function StateNeedle({
  next,
  arrived = false,
}: {
  next: GoldenStation
  arrived?: boolean
}) {
  const angle = needleAngle(next)
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
        viewBox="0 0 128 44"
        width="128"
        height="44"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="needle-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="var(--q0)" />
            <stop offset="100%" stopColor="var(--q1)" />
          </linearGradient>
        </defs>
        <path
          d="M14 28 A50 50 0 0 1 114 28"
          fill="none"
          stroke="var(--hairline)"
          strokeWidth="1"
        />
        {STATIONS.map((s) => (
          <g key={s.id}>
            <circle
              cx={s.x}
              cy={s.id === "ready" ? 10 : 22}
              r={next === s.id ? 3.2 : 2.2}
              fill={next === s.id ? "var(--q1)" : "var(--q0)"}
              opacity={next === s.id ? 1 : 0.55}
            />
            <text
              x={s.x}
              y={s.id === "ready" ? 7 : 40}
              textAnchor="middle"
              fill="var(--secondary-label)"
              fontSize="7"
              fontFamily="var(--font-mono-inst)"
            >
              {s.label}
            </text>
          </g>
        ))}
        <g
          className="state-needle-arm"
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "64px 36px",
          }}
        >
          <polygon points="64,8 61.2,36 66.8,36" fill="url(#needle-grad)" />
          <circle cx="64" cy="36" r="3" fill="var(--q0)" />
        </g>
      </svg>
      <span className="state-needle-caption instrument-mono">{caption}</span>
    </div>
  )
}
