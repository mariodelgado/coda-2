"use client"

import React from "react"
import { motion, AnimatePresence } from "motion/react"
import { X, Cpu, Activity, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CalibrationSurfaceLazy } from "@/components/viz/calibration-surface-lazy"
import type { DeviceState, MetricsSnapshot, ToolTrace, JobRecord } from "@/lib/api"

export interface RightInspectorProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  device: DeviceState | null
  detuning: Record<string, number> | null
  applied: { frequency?: number; amplitude?: number; phase?: number; readout_error?: number } | null
  metrics: MetricsSnapshot | null
  selectedClip?: {
    id: string
    kind: "trace" | "job"
    label: string
    detail?: string
    raw?: unknown
  } | null
  onClearSelection?: () => void
}

const easeOut = [0.23, 1, 0.32, 1] as const

export function RightInspector({
  open,
  onOpenChange,
  device,
  detuning,
  applied,
  metrics,
  selectedClip,
  onClearSelection,
}: RightInspectorProps) {
  const cal = (metrics?.orchestrator?.calibration || metrics?.calibration || {}) as Record<string, number>
  const timeToCal = Number(cal.avg_time_to_calibrated_s ?? 0)
  const successRate = Number(cal.calibration_success_rate ?? 0)
  const ifaceLat = Number(cal.avg_interface_latency_s ?? 0)
  const attempts = Number(cal.attempts ?? 0)
  const successes = Number(cal.successes ?? 0)

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 12, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 12, opacity: 0 }}
          transition={{ duration: 0.18, ease: easeOut }}
          className="w-[320px] shrink-0 rounded-xl border border-white/10 bg-zinc-950/90 p-3 text-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium tracking-[-0.2px]">Inspector</div>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Selection detail */}
          {selectedClip && (
            <div className="mb-3 rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <Badge variant="outline" className="border-white/10 text-[10px]">{selectedClip.kind}</Badge>
                <span className="font-medium">{selectedClip.label}</span>
                <button
                  className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300"
                  onClick={onClearSelection}
                >
                  clear
                </button>
              </div>
              {selectedClip.detail && (
                <div className="font-mono text-[10px] text-emerald-400/90 break-all">{selectedClip.detail}</div>
              )}
              {selectedClip.raw != null && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-zinc-500">raw</summary>
                  <pre className="mt-1 max-h-[120px] overflow-auto rounded bg-black/60 p-1.5 text-[10px] text-zinc-400">
{JSON.stringify(selectedClip.raw as Record<string, unknown> | null, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Device */}
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
              <Cpu className="h-3 w-3" /> Device
            </div>
            {!device ? (
              <div className="text-xs text-zinc-500">No device snapshot.</div>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant={device.is_ready ? "default" : "destructive"} className="px-1.5 py-0 text-[10px]">
                    {device.is_ready ? "READY" : "CAL NEEDED"}
                  </Badge>
                  <span className="tabular-nums text-zinc-400">{device.readiness_score.toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 text-[11px]">
                  <div>
                    <div className="text-zinc-500">Temps (mK)</div>
                    {Object.entries(device.temperatures_mk).map(([q, t]) => (
                      <div key={q} className="tabular-nums">Q{q}: {t}</div>
                    ))}
                  </div>
                  <div>
                    <div className="text-zinc-500">Readout</div>
                    {Object.entries(device.readout_fidelity).map(([q, f]) => (
                      <div key={q} className="tabular-nums">Q{q}: {(f * 100).toFixed(1)}%</div>
                    ))}
                  </div>
                </div>
                {detuning && (
                  <div className="border-t border-white/10 pt-1.5 text-[10px] text-amber-400">
                    Detuning (Q0): Δf={detuning.frequency_error} Δa={detuning.amplitude_error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metrics (honest) */}
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
              <Activity className="h-3 w-3" /> Metrics
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="rounded border border-white/10 bg-black/30 p-2">
                <div className="text-[10px] text-zinc-500">Avg time to calibrated</div>
                <div className="tabular-nums text-lg font-semibold tracking-[-0.5px]">{timeToCal.toFixed(4)}s</div>
                <div className="text-[10px] text-zinc-500">{successes}/{attempts} successes</div>
              </div>
              <div className="rounded border border-white/10 bg-black/30 p-2">
                <div className="text-[10px] text-zinc-500">Success rate</div>
                <div className="tabular-nums text-lg font-semibold tracking-[-0.5px]">{(successRate * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-zinc-500">interface p50 ~ {ifaceLat.toFixed(4)}s</div>
              </div>
            </div>
          </div>

          {/* Drift surface (small, in inspector) */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-zinc-500">
              <Zap className="h-3 w-3" /> Param drift (inspector)
            </div>
            <div className="h-[168px] overflow-hidden rounded-lg border border-white/10">
              <CalibrationSurfaceLazy
                detuning={detuning}
                applied={applied}
                fidelityHistory={[]}
                readinessScore={device?.readiness_score ?? 0.7}
                readoutFidelity={device?.readout_fidelity ?? null}
              />
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">
              Cyan = true target, amber = applied. Drag to orbit.
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
