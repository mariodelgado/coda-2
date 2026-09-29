"use client"

import NumberFlow from "@number-flow/react"
import { motion } from "motion/react"

const easeOut = [0.23, 1, 0.32, 1] as const

interface MetricsCardsProps {
  timeToCal: number
  successRate: number
  interfaceLatency: number
  successes: number
  attempts: number
}

export function MetricsCards({
  timeToCal,
  successRate,
  interfaceLatency,
  successes,
  attempts,
}: MetricsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {[
        {
          label: "Avg Time to Calibrated",
          value: timeToCal,
          format: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
          suffix: "s",
          hint: null as string | null,
        },
        {
          label: "Calibration Success Rate",
          value: successRate * 100,
          format: { minimumFractionDigits: 1, maximumFractionDigits: 1 },
          suffix: "%",
          hint: `${successes}/${attempts} successes`,
        },
        {
          label: "Avg Interface Latency",
          value: interfaceLatency,
          format: { minimumFractionDigits: 4, maximumFractionDigits: 4 },
          suffix: "s",
          hint: "decision → backend ack",
        },
      ].map((m) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: easeOut }}
          className="rounded border border-white/10 bg-zinc-950 p-3"
        >
          <div className="mb-1 text-[10px] text-zinc-400">{m.label}</div>
          <div className="flex items-baseline gap-1 text-2xl font-semibold tracking-[-1px] tabular-nums">
            <NumberFlow value={m.value} format={m.format} />
            <span className="text-xs font-normal text-zinc-500">{m.suffix}</span>
          </div>
          {m.hint && <div className="text-[10px] text-zinc-500">{m.hint}</div>}
        </motion.div>
      ))}
    </div>
  )
}
