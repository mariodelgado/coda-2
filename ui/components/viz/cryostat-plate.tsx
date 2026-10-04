"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CryostatPlateProps {
  className?: string
  device?: {
    is_ready?: boolean
    temperatures_mk?: Record<string | number, number>
    readout_fidelity?: Record<string | number, number>
  } | null
  detuning?: Record<string, number> | null
  stageMachine?: { key?: string; label?: string; colorClass?: string; dotClass?: string } | null
  hasActiveJob?: boolean
  activeJobStatus?: string | null
  lastTrace?: { tool: string; summary?: string } | null
}

type Region = "top" | "upper" | "still" | "base" | "mixing" | "coil" | "cables" | "package"

const REGION_LABEL: Record<Region, string> = {
  top: "Top Flange",
  upper: "Upper Thermal Plates (4 K)",
  still: "Still Plate",
  base: "Base Plate",
  mixing: "Mixing Chamber Plate",
  coil: "Heat Exchanger Coil",
  cables: "Cable Looms",
  package: "Qubit Package",
}

function getRegionFromNormY(y: number): Region {
  if (y < 0.12) return "top"
  if (y < 0.30) return "upper"
  if (y < 0.44) return "still"
  if (y < 0.56) return "base"
  if (y < 0.70) return "mixing"
  if (y < 0.78) return "coil"
  if (y < 0.88) return "cables"
  return "package"
}

