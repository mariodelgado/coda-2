"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type StageMachineKey =
  | "OFFLINE"
  | "DRIFT"
  | "CALIBRATING"
  | "RUNNING"
  | "READY"
  | "FAILED"

export interface StageMachineState {
  key: StageMachineKey
  label: string
  colorClass: string
  dotClass: string
  hint?: string
}

export interface StageStateChipProps {
  state: StageMachineState
  className?: string
}

const basePill =
  "pointer-events-none select-none inline-flex items-center gap-1.5 rounded-full border px-2 py-px font-mono text-[10px] " +
  "bg-black/78 border-white/10 text-zinc-200"

/**
 * Compact frosted mono state machine chip for the bottom-right of the stage.
 * iOS palette, no purple. Used to surface device + job lifecycle clearly.
 */
export function StageStateChip({ state, className }: StageStateChipProps) {
  return (
    <div
      className={cn(basePill, className)}
      title={state.hint ? `${state.label} · ${state.hint}` : state.label}
      aria-label={`stage ${state.label}`}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", state.dotClass)} />
      <span className="tracking-[0.5px]">{state.label}</span>
      {state.hint ? (
        <span className="ml-1 text-[9px] text-zinc-400 tabular-nums">{state.hint}</span>
      ) : null}
    </div>
  )
}

export function getStageMachineState(input: {
  connected: boolean
  isReady: boolean
  hasActiveJob: boolean
  activeJobStatus?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | null
  activeTurnRunning: boolean
  activeTurnGoal?: string
  lastJobFailedRecently: boolean
  lastTurnFailedRecently: boolean
  transitionedHint?: string
}): StageMachineState {
  const {
    connected,
    isReady,
    hasActiveJob,
    activeJobStatus,
    activeTurnRunning,
    activeTurnGoal,
    lastJobFailedRecently,
    lastTurnFailedRecently,
    transitionedHint,
  } = input

  if (!connected) {
    return {
      key: "OFFLINE",
      label: "OFFLINE",
      colorClass: "text-[#FF3B30]",
      dotClass: "bg-[#FF3B30]",
    }
  }

  const inFlight = hasActiveJob || activeTurnRunning
  if (inFlight) {
    const goal = (activeTurnGoal || "").toLowerCase()
    const isCal = (activeJobStatus ? /cal/i.test(activeJobStatus) : false) || goal.includes("calibrat") || goal.includes("bring qubit") || goal.includes("ready")
    const key: StageMachineKey = isCal ? "CALIBRATING" : "RUNNING"
    return {
      key,
      label: key,
      colorClass: "text-[#007AFF]",
      dotClass: "bg-[#007AFF]",
    }
  }

  if (lastJobFailedRecently || lastTurnFailedRecently) {
    return {
      key: "FAILED",
      label: "FAILED",
      colorClass: "text-[#FF3B30]",
      dotClass: "bg-[#FF3B30]",
    }
  }

  if (isReady) {
    return {
      key: "READY",
      label: "READY",
      colorClass: "text-[#34C759]",
      dotClass: "bg-[#34C759]",
      hint: transitionedHint,
    }
  }

  // Connected but not ready and nothing running → DRIFT / needs attention
  return {
    key: "DRIFT",
    label: "DRIFT",
    colorClass: "text-[#FF9500]",
    dotClass: "bg-[#FF9500]",
  }
}
