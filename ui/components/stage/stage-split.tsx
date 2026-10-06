"use client"

import React from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts"
import type { DeviceState, JobRecord, ToolTrace } from "@/lib/api"
import { CalibrationSurfaceLazy } from "@/components/viz/calibration-surface-lazy"
import { Device3DLazy } from "@/components/viz/device-3d-lazy"
import { CryostatPlate } from "@/components/viz/cryostat-plate"
import { StageStateChip, type StageMachineState } from "@/components/stage/stage-state-chip"
import type { AppliedParams } from "@/hooks/use-device-poll"
import type { FidelityPoint, Turn } from "@/lib/turns"

export function StageSplit({
  backendDown,
  leftFr,
  midFr,
  rightFr,
  isDraggingSplit,
  stageRef,
  onSplitterPointerDown,
  onSplitterKeyDown,
  device,
  detuning,
  appliedParams,
  activeTurn,
  surfaceHistory,
  latestFidelity,
  threshold,
  stageMachine,
  hasActiveJob,
  activeJobStatus,
}: {
  backendDown: boolean
  leftFr: number
  midFr: number
  rightFr: number
  isDraggingSplit: boolean
  stageRef: React.RefObject<HTMLDivElement | null>
  onSplitterPointerDown: (e: React.PointerEvent) => void
  onSplitterKeyDown: (e: React.KeyboardEvent) => void
  device: DeviceState | null
  detuning: Record<string, number> | null
  appliedParams: AppliedParams
  activeTurn: Turn | null
  surfaceHistory: FidelityPoint[]
  latestFidelity: number | null
  threshold: number
  stageMachine: StageMachineState
  hasActiveJob: boolean
  activeJobStatus: JobRecord["status"] | null
}) {
  const lastTrace: ToolTrace | null =
    activeTurn && activeTurn.traces && activeTurn.traces.length
      ? activeTurn.traces[activeTurn.traces.length - 1]
      : null

  return (
    <div
      ref={stageRef}
      className="stage stage-split"
      style={{ gridTemplateColumns: `${leftFr}fr 14px ${midFr}fr 14px ${rightFr}fr` }}
    >
      {backendDown && (
        <div className="absolute top-2 left-2 z-40 text-[9px] px-2 py-px rounded-full border border-white/10 bg-black/70 text-[#FF3B30] font-mono tracking-[0.3px]">
          OFFLINE — make run-api
        </div>
      )}

      {/* Left pane: param-drift landscape (WebGPU viz preserved) */}
      <div className="stage-pane stage-pane-left">
        <CalibrationSurfaceLazy
          detuning={detuning}
          applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
          fidelityHistory={surfaceHistory}
          readinessScore={device?.readiness_score ?? 0.7}
          readoutFidelity={device?.readout_fidelity ?? null}
          className="h-full w-full"
        />
      </div>

      {/* Splitter 0: between left and middle */}
      <div
        className={`stage-splitter ${isDraggingSplit ? "dragging" : ""}`}
        data-splitter="0"
        onPointerDown={onSplitterPointerDown}
        onKeyDown={onSplitterKeyDown}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left and middle panes"
      >
        <div className="stage-splitter-rule" />
        <div className="stage-splitter-handle" />
      </div>

      {/* Middle pane: 3D cryo device (R3F preserved) */}
      <div className="stage-pane stage-pane-mid relative">
        <Device3DLazy
          device={device}
          detuning={detuning}
          applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
          className="h-full w-full"
        />

        {/* Fidelity climb HUD — live SSE points during Calibrate Q0, then the completed turn. */}
        {activeTurn && activeTurn.fidelityHistory.length > 0 && (
          <div className="absolute bottom-[38%] right-3 w-[280px] hud rounded px-2 py-1 text-[10px]">
            <div className="flex items-baseline justify-between mb-0.5 px-1">
              <div className="text-zinc-400">fidelity climb</div>
              <div className="instrument-mono" style={{color: 'var(--success)'}}>
                {latestFidelity?.toFixed(4)} / {threshold}
              </div>
            </div>
            <div className="h-[64px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeTurn.fidelityHistory.map(p => ({ step: p.iter, fidelity: p.fidelity }))} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                  <XAxis dataKey="step" tick={{ fontSize: 9, fill: "#52525b" }} />
                  <YAxis domain={[0.5, 1.0]} tick={{ fontSize: 9, fill: "#52525b" }} />
                  <ReferenceLine y={threshold} stroke="#FF9500" strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="fidelity" stroke="#007AFF" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Splitter 1: between middle and right (cryostat) */}
      <div
        className={`stage-splitter ${isDraggingSplit ? "dragging" : ""}`}
        data-splitter="1"
        onPointerDown={onSplitterPointerDown}
        onKeyDown={onSplitterKeyDown}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize middle and right panes"
      >
        <div className="stage-splitter-rule" />
        <div className="stage-splitter-handle" />
      </div>

      {/* Right pane: interactive cryostat plate with live HUD.
          Chips + spinners driven by real device/job state (same polls as toolbar/StageStateChip).
          Hover regions (flange/upper/still/mixing/package/cables/coil) show deeper frosted tooltip. */}
      <div className="stage-pane stage-pane-right">
        <CryostatPlate
          className="h-full w-full"
          device={device}
          detuning={detuning}
          stageMachine={stageMachine}
          hasActiveJob={hasActiveJob}
          activeJobStatus={activeJobStatus}
          lastTrace={lastTrace}
        />
      </div>

      {/* StageStateChip just above the bottom-third dock/blur band */}
      <div className="absolute right-3 z-30" style={{ bottom: 'calc(33vh + 10px)' }}>
        <StageStateChip state={stageMachine} />
      </div>
    </div>
  )
}
