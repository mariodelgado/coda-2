"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { motion, AnimatePresence } from "motion/react"
import {
  Play, Square, Send, RefreshCw, Command as CommandIcon, ChevronRight, ChevronLeft,
} from "lucide-react"

import {
  api, setApiBase, getApiBase,
  type DeviceState, type JobRecord, type MetricsSnapshot, type ToolTrace,
} from "@/lib/api"
import { useControlPlaneStore } from "@/lib/store"
import { CommandPalette, defaultCommandIcons, type CommandAction } from "@/components/command/command-palette"
import { HeroViewer, type FidelityPoint } from "@/components/stage/hero-viewer"
import { Filmstrip, tracesToClips, jobsToClips, type TimelineClip } from "@/components/timeline/filmstrip"
import { RightInspector } from "@/components/inspector/right-inspector"

const easeOut = [0.23, 1, 0.32, 1] as const

export default function ConductorQPUControlPlane() {
  const setCommandOpen = useControlPlaneStore((s) => s.setCommandOpen)
  const setApiBaseLocal = useControlPlaneStore((s) => s.setApiBaseLocal)

  const [apiBase, setApiBaseState] = useState<string>(getApiBase())
  const [connected, setConnected] = useState(false)
  const [checking, setChecking] = useState(false)
  const [backendDown, setBackendDown] = useState(false)

  const [device, setDevice] = useState<DeviceState | null>(null)
  const [refreshingDevice, setRefreshingDevice] = useState(false)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)
  const [appliedParams, setAppliedParams] = useState<{
    frequency?: number; amplitude?: number; phase?: number; readout_error?: number
  } | null>(null)

  const [goalInput, setGoalInput] = useState("")
  const [submittingGoal, setSubmittingGoal] = useState(false)

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  const [fidelityHistory, setFidelityHistory] = useState<FidelityPoint[]>([])
  const [lastCalParams, setLastCalParams] = useState<Record<string, number> | null>(null)
  const [calThreshold, setCalThreshold] = useState(0.88)
  const [lastBellCounts, setLastBellCounts] = useState<Record<string, number> | null>(null)

  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)

  const [lastTraces, setLastTraces] = useState<ToolTrace[]>([])

  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [selectedClip, setSelectedClip] = useState<TimelineClip | null>(null)

  const [playheadTs, setPlayheadTs] = useState<number | null>(null)

  const logQuiet = useCallback((msg: string) => {
    // Sonner is the primary quiet feedback; we keep a tiny in-memory for debug if needed.
    void msg
  }, [])

  const updateApiBase = useCallback((base: string) => {
    const t = base.replace(/\/$/, "")
    setApiBaseState(t)
    setApiBase(t)
    setApiBaseLocal(t)
  }, [setApiBaseLocal])

  const checkConnection = useCallback(async (base?: string) => {
    const target = (base || apiBase).replace(/\/$/, "")
    if (base) updateApiBase(target)
    setChecking(true)
    try {
      const res = await fetch(`${target}/health`, { cache: "no-store" })
      if (!res.ok) throw new Error("not ok")
      const data = (await res.json()) as { status?: string }
      const ok = data?.status === "ok"
      setConnected(ok)
      setBackendDown(!ok)
      return ok
    } catch {
      setConnected(false)
      setBackendDown(true)
      toast.error("Backend down", { description: `Cannot reach ${target}` })
      return false
    } finally {
      setChecking(false)
    }
  }, [apiBase, updateApiBase])

  const refreshDevice = useCallback(async () => {
    setRefreshingDevice(true)
    try {
      const d = await api.deviceState()
      setDevice(d)
      try {
        const dt = await api.getDetuning(0)
        setDetuning(dt.detuning)
        setAppliedParams(dt.applied)
      } catch { /* optional */ }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "device fetch failed"
      setBackendDown(true)
      toast.error("Backend down", { description: msg })
    } finally {
      setRefreshingDevice(false)
    }
  }, [])

  const refreshMetrics = useCallback(async () => {
    try {
      const m = await api.getMetrics()
      setMetrics(m)
    } catch { /* non-fatal */ }
  }, [])

  const loadRecentJobs = useCallback(async () => {
    try {
      const { jobs: list } = await api.listJobs(80)
      const map: Record<string, JobRecord> = {}
      list.forEach((j) => { map[j.job_id] = j })
      setJobs(map)
    } catch { /* non-fatal */ }
  }, [])

  const upsertJob = useCallback((job: JobRecord) => {
    setJobs((prev) => ({ ...prev, [job.job_id]: job }))
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      const es = eventSourcesRef.current[job.job_id]
      if (es) { es.close(); delete eventSourcesRef.current[job.job_id] }
      if (job.status === "failed") toast.error("Job failed", { description: job.error || job.job_id })
      if (job.status === "succeeded") toast.success("Job succeeded", { description: job.job_id })
    }
  }, [])

  const pollJobOnce = useCallback(async (jobId: string) => {
    try {
      const j = await api.getJob(jobId)
      upsertJob(j)
      return j
    } catch {
      return null
    }
  }, [upsertJob])

  const startJobSSE = useCallback((jobId: string) => {
    const existing = eventSourcesRef.current[jobId]
    if (existing) existing.close()
    const url = api.sseJobUrl(jobId)
    try {
      const es = new EventSource(url)
      eventSourcesRef.current[jobId] = es
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { job_id?: string; status?: JobRecord["status"]; result?: Record<string, unknown> | null; metrics?: Record<string, unknown> | null; error?: string | null }
          if (data?.job_id) {
            upsertJob({
              job_id: data.job_id,
              status: data.status || "running",
              job_type: "circuit",
              result: data.result || null,
              metrics: data.metrics || null,
              error: data.error || null,
            })
          }
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        es.close()
        delete eventSourcesRef.current[jobId]
        const iv = setInterval(async () => {
          const j = await pollJobOnce(jobId)
          if (j && ["succeeded", "failed", "cancelled"].includes(j.status)) clearInterval(iv)
        }, 900)
      }
    } catch {
      const iv = setInterval(async () => {
        const j = await pollJobOnce(jobId)
        if (j && ["succeeded", "failed", "cancelled"].includes(j.status)) clearInterval(iv)
      }, 800)
    }
  }, [upsertJob, pollJobOnce])

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const j = await api.getJob(jobId)
      if (j.status === "running" || j.status === "queued") {
        await api.postGoal(`cancel ${jobId}`).catch(() => {})
      }
      await pollJobOnce(jobId)
      await loadRecentJobs()
      toast.message("Cancel requested", { description: jobId })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error("Cancel failed", { description: msg })
    }
  }, [pollJobOnce, loadRecentJobs])

  const loadRecentTraces = useCallback(async () => {
    try {
      const { traces } = await api.getTraces()
      if (traces?.length) setLastTraces(traces.slice(-40))
    } catch { /* optional */ }
  }, [])

  const submitGoal = useCallback(async (raw: string) => {
    const goal = raw.trim()
    if (!goal) return
    setSubmittingGoal(true)
    setFidelityHistory([])
    setLastBellCounts(null)
    setLastCalParams(null)
    setSelectedClip(null)

    try {
      const resp = await api.postGoal(goal)
      const traces = resp.traces || []
      if (traces.length) setLastTraces(traces)

      // Extract calibration history if present (from calibrate_qubit tool result)
      let calHistory: FidelityPoint[] = []
      let calParams: Record<string, number> | null = null
      let bellCounts: Record<string, number> | null = null
      let threshold = 0.88

      for (const r of resp.results || []) {
        const data = (r.data || {}) as Record<string, unknown>
        if (Array.isArray(data.history)) {
          calHistory = (data.history as Array<[number, number]>).map(([it, f]) => ({ iter: it, fidelity: f }))
          if (typeof data.threshold === "number") threshold = data.threshold
          if (data.params && typeof data.params === "object") calParams = data.params as Record<string, number>
        }
        if (data && typeof data === "object" && "counts" in data && data.counts && typeof data.counts === "object") {
          bellCounts = data.counts as Record<string, number>
        }
      }

      if (calHistory.length) {
        setFidelityHistory(calHistory)
        setCalThreshold(threshold)
        if (calParams) setLastCalParams(calParams)
      }
      if (bellCounts) setLastBellCounts(bellCounts)

      await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs(), loadRecentTraces()])

      // If a job was created by the goal (Bell path), wire it as active for SSE
      const maybeJobId = (resp.results || []).find((r) => {
        const d = (r.data || {}) as Record<string, unknown>
        return typeof d.job_id === "string"
      })?.data?.job_id as string | undefined
      if (maybeJobId) {
        setActiveJobId(maybeJobId)
        startJobSSE(maybeJobId)
      }

      // Auto-open inspector with the last meaningful clip if user hasn't opened yet
      if (!inspectorOpen) {
        // will be triggered by selection below
      }

      if (calHistory.length) {
        const last = calHistory[calHistory.length - 1]
        if (last.fidelity >= threshold) toast.success("Calibration reached threshold")
        else toast.message("Calibration complete", { description: `final ${last.fidelity.toFixed(4)}` })
      } else if (bellCounts) {
        toast.success("Bell complete")
      } else {
        toast.success("Done")
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "goal failed"
      setBackendDown(true)
      toast.error("Backend down / goal failed", { description: msg })
    } finally {
      setSubmittingGoal(false)
      setGoalInput("")
    }
  }, [refreshDevice, refreshMetrics, loadRecentJobs, loadRecentTraces, startJobSSE, inspectorOpen])

  const runCalibrate = useCallback(() => submitGoal("Bring qubit 0 to ready"), [submitGoal])
  const runBell = useCallback(() => submitGoal("Run a Bell pair and report fidelity"), [submitGoal])

  // Periodic refresh while connected
  useEffect(() => {
    void checkConnection().then((ok) => {
      if (ok) {
        void refreshDevice()
        void refreshMetrics()
        void loadRecentJobs()
        void loadRecentTraces()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (connected) {
        void refreshDevice()
        void refreshMetrics()
        void loadRecentJobs()
      }
    }, 7000)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics, loadRecentJobs])

  // Poll active job
  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j || j.status !== "running") return
    const iv = setInterval(() => { void pollJobOnce(activeJobId) }, 850)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  // Build unified timeline clips (traces + jobs)
  const timelineClips: TimelineClip[] = useMemo(() => {
    const t = tracesToClips(lastTraces)
    const j = jobsToClips(Object.values(jobs))
    // Merge and de-dup by id; prefer jobs for same logical thing when present
    const byId = new Map<string, TimelineClip>()
    ;[...t, ...j].forEach((c) => byId.set(c.id, c))
    return Array.from(byId.values()).sort((a, b) => a.ts - b.ts)
  }, [lastTraces, jobs])

  const currentMetrics = useMemo(() => {
    const cal = (metrics?.orchestrator?.calibration || metrics?.calibration || {}) as Record<string, number>
    return {
      attempts: Number(cal.attempts ?? 0),
      successes: Number(cal.successes ?? 0),
      successRate: Number(cal.calibration_success_rate ?? 0),
      timeToCal: Number(cal.avg_time_to_calibrated_s ?? 0),
      interfaceLatency: Number(cal.avg_interface_latency_s ?? 0),
    }
  }, [metrics])

  const hasActiveRunningJob = useMemo(() => {
    return Object.values(jobs).some((j) => j.status === "running" || j.status === "queued")
  }, [jobs])

  const stopActive = useCallback(async () => {
    // Cancel the most recent running/queued job if any
    const running = Object.values(jobs)
      .filter((j) => j.status === "running" || j.status === "queued")
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    if (running.length) {
      await cancelJob(running[0].job_id)
    } else {
      toast.message("Nothing running to stop")
    }
  }, [jobs, cancelJob])

  const onSelectClip = useCallback((clip: TimelineClip) => {
    setSelectedClip(clip)
    setInspectorOpen(true)
    // Scrub playhead to this clip's time
    setPlayheadTs(clip.ts)
    // If it's a job clip and running, make it the active for polling
    if (clip.kind === "job") {
      const jid = clip.id.replace(/^job-/, "")
      setActiveJobId(jid)
    }
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedClip(null)
  }, [])

  const jobListForInspector = useMemo(() => Object.values(jobs), [jobs])

  const commandActions: CommandAction[] = useMemo(() => [
    {
      id: "cal-q0",
      label: "Bring qubit 0 to ready",
      hint: "calibrate",
      group: "Goals",
      icon: defaultCommandIcons.calibrate,
      run: () => submitGoal("Bring qubit 0 to ready"),
    },
    {
      id: "bell",
      label: "Run a Bell pair and report fidelity",
      hint: "circuit",
      group: "Goals",
      icon: defaultCommandIcons.bell,
      run: () => submitGoal("Run a Bell pair and report fidelity"),
    },
    {
      id: "quick-cal",
      label: "Calibrate Q0 → 0.88",
      group: "Quick",
      icon: defaultCommandIcons.calibrate,
      run: () => runCalibrate(),
    },
    {
      id: "quick-bell",
      label: "Bell 1024",
      group: "Quick",
      icon: defaultCommandIcons.bell,
      run: () => runBell(),
    },
    {
      id: "refresh",
      label: "Refresh device + metrics",
      group: "Quick",
      icon: defaultCommandIcons.refresh,
      run: async () => { await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs(), loadRecentTraces()]) },
    },
    {
      id: "force-fail",
      label: "Force fail next calibration",
      hint: "demo",
      group: "Demo",
      icon: defaultCommandIcons.fail,
      run: async () => {
        try {
          await api.demoForceFailNextCal()
          toast.message("Next calibration will fail to reach threshold")
        } catch { toast.error("demo endpoint unavailable") }
      },
    },
    {
      id: "long-job",
      label: "Start long job (cancel me)",
      hint: "demo",
      group: "Demo",
      icon: defaultCommandIcons.long,
      run: async () => {
        try {
          const r = await api.demoStartLongJob()
          const jid = r.job_id
          upsertJob({ job_id: jid, status: "running", job_type: "diagnostic", result: null, metrics: null })
          setActiveJobId(jid)
          startJobSSE(jid)
          toast.message("Long job running — use Stop or timeline cancel")
        } catch { toast.error("demo long job unavailable") }
      },
    },
  ], [submitGoal, runCalibrate, runBell, refreshDevice, refreshMetrics, loadRecentJobs, loadRecentTraces, upsertJob, startJobSSE])

  const lastJobId = useMemo(() => {
    const arr = Object.values(jobs).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    return arr[0]?.job_id || null
  }, [jobs])

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-200 selection:bg-white/20">
      <CommandPalette actions={commandActions} disabled={!connected && backendDown} />

      {/* Minimal top bar — Apple-like */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0b]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0a0a0b]/80">
        <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-emerald-500" />
            <div className="font-semibold tracking-[-0.4px]">Conductor</div>
            <div className="text-[10px] text-zinc-500">QPU</div>
            <Badge variant={connected ? "default" : "destructive"} className="ml-1 px-1.5 py-0 text-[10px]">
              {connected ? "LIVE" : "OFFLINE"}
            </Badge>
          </div>

          {/* Primary goal field */}
          <div className="ml-2 flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Input
                className="h-8 border-white/10 bg-zinc-950 pl-3 pr-9 font-mono text-sm placeholder:text-zinc-600"
                placeholder='Type a goal, e.g. "Bring qubit 0 to ready"'
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !submittingGoal) void submitGoal(goalInput) }}
                disabled={submittingGoal || !connected}
              />
              <button
                onClick={() => { void submitGoal(goalInput) }}
                disabled={submittingGoal || !goalInput.trim() || !connected}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-white/10 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            <Button
              onClick={() => { void submitGoal(goalInput) }}
              disabled={submittingGoal || !goalInput.trim() || !connected}
              className="h-8 gap-1.5 px-3"
            >
              <Play className="h-3.5 w-3.5" /> Run
            </Button>

            <Button
              variant="outline"
              onClick={() => { void stopActive() }}
              disabled={!hasActiveRunningJob && !submittingGoal}
              className="h-8 gap-1.5 border-white/10 px-3"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCommandOpen(true)}
              title="Commands (⌘K)"
            >
              <CommandIcon className="h-4 w-4" />
            </Button>

            <div className="hidden items-center gap-2 pl-1 text-xs text-zinc-500 md:flex">
              <span>API</span>
              <Input
                className="h-7 w-[210px] border-white/10 bg-zinc-950 font-mono text-[11px]"
                value={apiBase}
                onChange={(e) => updateApiBase(e.target.value)}
                onBlur={() => { void checkConnection(apiBase) }}
                onKeyDown={(e) => { if (e.key === "Enter") void checkConnection(apiBase) }}
              />
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => { void checkConnection() }} disabled={checking}>
                <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <button
              className="rounded border border-white/10 px-1.5 py-0.5 hover:bg-white/5"
              onClick={() => { void refreshDevice(); void refreshMetrics(); void loadRecentJobs(); void loadRecentTraces() }}
            >
              Refresh
            </button>
            <span className="hidden lg:inline">No LLM keys · real traces</span>
          </div>
        </div>

        {backendDown && (
          <div className="border-t border-red-900/40 bg-red-950/50">
            <div className="mx-auto max-w-[1200px] px-4 py-1 text-[11px] text-red-300">
              Cannot reach backend. Start with <span className="font-mono">make run-api</span>.
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-4">
        {/* Center stage + right inspector */}
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="text-sm font-medium tracking-[-0.2px] text-zinc-400">Center stage</div>
              <button
                onClick={() => setInspectorOpen((v) => !v)}
                className="flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-white/5"
              >
                {inspectorOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                {inspectorOpen ? "Hide inspector" : "Inspect device & drift"}
              </button>
            </div>

            <div className="min-h-[300px]">
              <HeroViewer
                fidelityHistory={fidelityHistory}
                threshold={calThreshold}
                lastParams={lastCalParams}
                jobOutcome={lastBellCounts ? { type: "bell", counts: lastBellCounts } : null}
                onRequestInspect={() => setInspectorOpen(true)}
              />
            </div>

            {/* Quick actions under stage — calm */}
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
              <Button variant="secondary" size="sm" onClick={() => runCalibrate()} disabled={!connected || submittingGoal}>
                Calibrate Q0
              </Button>
              <Button variant="secondary" size="sm" onClick={() => runBell()} disabled={!connected || submittingGoal}>
                Bell 1024
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { void refreshDevice() }} disabled={refreshingDevice}>
                Device
              </Button>
              <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-500">
                {lastJobId && <span className="font-mono">last job {lastJobId.slice(0, 8)}…</span>}
              </div>
            </div>
          </div>

          {/* Right inspector (on demand) */}
          <RightInspector
            open={inspectorOpen}
            onOpenChange={setInspectorOpen}
            device={device}
            detuning={detuning}
            applied={appliedParams || lastCalParams}
            metrics={metrics}
            selectedClip={selectedClip ? { id: selectedClip.id, kind: selectedClip.kind, label: selectedClip.label, detail: selectedClip.detail, raw: selectedClip.raw } : null}
            onClearSelection={clearSelection}
          />
        </div>

        {/* Bottom timeline — iMovie filmstrip */}
        <div className="mt-5">
          <div className="mb-1.5 px-1 text-[11px] uppercase tracking-[1px] text-zinc-500">Timeline</div>
          <Filmstrip
            clips={timelineClips}
            activeClipId={selectedClip?.id || null}
            playheadTs={playheadTs}
            onSelect={onSelectClip}
            onCancelJob={(jid) => { void cancelJob(jid) }}
          />
        </div>

        {/* Founder demo guardrails — quiet, at the bottom */}
        <div className="mt-4 rounded-lg border border-amber-900/30 bg-amber-950/10 px-3 py-2 text-[10px] text-amber-400/90">
          <span className="mr-2 font-medium tracking-widest">FOUNDER GUARDRAILS</span>
          <button
            className="mr-3 underline decoration-amber-900/60 hover:decoration-amber-400"
            onClick={async () => {
              try { await api.demoForceFailNextCal(); toast.message("Next cal will fail") } catch { toast.error("unavailable") }
            }}
          >
            Force fail next cal
          </button>
          <button
            className="underline decoration-amber-900/60 hover:decoration-amber-400"
            onClick={async () => {
              try {
                const r = await api.demoStartLongJob()
                upsertJob({ job_id: r.job_id, status: "running", job_type: "diagnostic", result: null, metrics: null })
                setActiveJobId(r.job_id)
                startJobSSE(r.job_id)
                toast.message("Long job started")
              } catch { toast.error("unavailable") }
            }}
          >
            Start long job (cancel me)
          </button>
          <span className="ml-3 text-amber-400/60">These only affect the current backend session.</span>
        </div>

        <div className="mt-6 text-[10px] text-zinc-600">
          Dark, calm, real traces. Stage shows the outcome; timeline is the narrative spine. Inspector for device, drift surface, and clip details.
        </div>
      </div>
    </div>
  )
}
