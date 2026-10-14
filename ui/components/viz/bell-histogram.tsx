"use client"

import { useInstrumentTheme } from "@/hooks/use-instrument-theme"
import { outcomeColor, p1FromBellCounts, pairGradient } from "@/lib/qubit-color"
import { QubitChip } from "@/components/viz/qubit-swatch"

const OUTCOMES = ["00", "01", "10", "11"] as const

export function BellHistogram({
  counts,
  phase = 0,
  className,
}: {
  counts: Record<string, number>
  phase?: number
  className?: string
}) {
  const theme = useInstrumentTheme()
  const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0) || 1
  const p0 = p1FromBellCounts(counts, 0)
  const p1 = p1FromBellCounts(counts, 1)
  const linked = pairGradient(p0, p1, phase, theme)
  const max = Math.max(...OUTCOMES.map((k) => Number(counts[k] || 0)), 1)

  return (
    <div className={`bell-histogram ${className ?? ""}`}>
      <div className="bell-histogram-pair" style={{ background: linked.css }}>
        <QubitChip index={0} p1={p0} phase={phase} theme={theme} extra={`${(p0 * 100).toFixed(0)}%`} entangled />
        <span className="bell-histogram-link" aria-hidden="true" />
        <QubitChip index={1} p1={p1} phase={phase} theme={theme} extra={`${(p1 * 100).toFixed(0)}%`} entangled />
      </div>
      <div className="bell-histogram-bars" role="img" aria-label="Bell pair counts">
        {OUTCOMES.map((k) => {
          const n = Number(counts[k] || 0)
          const h = (n / max) * 100
          const { css } = outcomeColor(k, theme)
          return (
            <div key={k} className="bell-bar">
              <div className="bell-bar-track">
                <div
                  className="bell-bar-fill"
                  style={{ height: `${Math.max(h, n > 0 ? 6 : 0)}%`, background: css }}
                />
              </div>
              <span className="bell-bar-label instrument-mono">|{k}⟩</span>
              <span className="bell-bar-n instrument-mono">{n}</span>
            </div>
          )
        })}
      </div>
      <div className="bell-histogram-meta instrument-mono">
        {(total).toFixed(0)} shots · P(corr) {(((Number(counts["00"] || 0) + Number(counts["11"] || 0)) / total) * 100).toFixed(0)}%
      </div>
    </div>
  )
}
