"use client"

import { Command as CommandIcon } from "lucide-react"

export function InstrumentToolbar({
  connected,
  isReady,
  q0Temp,
  readiness,
  q0DeltaF,
  onOpenCommand,
  onRefresh,
}: {
  connected: boolean
  isReady: boolean
  q0Temp?: number
  readiness: string | null
  q0DeltaF?: number
  onOpenCommand: () => void
  onRefresh: () => void
}) {
  return (
    <div className="toolbar relative">
      <div className="flex items-center gap-2 font-medium">
        <span className="font-sans tracking-[-0.2px]">Coda 2</span>
        <span
          className={`px-1.5 py-px rounded text-[10px] text-black font-mono tracking-[0.5px] ${connected ? "" : "opacity-60"}`}
          style={{ background: connected ? "var(--success)" : "#6b7280" }}
          title={connected ? "Connected to control plane" : "Not connected to control plane"}
        >
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Live math: READY + Q0 temp / readiness / Δf (fields already polled; no dock blur). */}
      <div className="toolbar-math absolute left-1/2 -translate-x-1/2">
        {isReady ? <span className="text-success">READY</span> : null}
        {q0Temp != null && (
          <span title="Q0 temperature">{q0Temp.toFixed(1)} mK</span>
        )}
        {readiness != null && (
          <span title="Readiness score">R {readiness}</span>
        )}
        {q0DeltaF != null && (
          <span title="Q0 frequency detuning">Δf {q0DeltaF.toFixed(3)}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button onClick={onOpenCommand} className="rounded border hairline px-1.5 py-px hover:bg-white/5" title="⌘K">
          <CommandIcon className="h-3 w-3" />
        </button>
        <button
          onClick={onRefresh}
          className="rounded border hairline px-1.5 py-px hover:bg-white/5"
          title="Refresh"
        >
          refresh
        </button>
      </div>
    </div>
  )
}
