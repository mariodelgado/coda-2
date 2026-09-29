"use client"

import React from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts"
import { motion } from "motion/react"

export interface FidelityPoint {
  iter: number
  fidelity: number
}

export interface HeroViewerProps {
  fidelityHistory: FidelityPoint[]
  threshold: number
  lastParams?: Record<string, number> | null
  jobOutcome?: {
    type: "bell"
    counts: Record<string, number>
  } | null
  onRequestInspect?: () => void
}

const easeOut = [0.23, 1, 0.32, 1] as const

export function HeroViewer({
  fidelityHistory,
  threshold,
  lastParams,
  jobOutcome,
  onRequestInspect,
}: HeroViewerProps) {
  const chartData = React.useMemo(
    () => fidelityHistory.map((p) => ({ step: p.iter, fidelity: p.fidelity, threshold })),
    [fidelityHistory, threshold],
  )

  const latest = fidelityHistory.length ? fidelityHistory[fidelityHistory.length - 1].fidelity : undefined

  if (jobOutcome?.type === "bell" && jobOutcome.counts) {
    const c = jobOutcome.counts
    const total = Object.values(c).reduce((a, b) => a + (b as number), 0) || 1
    const entries = Object.entries(c)
    return (
      <div className="relative h-full w-full rounded-xl border border-white/10 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between text-sm">
          <div className="font-medium tracking-[-0.2px]">Bell outcome</div>
          <button
            onClick={onRequestInspect}
            className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5"
          >
            Inspect
          </button>
        </div>
        <div className="flex h-[220px] items-end gap-3">
          {entries.map(([k, v]) => {
            const pct = Math.round(((v as number) / total) * 100)
            return (
              <div key={k} className="flex flex-1 flex-col items-center gap-2">
                <motion.div
                  initial={{ height: 8 }}
                  animate={{ height: Math.max(12, Math.round((pct / 100) * 180)) }}
                  transition={{ duration: 0.4, ease: easeOut }}
                  className="w-full max-w-[72px] rounded-t bg-emerald-500/90"
                />
                <div className="font-mono text-xs text-zinc-400">{k}</div>
                <div className="tabular-nums text-sm font-medium">{v} <span className="text-zinc-500">({pct}%)</span></div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 text-[10px] text-zinc-500">Total shots: {total}</div>
      </div>
    )
  }

  if (!fidelityHistory.length) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-zinc-950">
        <div className="text-center">
          <div className="text-sm text-zinc-400">Center stage</div>
          <div className="mt-1 text-xs text-zinc-500">Run a calibration to see the fidelity climb.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full rounded-xl border border-white/10 bg-zinc-950 p-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <div>
          <div className="text-sm font-medium tracking-[-0.2px]">Calibration fidelity</div>
          <div className="text-[10px] text-zinc-500">
            threshold {threshold} · latest {latest !== undefined ? latest.toFixed(5) : "—"}
            {lastParams && (
              <span className="ml-2 text-amber-400/70">
                f={lastParams.frequency?.toFixed(3)} a={lastParams.amplitude?.toFixed(3)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onRequestInspect}
          className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-white/5"
        >
          Inspect
        </button>
      </div>

      <div className="h-[260px] -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
            <XAxis dataKey="step" tick={{ fontSize: 10, fill: "#52525b" }} />
            <YAxis domain={[0.5, 1.02]} tick={{ fontSize: 10, fill: "#52525b" }} />
            <Tooltip
              contentStyle={{ background: "#0a0a0b", border: "1px solid #27272a", fontSize: 11 }}
            />
            <ReferenceLine
              y={threshold}
              stroke="#f59e0b"
              strokeDasharray="3 2"
              label={{ value: "threshold", fill: "#f59e0b", fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="fidelity"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 1.5, fill: "#10b981" }}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-1 pt-1 text-[10px] text-zinc-500">
        Real steps from the gradient-free loop. Each point is a measured fidelity after an update.
      </div>
    </div>
  )
}
