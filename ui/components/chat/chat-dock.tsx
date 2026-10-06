"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Send, Square } from "lucide-react"
import {
  formatBubbleMeta,
  formatPillMath,
  hasMath,
  mathFromData,
  mathFromResults,
  type Turn,
} from "@/lib/turns"

export type SuggestedChip = {
  label: string
  goal: string
  kind: "calibrate" | "status" | "bell" | "diagnose" | "literacy"
}

export const SUGGESTED_CHIPS: SuggestedChip[] = [
  { label: "Calibrate Q0", goal: "Bring qubit 0 to ready", kind: "calibrate" },
  { label: "Q0 readiness", goal: "Report qubit 0 readiness and fidelity status", kind: "status" },
  { label: "Device status", goal: "Report device health and temperature status", kind: "status" },
  { label: "Bell pair", goal: "Run a Bell pair and report fidelity", kind: "bell" },
  { label: "Improve Bell", goal: "Run a precise Bell pair and report fidelity", kind: "bell" },
  { label: "Diagnose Q0", goal: "Check qubit 0 health and readout status", kind: "diagnose" },
  { label: "What does READY mean?", goal: "What does READY mean?", kind: "literacy" },
  { label: "Why do counts vary?", goal: "Why do counts vary?", kind: "literacy" },
]