function StageChip({ label, active, className }: { label: string; active?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2 py-px font-mono text-[10px] backdrop-blur text-zinc-200",
        className
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", active ? "bg-[#007AFF]" : "bg-[#34C759]")} />
      <span>{label}</span>
      {active && (
        <span className="ml-1 inline-block h-2 w-2 animate-spin rounded-full border border-white/30 border-t-white/80" />
      )}
    </div>
  )
}

/**
 * Static isometric cryostat plate (finished asset) + interactive instrument HUD.
 *
 * - Renders the provided hairline asset with generous padding and object-fit:contain.
 * - Live frosted status chips (stage with spinner when CALIBRATING/RUNNING/job active, fid, temp, Δf).
 * - Hover anywhere on the plate computes a logical region (top→package) from pointer y.
 * - Subtle left-side highlight band + frosted tooltip with deeper live status (part + all metrics + job/trace).
 * - All data from real backend polls (no mock state).
 */

export function CryostatPlate({
  className,
  device,
  detuning,
  stageMachine,
  hasActiveJob,
  activeJobStatus,
  lastTrace,
}: CryostatPlateProps) {
  const [hovered, setHovered] = React.useState<Region | null>(null)
  const [tipPos, setTipPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  const q0 = Number(device?.readout_fidelity?.[0] ?? device?.readout_fidelity?.["0"] ?? NaN)
  const q1 = Number(device?.readout_fidelity?.[1] ?? device?.readout_fidelity?.["1"] ?? NaN)
  const t0 = Number(device?.temperatures_mk?.[0] ?? device?.temperatures_mk?.["0"] ?? NaN)
  const df = Number(detuning?.frequency_error ?? 0)

  const stageLabel = stageMachine?.label || (device?.is_ready ? "READY" : "DRIFT")
  const stageKey = (stageMachine?.key || "").toUpperCase()
  const isActive = hasActiveJob || stageKey === "CALIBRATING" || stageKey === "RUNNING"

  const onPointer = (e: React.PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height)
    const region = getRegionFromNormY(Math.max(0, Math.min(1, ny)))
    setHovered(region)
    setTipPos({ x: e.clientX - rect.left + 12, y: Math.max(8, e.clientY - rect.top - 8) })
  }

  const clear = () => setHovered(null)

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-[#000000] flex items-center justify-center", className)}
      onPointerLeave={clear}
    >
      <div className="relative w-full h-full p-6 md:p-8 lg:p-10 flex items-center justify-center">
        <div
          ref={containerRef}
          className="relative"
          style={{ width: "100%", maxWidth: 460, aspectRatio: "640 / 900" }}
          onPointerMove={onPointer}
          onPointerEnter={onPointer}
        >
          {/* The finished asset (preferred visual) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/plates/cryostat-isometric.svg"
            alt="Dilution fridge — isometric wireframe"
            className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
            draggable={false}
          />

          {/* Subtle left highlight band for the hovered logical part */}
          {hovered && (
            <div
              className="absolute left-0 z-10 pointer-events-none"
              style={{
                top: hovered === "top" ? "4%" : hovered === "upper" ? "12%" : hovered === "still" ? "30%" : hovered === "base" ? "44%" : hovered === "mixing" ? "56%" : hovered === "coil" ? "70%" : hovered === "cables" ? "78%" : "86%",
                height: hovered === "top" || hovered === "package" ? "10%" : "14%",
                width: 3,
                background: "#c8d0d8",
                opacity: 0.7,
                boxShadow: "0 0 0 1px rgba(200,208,216,0.25)",
              }}
            />
          )}

          {/* Live instrument chips — overlaid on the plate area */}
          <div className="absolute bottom-2 left-2 right-2 z-20 flex flex-wrap gap-1.5">
            <StageChip label={stageLabel} active={isActive} />
            {!Number.isNaN(q0) && (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/70 px-1.5 py-px font-mono text-[10px] backdrop-blur text-zinc-200">
                Q0 <span className="ml-1 text-white tabular-nums">{(q0 * 100).toFixed(0)}%</span>
              </div>
            )}
            {!Number.isNaN(t0) && (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/70 px-1.5 py-px font-mono text-[10px] backdrop-blur text-zinc-200 tabular-nums">
                {t0.toFixed(1)} mK
              </div>
            )}
            {df !== 0 && (
              <div className="inline-flex items-center rounded-full border border-white/10 bg-black/70 px-1.5 py-px font-mono text-[10px] backdrop-blur text-zinc-200 tabular-nums">
                Δf {df.toFixed(3)}
              </div>
            )}
          </div>

          {/* Rich frosted tooltip on hover (deeper than chips) */}
          {hovered && (
            <div
              className="absolute z-[80] pointer-events-none rounded-md border border-white/10 bg-[rgba(18,18,22,0.94)] backdrop-blur px-2.5 py-1.5 text-[10px] leading-tight shadow-2xl"
              style={{ left: tipPos.x, top: tipPos.y, minWidth: 188, maxWidth: 230 }}
            >
              <div className="font-medium tracking-[0.4px] text-zinc-100">{REGION_LABEL[hovered]}</div>
              <div className="text-[9px] text-zinc-500">Dilution refrigerator • live</div>
              <div className="my-1 h-px bg-white/10" />
              <div className="space-y-0.5 tabular-nums">
                <div>
                  Stage: <span className={cn("font-medium", isActive ? "text-[#007AFF]" : "text-[#34C759]")}>{stageLabel}</span>
                  {isActive && <span className="ml-1 inline-block h-2 w-2 animate-spin rounded-full border border-white/30 border-t-white/80 align-[-1px]" />}
                </div>
                {!Number.isNaN(q0) && (
                  <div>
                    Q0 <span className="text-white">{(q0 * 100).toFixed(1)}%</span>
                    {!Number.isNaN(q1) && <> · Q1 <span className="text-white">{(q1 * 100).toFixed(1)}%</span></>}
                  </div>
                )}
                {!Number.isNaN(t0) && <div>Temp <span className="text-white">{t0.toFixed(1)}</span> mK</div>}
                {df !== 0 && <div>Δf <span className="text-white">{df.toFixed(3)}</span></div>}
                {hasActiveJob && <div className="text-[#007AFF]">Job · {activeJobStatus || "running"}</div>}
                {lastTrace && (
                  <div className="text-zinc-400 text-[9px] pt-0.5 truncate">
                    {lastTrace.tool}{lastTrace.summary ? ` — ${lastTrace.summary}` : ""}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
