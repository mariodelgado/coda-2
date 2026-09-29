"use client"

import React from "react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import type { ToolTrace, JobRecord } from "@/lib/api"

export interface TimelineClip {
  id: string
  kind: "trace" | "job"
  ts: number
  label: string
  durationMs?: number
  status: "ok" | "err" | "running" | "queued" | "cancelled"
  summary?: string
  detail?: string
  raw?: unknown
}

export interface FilmstripProps {
  clips: TimelineClip[]
  activeClipId?: string | null
  playheadTs?: number | null
  onSelect: (clip: TimelineClip) => void
  onCancelJob?: (jobId: string) => void
}

const easeOut = [0.23, 1, 0.32, 1] as const

function statusColor(s: TimelineClip["status"]) {
  if (s === "ok") return "bg-emerald-500/90"
  if (s === "err") return "bg-red-500/90"
  if (s === "running") return "bg-amber-500/90"
  if (s === "queued") return "bg-zinc-500/70"
  return "bg-zinc-600/70"
}

export function Filmstrip({ clips, activeClipId, playheadTs, onSelect, onCancelJob }: FilmstripProps) {
  const sorted = React.useMemo(() => [...clips].sort((a, b) => a.ts - b.ts), [clips])

  const playheadLeft = React.useMemo(() => {
    if (!playheadTs || !sorted.length) return null
    const minTs = sorted[0].ts
    const maxTs = sorted[sorted.length - 1].ts
    if (maxTs <= minTs) return "0%"
    const pct = Math.max(0, Math.min(1, (playheadTs - minTs) / (maxTs - minTs)))
    return `${pct * 100}%`
  }, [playheadTs, sorted])

  if (!sorted.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-6 text-center text-xs text-zinc-500">
        Timeline empty — run a goal to see steps appear here.
      </div>
    )
  }

  return (
    <div className="relative rounded-xl border border-white/10 bg-zinc-950/60 p-2">
      <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] uppercase tracking-[1px] text-zinc-500">
        <div>Run timeline · clips are orchestrator steps or jobs</div>
        <div className="font-mono text-[10px] normal-case text-zinc-600">hover to preview · click to inspect</div>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="flex min-w-full items-end gap-2 px-1">
          {sorted.map((c, idx) => {
            const isActive = c.id === activeClipId
            const dur = c.durationMs != null ? (c.durationMs / 1000).toFixed(3) : undefined
            return (
              <motion.button
                key={c.id}
                onClick={() => onSelect(c)}
                initial={{ opacity: 0, y: 6, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.18, ease: easeOut, delay: Math.min(idx * 0.015, 0.18) }}
                className={[
                  "group relative flex h-[78px] w-[148px] shrink-0 flex-col justify-between overflow-hidden rounded-lg border px-2.5 py-2 text-left",
                  isActive ? "border-white/60 bg-zinc-900" : "border-white/10 bg-zinc-950 hover:border-white/30",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${statusColor(c.status)}`} />
                  <div className="truncate text-[11px] font-medium text-zinc-200">{c.label}</div>
                </div>

                <div className="space-y-0.5">
                  {c.summary && (
                    <div className="line-clamp-1 font-mono text-[10px] text-emerald-400/90">{c.summary}</div>
                  )}
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span className="tabular-nums">{new Date(c.ts).toLocaleTimeString()}</span>
                    {dur && <span className="tabular-nums text-zinc-400">{dur}s</span>}
                  </div>
                </div>

                <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
                  {c.kind === "job" && c.status === "running" && onCancelJob && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        const jid = c.id.replace(/^job-/, "")
                        onCancelJob(jid)
                      }}
                      className="rounded border border-white/10 px-1 py-px text-[9px] text-amber-400 hover:bg-white/5"
                    >
                      cancel
                    </span>
                  )}
                  <Badge variant="outline" className="border-white/10 px-1 py-0 text-[9px] text-zinc-500">
                    {c.kind}
                  </Badge>
                </div>

                {isActive && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/70" />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Playhead */}
        {playheadLeft != null && (
          <div
            className="pointer-events-none absolute top-[38px] z-10 h-[46px] w-px bg-white/80"
            style={{ left: `calc(${playheadLeft} + 8px)` }}
          />
        )}
      </div>

      <div className="px-1 text-[10px] text-zinc-600">
        Each clip is a real control-plane action (tool call or submitted job). Click to open details in the inspector.
      </div>
    </div>
  )
}

export function tracesToClips(traces: ToolTrace[]): TimelineClip[] {
  return traces.map((t, i) => ({
    id: `trace-${i}-${t.ts}`,
    kind: "trace",
    ts: t.ts * 1000,
    label: t.tool,
    durationMs: Math.round(t.latency_s * 1000),
    status: t.ok ? "ok" : "err",
    summary: t.summary || undefined,
    detail: JSON.stringify(t.args),
    raw: t,
  }))
}

export function jobsToClips(jobs: JobRecord[]): TimelineClip[] {
  return jobs.map((j) => {
    const created = j.created_at ? Date.parse(j.created_at) : Date.now()
    const counts =
      j.result && typeof j.result === "object" && "counts" in j.result
        ? (j.result as { counts: Record<string, number> }).counts
        : undefined
    const summary = counts ? Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") : undefined
    return {
      id: `job-${j.job_id}`,
      kind: "job",
      ts: created,
      label: j.job_type,
      durationMs: j.completed_at && j.created_at
        ? Math.max(0, Date.parse(j.completed_at) - Date.parse(j.created_at))
        : undefined,
      status:
        j.status === "succeeded"
          ? "ok"
          : j.status === "failed"
          ? "err"
          : j.status === "cancelled"
          ? "cancelled"
          : j.status === "queued"
          ? "queued"
          : "running",
      summary,
      detail: j.error || (j.result ? JSON.stringify(j.result).slice(0, 160) : undefined),
      raw: j,
    }
  })
}