export function ChatDock({
  turns,
  suggested = SUGGESTED_CHIPS,
  q0Ready,
  connected,
  submitting,
  goalInput,
  onGoalInputChange,
  hasRunning,
  onRunSuggested,
  onSubmitGoal,
  onStop,
  onOpenCommand,
}: {
  turns: Turn[]
  suggested?: SuggestedChip[]
  q0Ready: boolean
  connected: boolean
  submitting: boolean
  goalInput: string
  onGoalInputChange: (value: string) => void
  hasRunning: boolean
  onRunSuggested: (goal: string, opts?: { warnCalibrateFirst?: boolean }) => void
  onSubmitGoal: (raw: string) => void
  onStop: () => void
  onOpenCommand: () => void
}) {
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const scrollTranscript = useCallback(() => {
    const el = transcriptRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight + 400, behavior: "smooth" })
    }
  }, [])

  // Auto-scroll transcript whenever turns grow or the latest turn gains an agent message
  useEffect(() => {
    const t = setTimeout(() => scrollTranscript(), 40)
    return () => clearTimeout(t)
  }, [turns.length, turns[turns.length - 1]?.agentMessage, scrollTranscript])

  const literacyAsks = useMemo(
    () => suggested.filter((s) => s.kind === "literacy"),
    [suggested],
  )

  const hasCalibrated = turns.some(
    (t) => t.status === "succeeded" && t.traces.some((tr) => tr.tool === "calibrate_qubit"),
  )
  const hasCheckedStatus = turns.some((t) => t.traces.some((tr) => tr.tool === "get_device_state"))
  const hasBell = turns.some(
    (t) => t.status === "succeeded" && t.traces.some((tr) => tr.tool === "run_bell_pair"),
  )
  const nextChipLabel = !hasCalibrated
    ? "Calibrate Q0"
    : !hasCheckedStatus
      ? "Q0 readiness"
      : !hasBell
        ? "Bell pair"
        : "Improve Bell"

  return (
    /* Bottom-third chat dock (~33vh). NO backdrop-filter.
       pointer-events:none on dock; inner chat re-enables auto.
       Transcript/chips/composer sit above .dock-tint (z-index:1). Top ~2/3 panes stay sharp. */
    <div className="dock chat-dock">
      {/* Solid progressive tint behind chat (no blur). */}
      <div className="dock-tint" />
      <div className="constrained chat-constrained" style={{ pointerEvents: 'auto' }}>
        <div ref={transcriptRef} className="chat-transcript">
          {turns.length === 0 && (
            <div className="chat-empty">
              <p>Golden path: Calibrate Q0 → check READY → Bell pair. Chips below follow that order.</p>
              <p className="chat-empty-asks-label">Or ask why the numbers move:</p>
              <div className="chat-empty-asks">
                {literacyAsks.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onRunSuggested(s.goal)}
                    disabled={!connected || submitting}
                    className="preset-chip preset-chip-ask"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t) => {
            const turnMath = t.status !== "running" ? mathFromResults(t.results) : {}
            const meta = formatBubbleMeta(turnMath)
            const traces = t.traces || []
            const shown = traces.slice(-3)
            const isMeasureTurn =
              !!t.bellCounts || traces.some((tr) => tr.tool === "run_bell_pair")
            const traceStart = traces.length - shown.length
            return (
              <div key={t.id} className="chat-turn">
                <div className="bubble user">
                  {t.userMessage || t.goal}
                </div>
                <div className="bubble agent">
                  {t.status === "running" && "running…"}
                  {t.status === "failed" && (t.error || "failed")}
                  {t.status !== "running" && t.agentMessage && t.agentMessage}
                  {t.status !== "running" && !t.agentMessage && !t.error && "completed"}
                  {meta && (
                    <span className="bubble-meta instrument-mono">
                      {meta}
                    </span>
                  )}
                  {isMeasureTurn && t.status !== "running" && (
                    <span className="bubble-note">
                      One run is a sample from a distribution. Counts will move.
                    </span>
                  )}
                </div>
                {shown.length > 0 && (
                  <div className="chat-traces">
                    {shown.map((tr, i) => {
                      const result = t.results?.[traceStart + i]
                      const pillMath = mathFromData((result as { data?: unknown } | undefined)?.data)
                      const fallback = !hasMath(pillMath) && tr.tool === "run_bell_pair" ? turnMath : pillMath
                      return (
                        <span key={i} className="chat-trace-pill instrument-mono">
                          {tr.tool}{formatPillMath(fallback)}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="chat-chips" role="list" aria-label="Golden path chips">
          {suggested.map((s, i) => {
            const gated = s.kind === "bell" && !q0Ready
            const next = s.label === nextChipLabel
            const cls = [
              "preset-chip",
              next ? "preset-chip-next" : "",
              gated ? "preset-chip-gated" : "",
              s.kind === "literacy" ? "preset-chip-ask" : "",
            ].filter(Boolean).join(" ")
            const title = gated
              ? "Device not READY — calibrate Q0 first (or click to calibrate then Bell)"
              : s.kind === "literacy"
                ? "Live numbers plus a short observation note"
                : next
                  ? "Next step on the golden path"
                  : undefined
            return (
              <button
                key={i}
                type="button"
                role="listitem"
                onClick={() => onRunSuggested(s.goal, { warnCalibrateFirst: gated })}
                disabled={!connected || submitting}
                className={cls}
                title={title}
                aria-disabled={!connected || submitting}
                data-next={next ? "true" : undefined}
                data-gated={gated ? "true" : undefined}
              >
                {s.label}
              </button>
            )
          })}
        </div>

        <div className="chat-composer">
          <div className="composer">
            <input
              className="instrument-mono"
              placeholder="Type a goal… or pick above"
              value={goalInput}
              onChange={(e) => onGoalInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !submitting) void onSubmitGoal(goalInput) }}
              disabled={submitting || !connected}
            />
            {hasRunning ? (
              <Button variant="outline" size="sm" className="h-7 border-white/10" onClick={() => { void onStop() }}>
                <Square className="h-3 w-3 mr-1" /> stop
              </Button>
            ) : (
              <button onClick={() => { void onSubmitGoal(goalInput) }} disabled={submitting || !goalInput.trim() || !connected} className="rounded-full p-1.5 hover:bg-white/5 disabled:opacity-40" aria-label="send">
                <Send className="h-4 w-4" />
              </button>
            )}
            <button onClick={onOpenCommand} className="ml-1 text-[10px] px-1.5 py-0.5 rounded border hairline text-zinc-500 hover:text-zinc-300" title="⌘K">⌘K</button>
          </div>
        </div>
      </div>
    </div>
  )
}
