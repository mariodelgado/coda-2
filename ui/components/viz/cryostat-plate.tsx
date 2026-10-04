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

/**
 * Interactive isometric cryostat (dilution refrigerator) hairline wireframe.
 *
 * Base drawing is the authored hairline SVG (exact visual preserved).
 * Logical parts are grouped for hover: top flange, thermal plates, heat exchanger,
 * cable bundles, and qubit package.
 *
 * On hover of a part, a subtle brighter stroke highlight is drawn over that part
 * and a frosted instrument tooltip shows live backend data (fidelity, mK, Δf,
 * stage, active job, last trace) — all driven by real device/job polls.
 *
 * Keyboard: the regions are pointer-primary; the tooltip content matches the
 * rest of the instrument for screen readers via the surrounding UI state.
 */

type Region =
  | "top"
  | "4k"
  | "still"
  | "base"
  | "mixing"
  | "coil"
  | "cables"
  | "package"

const REGION_LABEL: Record<Region, string> = {
  top: "Top Flange",
  "4k": "4 K Plate",
  still: "Still Plate",
  base: "Base Plate (1 K)",
  mixing: "Mixing Chamber Plate",
  coil: "Heat Exchanger (Coil)",
  cables: "Cable Looms",
  package: "Qubit Package",
}

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
  const [tip, setTip] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  const q0 = React.useMemo(
    () => Number(device?.readout_fidelity?.[0] ?? device?.readout_fidelity?.["0"] ?? NaN),
    [device],
  )
  const q1 = React.useMemo(
    () => Number(device?.readout_fidelity?.[1] ?? device?.readout_fidelity?.["1"] ?? NaN),
    [device],
  )
  const t0 = React.useMemo(
    () => Number(device?.temperatures_mk?.[0] ?? device?.temperatures_mk?.["0"] ?? NaN),
    [device],
  )
  const df = React.useMemo(() => Number(detuning?.frequency_error ?? 0), [detuning])

  const stageLabel = stageMachine?.label || (device?.is_ready ? "READY" : "DRIFT")
  const stageClass = stageMachine?.colorClass || (device?.is_ready ? "text-[#34C759]" : "text-[#FF9500]")

  const handleEnter =
    (region: Region) =>
    (e: React.PointerEvent<SVGGElement>) => {
      setHovered(region)
      const rect = rootRef.current?.getBoundingClientRect()
      if (rect) {
        setTip({
          x: e.clientX - rect.left + 14,
          y: Math.max(12, e.clientY - rect.top - 10),
        })
      }
    }

  const clearHover = () => setHovered(null)

  const hasData = !Number.isNaN(q0) || !Number.isNaN(t0) || df !== 0

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#000000] flex items-center justify-center",
        className,
      )}
      aria-label="Cryostat isometric diagram — hover stages for live status"
      onPointerLeave={clearHover}
    >
      <div className="relative w-full h-full p-7 md:p-9 lg:p-10 flex items-center justify-center">
        {/* Aspect-preserving box so the inline SVG hit areas align with the drawn art */}
        <div
          className="relative"
          style={{ width: "100%", maxWidth: 480, aspectRatio: "720 / 1040" }}
        >
          <svg
            viewBox="0 0 720 1040"
            className="absolute inset-0 w-full h-full"
            onPointerLeave={clearHover}
            onPointerMove={(e) => {
              if (hovered) {
                const rect = rootRef.current?.getBoundingClientRect();
                if (rect) {
                  setTip({
                    x: e.clientX - rect.left + 14,
                    y: Math.max(12, e.clientY - rect.top - 10),
                  });
                }
              }
            }}
          >
            <rect x="0" y="0" width="720" height="1040" fill="#0a0a0b" />

            {/* Base structure (rods + dashed signal path + minor details) — always visible */}
            {/* Rear rods */}
            <path d="M235 108 L235 458" stroke="#6c727c" strokeWidth="2.4" />
            <path d="M485 108 L485 458" stroke="#6c727c" strokeWidth="2.4" />
            {/* Side-back rods */}
            <path d="M198 112 L198 455" stroke="#646b76" strokeWidth="2.1" />
            <path d="M522 112 L522 455" stroke="#646b76" strokeWidth="2.1" />
            {/* Front rods */}
            <path d="M272 105 L272 460" stroke="#9aa0aa" strokeWidth="2.6" />
            <path d="M448 105 L448 460" stroke="#9aa0aa" strokeWidth="2.6" />
            {/* Signal path cue */}
            <path
              d="M360 108 L360 175 L360 270 L360 365 L360 460 L360 528"
              stroke="#5a606a"
              strokeWidth="0.35"
              strokeDasharray="2 3"
            />

            {/* ===================== TOP FLANGE ===================== */}
            <g
              onPointerEnter={handleEnter("top")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
              role="img"
              aria-label="Top flange"
            >
              <title>Top Flange (room temperature)</title>
              <ellipse cx="360" cy="92" rx="168" ry="36" stroke="#8a8f98" strokeWidth="0.9" />
              <ellipse cx="360" cy="86" rx="168" ry="36" stroke="#a8adb6" strokeWidth="0.95" />
              <path d="M192 92 L192 108" stroke="#8a8f98" strokeWidth="0.85" />
              <path d="M528 92 L528 108" stroke="#8a8f98" strokeWidth="0.85" />
              <path d="M192 86 Q360 58 528 86" stroke="#b8bdc6" strokeWidth="0.7" fill="none" />
            </g>
            {hovered === "top" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="86" rx="168" ry="36" stroke="#c8d0d8" strokeWidth="1.7" />
              </g>
            )}

            {/* ===================== STAGE 1 (4K) ===================== */}
            <g
              onPointerEnter={handleEnter("4k")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
              role="img"
              aria-label="4 K plate"
            >
              <title>4 K Plate (upper thermal stage)</title>
              <ellipse cx="360" cy="178" rx="152" ry="27" stroke="#7d838c" strokeWidth="0.8" />
              <ellipse cx="360" cy="174" rx="152" ry="27" stroke="#9ca2ab" strokeWidth="0.85" />
              <circle cx="250" cy="167" r="2.6" fill="none" stroke="#8a8f98" strokeWidth="0.6" />
              <circle cx="310" cy="158" r="2.6" fill="none" stroke="#8a8f98" strokeWidth="0.6" />
              <circle cx="410" cy="158" r="2.6" fill="none" stroke="#8a8f98" strokeWidth="0.6" />
              <circle cx="470" cy="167" r="2.6" fill="none" stroke="#8a8f98" strokeWidth="0.6" />
              <circle cx="232" cy="183" r="2.6" fill="none" stroke="#9ca2ab" strokeWidth="0.65" />
              <circle cx="488" cy="183" r="2.6" fill="none" stroke="#9ca2ab" strokeWidth="0.65" />
            </g>
            {hovered === "4k" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="174" rx="152" ry="27" stroke="#c8d0d8" strokeWidth="1.6" />
              </g>
            )}

            {/* ===================== STAGE 2 (STILL) ===================== */}
            <g
              onPointerEnter={handleEnter("still")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <ellipse cx="360" cy="272" rx="142" ry="24" stroke="#747a84" strokeWidth="0.75" />
              <ellipse cx="360" cy="268" rx="142" ry="24" stroke="#959ba5" strokeWidth="0.8" />
              <circle cx="258" cy="263" r="2.4" fill="none" stroke="#8a8f98" strokeWidth="0.55" />
              <circle cx="462" cy="263" r="2.4" fill="none" stroke="#8a8f98" strokeWidth="0.55" />
              <circle cx="240" cy="279" r="2.4" fill="none" stroke="#959ba5" strokeWidth="0.6" />
              <circle cx="480" cy="279" r="2.4" fill="none" stroke="#959ba5" strokeWidth="0.6" />
            </g>
            {hovered === "still" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="268" rx="142" ry="24" stroke="#c8d0d8" strokeWidth="1.55" />
              </g>
            )}

            {/* ===================== STAGE 3 (BASE) ===================== */}
            <g
              onPointerEnter={handleEnter("base")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <ellipse cx="360" cy="368" rx="135" ry="23" stroke="#6f757f" strokeWidth="0.7" />
              <ellipse cx="360" cy="364" rx="135" ry="23" stroke="#8f95a0" strokeWidth="0.75" />
              <circle cx="265" cy="358" r="2.3" fill="none" stroke="#818891" strokeWidth="0.55" />
              <circle cx="455" cy="358" r="2.3" fill="none" stroke="#818891" strokeWidth="0.55" />
            </g>
            {hovered === "base" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="364" rx="135" ry="23" stroke="#c8d0d8" strokeWidth="1.5" />
              </g>
            )}

            {/* ===================== STAGE 4 (MIXING CHAMBER) ===================== */}
            <g
              onPointerEnter={handleEnter("mixing")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <ellipse cx="360" cy="462" rx="122" ry="21" stroke="#686e79" strokeWidth="0.65" />
              <ellipse cx="360" cy="458" rx="122" ry="21" stroke="#878d99" strokeWidth="0.7" />
              <circle cx="278" cy="453" r="2.2" fill="none" stroke="#7d838c" strokeWidth="0.5" />
              <circle cx="442" cy="453" r="2.2" fill="none" stroke="#7d838c" strokeWidth="0.5" />
              <circle cx="255" cy="467" r="2.2" fill="none" stroke="#878d99" strokeWidth="0.55" />
              <circle cx="465" cy="467" r="2.2" fill="none" stroke="#878d99" strokeWidth="0.55" />
            </g>
            {hovered === "mixing" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="458" rx="122" ry="21" stroke="#c8d0d8" strokeWidth="1.45" />
              </g>
            )}

            {/* ===================== CENTRAL COIL ===================== */}
            <g
              onPointerEnter={handleEnter("coil")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <path
                d="M312 282 Q328 294 312 306 Q296 318 312 330 Q328 342 312 354 Q296 366 312 378"
                stroke="#8a909a"
                strokeWidth="1.1"
                fill="none"
              />
              <path
                d="M408 282 Q392 294 408 306 Q424 318 408 330 Q392 342 408 354 Q424 366 408 378"
                stroke="#8a909a"
                strokeWidth="1.1"
                fill="none"
              />
              <path d="M360 280 L360 382" stroke="#6c727c" strokeWidth="0.8" />
            </g>
            {hovered === "coil" && (
              <g pointerEvents="none">
                <path
                  d="M312 282 Q328 294 312 306 Q296 318 312 330 Q328 342 312 354 Q296 366 312 378"
                  stroke="#c8d0d8"
                  strokeWidth="1.6"
                  fill="none"
                />
                <path
                  d="M408 282 Q392 294 408 306 Q424 318 408 330 Q392 342 408 354 Q424 366 408 378"
                  stroke="#c8d0d8"
                  strokeWidth="1.6"
                  fill="none"
                />
              </g>
            )}

            {/* ===================== CABLE BUNDLES ===================== */}
            <g
              onPointerEnter={handleEnter("cables")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              {/* left rear */}
              <path d="M268 200 Q255 230 272 262" stroke="#777d87" strokeWidth="0.55" />
              <path d="M275 200 Q262 232 278 264" stroke="#777d87" strokeWidth="0.55" />
              <path d="M282 200 Q270 234 284 266" stroke="#777d87" strokeWidth="0.55" />
              <path d="M272 272 Q258 305 275 338" stroke="#6f757f" strokeWidth="0.5" />
              {/* right rear */}
              <path d="M452 200 Q465 232 448 264" stroke="#777d87" strokeWidth="0.55" />
              <path d="M445 200 Q458 232 442 264" stroke="#777d87" strokeWidth="0.55" />
              {/* front left */}
              <path d="M290 185 Q272 225 285 265" stroke="#9aa0aa" strokeWidth="0.65" />
              <path d="M298 185 Q280 228 292 268" stroke="#9aa0aa" strokeWidth="0.6" />
              <path d="M305 185 Q290 230 300 270" stroke="#9aa0aa" strokeWidth="0.55" />
              {/* front right */}
              <path d="M430 185 Q448 225 435 265" stroke="#9aa0aa" strokeWidth="0.65" />
              <path d="M422 185 Q440 228 428 268" stroke="#9aa0aa" strokeWidth="0.6" />
              <path d="M415 185 Q432 230 420 270" stroke="#9aa0aa" strokeWidth="0.55" />
            </g>
            {hovered === "cables" && (
              <g pointerEvents="none">
                <path d="M290 185 Q272 225 285 265" stroke="#c8d0d8" strokeWidth="1.3" />
                <path d="M430 185 Q448 225 435 265" stroke="#c8d0d8" strokeWidth="1.3" />
                <path d="M272 272 Q258 305 275 338" stroke="#c8d0d8" strokeWidth="1.1" />
              </g>
            )}

            {/* ===================== QUBIT PACKAGE ===================== */}
            <g
              onPointerEnter={handleEnter("package")}
              onPointerLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <ellipse cx="360" cy="530" rx="96" ry="18" stroke="#5f656f" strokeWidth="0.6" />
              <ellipse cx="360" cy="526" rx="96" ry="18" stroke="#7d838d" strokeWidth="0.65" />
              <rect x="322" y="542" width="76" height="22" rx="2" stroke="#8b8171" strokeWidth="0.7" />
              <rect x="334" y="548" width="52" height="12" rx="1" stroke="#555b64" strokeWidth="0.6" />
              <rect x="342" y="552" width="36" height="6" rx="0.6" stroke="#6f757f" strokeWidth="0.5" />
              {/* skirt cables */}
              <path d="M310 522 Q295 535 335 555" stroke="#6f757f" strokeWidth="0.45" />
              <path d="M410 522 Q425 535 385 555" stroke="#6f757f" strokeWidth="0.45" />
              <path d="M348 523 Q352 538 358 558" stroke="#7d838d" strokeWidth="0.5" />
            </g>
            {hovered === "package" && (
              <g pointerEvents="none">
                <ellipse cx="360" cy="526" rx="96" ry="18" stroke="#c8d0d8" strokeWidth="1.35" />
                <rect
                  x="322"
                  y="542"
                  width="76"
                  height="22"
                  rx="2"
                  stroke="#c8d0d8"
                  strokeWidth="1.1"
                  fill="none"
                />
              </g>
            )}
          </svg>

          {/* Frosted live tooltip — richer than the small stage chips */}
          {hovered && (
            <div
              className="absolute z-[70] pointer-events-none rounded-md border border-white/10 bg-[rgba(18,18,22,0.94)] backdrop-blur-md px-2.5 py-1.5 text-[10px] leading-tight shadow-2xl"
              style={{
                left: tip.x,
                top: tip.y,
                minWidth: 176,
                maxWidth: 220,
              }}
            >
              <div className="font-medium tracking-[0.4px] text-zinc-100">
                {REGION_LABEL[hovered]}
              </div>
              <div className="text-[9px] text-zinc-500">Dilution refrigerator stage</div>

              <div className="my-1 h-px bg-white/10" />

              <div className="tabular-nums space-y-0.5">
                <div>
                  Stage:{" "}
                  <span className={cn("font-medium", stageClass)}>{stageLabel}</span>
                </div>

                {hasData && (
                  <>
                    {!Number.isNaN(q0) && (
                      <div>
                        Q0 <span className="text-white">{(q0 * 100).toFixed(1)}%</span>
                        {!Number.isNaN(q1) && (
                          <>
                            {" "}
                            · Q1 <span className="text-white">{(q1 * 100).toFixed(1)}%</span>
                          </>
                        )}
                      </div>
                    )}
                    {!Number.isNaN(t0) && (
                      <div>
                        Temp <span className="text-white">{t0.toFixed(1)}</span> mK
                      </div>
                    )}
                    {df !== 0 && (
                      <div>
                        Δf <span className="text-white">{df.toFixed(3)}</span>
                      </div>
                    )}
                  </>
                )}

                {hasActiveJob && (
                  <div className="text-[#007AFF]">Job · {activeJobStatus || "running"}</div>
                )}

                {lastTrace && (
                  <div className="text-zinc-400 text-[9px] pt-0.5 truncate">
                    {lastTrace.tool}
                    {lastTrace.summary ? ` — ${lastTrace.summary}` : ""}
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
