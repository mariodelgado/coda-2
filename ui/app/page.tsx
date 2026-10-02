"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { motion, AnimatePresence } from "motion/react"
import { Send, Square, Command as CommandIcon } from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts"

import {
  api, setApiBase, getApiBase,
  type DeviceState, type JobRecord, type ToolTrace,
} from "@/lib/api"
import { useControlPlaneStore } from "@/lib/store"
import { CommandPalette, defaultCommandIcons, type CommandAction } from "@/components/command/command-palette"
import { CalibrationSurfaceLazy } from "@/components/viz/calibration-surface-lazy"
import { Device3DLazy } from "@/components/viz/device-3d-lazy"
import { StageStateChip, getStageMachineState, type StageMachineState } from "@/components/stage/stage-state-chip"

const easeOut = [0.23, 1, 0.32, 1] as const

interface FidelityPoint { iter: number; fidelity: number }

interface Turn {
  id: string
  goal: string
  userMessage?: string
  agentMessage?: string
  status: "running" | "succeeded" | "failed"
  traces: ToolTrace[]
  results: any[]
  fidelityHistory: FidelityPoint[]
  calThreshold: number
  lastCalParams?: Record<string, number> | null
  bellCounts?: Record<string, number> | null
  error?: string
  createdAt: number
}

export default function ConductorQPUInstrument() {
  const setCommandOpen = useControlPlaneStore((s) => s.setCommandOpen)

  const [apiBase, setApiBaseState] = useState<string>(getApiBase())
  const [connected, setConnected] = useState(false)
  const [backendDown, setBackendDown] = useState(false)

  const [device, setDevice] = useState<DeviceState | null>(null)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)
  const [appliedParams, setAppliedParams] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)
  const [stageTab, setStageTab] = useState<"drift" | "device">("drift")

  const [turns, setTurns] = useState<Turn[]>([])
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  // Transcript auto-scroll container
  const transcriptRef = useRef<HTMLDivElement | null>(null)
  const scrollTranscript = useCallback(() => {
    const el = transcriptRef.current
    if (el) {
      el.scrollTo({ top: el.scrollHeight + 400, behavior: "smooth" })
    }
  }, [])

  const updateApiBase = useCallback((base: string) => {
    const t = base.replace(/\/$/, "")
    setApiBaseState(t)
    setApiBase(t)
  }, [])

  const checkConnection = useCallback(async (base?: string) => {
    const target = (base || apiBase).replace(/\/$/, "")
    if (base) updateApiBase(target)
    try {
      const res = await fetch(`${target}/health`, { cache: "no-store" })
      const ok = res.ok && (await res.json())?.status === "ok"
      setConnected(ok)
      setBackendDown(!ok)
      return ok
    } catch {
      setConnected(false)
      setBackendDown(true)
      return false
    }
  }, [apiBase, updateApiBase])

  const refreshDevice = useCallback(async () => {
    try {
      const d = await api.deviceState()
      setDevice(d)
      try {
        const dt = await api.getDetuning(0)
        setDetuning(dt.detuning)
        setAppliedParams(dt.applied)
      } catch {}
    } catch {}
  }, [])

  const refreshMetrics = useCallback(async () => {
    try { setMetrics(await api.getMetrics()) } catch {}
  }, [])

  const loadRecentJobs = useCallback(async () => {
    try {
      const { jobs: list } = await api.listJobs(40)
      const map: Record<string, JobRecord> = {}
      list.forEach(j => { map[j.job_id] = j })
      setJobs(map)
    } catch {}
  }, [])

  const upsertJob = useCallback((job: JobRecord) => {
    setJobs(prev => ({ ...prev, [job.job_id]: job }))
    if (["succeeded", "failed", "cancelled"].includes(job.status)) {
      const es = eventSourcesRef.current[job.job_id]
      if (es) { es.close(); delete eventSourcesRef.current[job.job_id] }
    }
  }, [])

  const pollJobOnce = useCallback(async (jobId: string) => {
    try { const j = await api.getJob(jobId); upsertJob(j); return j } catch { return null }
  }, [upsertJob])

  const startJobSSE = useCallback((jobId: string) => {
    if (eventSourcesRef.current[jobId]) return
    try {
      const es = new EventSource(api.sseJobUrl(jobId))
      eventSourcesRef.current[jobId] = es
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data?.job_id) upsertJob({ job_id: data.job_id, status: data.status || "running", job_type: "circuit", result: data.result || null, metrics: data.metrics || null } as any)
        } catch {}
      }
      es.onerror = () => { es.close(); delete eventSourcesRef.current[jobId] }
    } catch {}
  }, [upsertJob])

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await api.postGoal(`cancel ${jobId}`).catch(() => {})
      await pollJobOnce(jobId)
      toast.message("Cancel requested")
    } catch (e: any) {
      toast.error("Cancel failed", { description: String(e?.message || e) })
    }
  }, [pollJobOnce])

  const extractFromResults = (results: any[]) => {
    let history: FidelityPoint[] = []
    let params: Record<string, number> | null = null
    let counts: Record<string, number> | null = null
    let threshold = 0.88
    for (const r of results || []) {
      const d = (r?.data || {}) as any
      if (Array.isArray(d.history)) {
        history = d.history.map(([it, f]: [number, number]) => ({ iter: it, fidelity: f }))
        if (typeof d.threshold === "number") threshold = d.threshold
        if (d.params && typeof d.params === "object") params = d.params
      }
      if (d && typeof d === "object" && d.counts) counts = d.counts as Record<string, number>
    }
    return { history, params, counts, threshold }
  }

  const submitGoal = useCallback(async (raw: string) => {
    const goal = raw.trim()
    if (!goal) return

    const turnId = (globalThis.crypto?.randomUUID?.() || `t_${Date.now()}`) as string
    // Immediately append the user turn so the transcript feels responsive
    const newTurn: Turn = {
      id: turnId,
      goal,
      userMessage: goal,
      agentMessage: undefined,
      status: "running",
      traces: [],
      results: [],
      fidelityHistory: [],
      calThreshold: 0.88,
      lastCalParams: null,
      bellCounts: null,
      createdAt: Date.now(),
    }
    setTurns(prev => [...prev, newTurn])
    setSelectedTurnId(turnId)
    setSubmitting(true)
    setGoalInput("")

    try {
      const resp = await api.postGoal(goal)
      const traces = resp.traces || []
      const { history, params, counts, threshold } = extractFromResults(resp.results || [])
      const agentMsg = (resp as any).agent_message || (resp as any).agentMessage || undefined

      setTurns(prev => prev.map(t => {
        if (t.id !== turnId) return t
        return {
          ...t,
          userMessage: (resp as any).user_message || t.userMessage || goal,
          agentMessage: agentMsg,
          status: "succeeded",
          traces,
          results: resp.results || [],
          fidelityHistory: history,
          calThreshold: threshold,
          lastCalParams: params,
          bellCounts: counts,
        }
      }))

      const maybe = (resp.results || []).find((r: any) => typeof r?.data?.job_id === "string")
      const jobId: string | undefined = (maybe?.data as any)?.job_id
      if (jobId) {
        setActiveJobId(jobId)
        startJobSSE(jobId)
      }

      await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs()])

      const lastF = history.length ? history[history.length - 1].fidelity : null
      if (lastF != null) {
        if (lastF >= threshold) toast.success("Reached threshold")
        else toast.message(`Completed • ${lastF.toFixed(4)}`)
      } else if (counts) {
        toast.success("Bell complete")
      } else {
        toast.success("Done")
      }
    } catch (e: any) {
      const msg = e?.message || "failed"
      setTurns(prev => prev.map(t => t.id === turnId ? { ...t, status: "failed", error: msg } : t))
      setBackendDown(true)
      toast.error("Failed", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }, [refreshDevice, refreshMetrics, loadRecentJobs, startJobSSE])

  const runSuggested = useCallback((goal: string) => {
    void submitGoal(goal)
  }, [submitGoal])

  const stopActive = useCallback(async () => {
    const runningJob = Object.values(jobs).find(j => j.status === "running" || j.status === "queued")
    if (runningJob) await cancelJob(runningJob.job_id)
    setTurns(prev => prev.map(t => t.status === "running" ? { ...t, status: "failed", error: "cancelled" } : t))
  }, [jobs, cancelJob])

  // Bootstrap + polling
  // Retry health a few times on mount to ride out brief startup races or Chromium private-network preflight timing.
  useEffect(() => {
    let cancelled = false
    const maxAttempts = 4
    const delays = [0, 250, 500, 750]

    const attempt = async (i: number): Promise<boolean> => {
      if (cancelled) return false
      const ok = await checkConnection()
      if (ok) {
        if (!cancelled) {
          void refreshDevice()
          void refreshMetrics()
        }
        return true
      }
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delays[Math.min(i, delays.length - 1)]))
        return attempt(i + 1)
      }
      return false
    }

    void attempt(0)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (connected) {
        void refreshDevice()
        void refreshMetrics()
      }
    }, 6500)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics])

  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j || j.status !== "running") return
    const iv = setInterval(() => { void pollJobOnce(activeJobId) }, 850)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  // Auto-scroll transcript whenever turns grow or the latest turn gains an agent message
  useEffect(() => {
    // slight delay so DOM has painted the new bubble
    const t = setTimeout(() => scrollTranscript(), 40)
    return () => clearTimeout(t)
  }, [turns.length, turns[turns.length - 1]?.agentMessage, scrollTranscript])

  const hasRunning = useMemo(() =>
    turns.some(t => t.status === "running") || Object.values(jobs).some(j => j.status === "running"),
  [turns, jobs])

  const suggested = useMemo(() => [
    { label: "Calibrate Q0", goal: "Bring qubit 0 to ready" },
    { label: "Bell pair", goal: "Run a Bell pair and report fidelity" },
  ], [])

  // Live readouts for top bar (instrument)
  const q0Fid = device?.readout_fidelity?.["0"] ?? device?.readout_fidelity?.[0 as any] ?? null
  const q0Temp = device?.temperatures_mk?.["0"] ?? device?.temperatures_mk?.[0 as any] ?? null
  const isReady = !!device?.is_ready
  const readiness = device ? device.readiness_score.toFixed(3) : null

  const activeTurn = useMemo(() => {
    if (selectedTurnId) return turns.find(t => t.id === selectedTurnId) || null
    return [...turns].reverse().find(t => t.fidelityHistory.length) || turns[turns.length - 1] || null
  }, [turns, selectedTurnId])

  const latestFidelity = activeTurn?.fidelityHistory?.length
    ? activeTurn.fidelityHistory[activeTurn.fidelityHistory.length - 1].fidelity
    : (q0Fid != null ? q0Fid : null)

  const threshold = activeTurn?.calThreshold ?? 0.88
  const surfaceHistory = activeTurn?.fidelityHistory ?? []

  const commandActions: CommandAction[] = useMemo(() => [
    { id: "g1", label: "Bring qubit 0 to ready", hint: "calibrate", group: "Goals", icon: defaultCommandIcons.calibrate, run: () => submitGoal("Bring qubit 0 to ready") },
    { id: "g2", label: "Run a Bell pair and report fidelity", hint: "circuit", group: "Goals", icon: defaultCommandIcons.bell, run: () => submitGoal("Run a Bell pair and report fidelity") },
    { id: "q1", label: "Refresh device", group: "Quick", icon: defaultCommandIcons.refresh, run: async () => { await Promise.all([refreshDevice(), refreshMetrics()]) } },
    { id: "d1", label: "Force fail next calibration", hint: "demo", group: "Demo", icon: defaultCommandIcons.fail, run: async () => { try { await api.demoForceFailNextCal(); toast.message("Next cal will fail") } catch { toast.error("unavailable") } } },
    { id: "d2", label: "Start long job (cancel me)", hint: "demo", group: "Demo", icon: defaultCommandIcons.long, run: async () => {
      try {
        const r = await api.demoStartLongJob()
        const tId = (globalThis.crypto?.randomUUID?.() || `t_${Date.now()}`) as string
        const nt: Turn = { id: tId, goal: "Start long job (demo)", status: "running", traces: [], results: [], fidelityHistory: [], calThreshold: 0.88, createdAt: Date.now() }
        setTurns(p => [...p, nt]); setSelectedTurnId(tId)
        setActiveJobId(r.job_id); startJobSSE(r.job_id)
        toast.message("Long job running")
      } catch { toast.error("unavailable") }
    }},
  ], [submitGoal, refreshDevice, refreshMetrics, startJobSSE])

  const selectedTurn = useMemo(() => turns.find(t => t.id === selectedTurnId) || null, [turns, selectedTurnId])

  const ledger = useMemo(() => [...turns].reverse().slice(0, 10), [turns])

  // Active job + turn status for state machine
  const activeJob = activeJobId ? jobs[activeJobId] : null
  const hasActiveJob = !!activeJob && (activeJob.status === "queued" || activeJob.status === "running")
  const activeJobStatus = activeJob?.status ?? null
  const activeTurnRunning = !!activeTurn && activeTurn.status === "running"

  // Recent failure detection (for brief FAILED state)
  const lastJobFailedRecently = React.useMemo(() => {
    if (activeJob && activeJob.status === "failed") return true
    const recent = Object.values(jobs).find(j => j.status === "failed")
    return !!recent
  }, [jobs, activeJob])

  const lastTurnFailedRecently = React.useMemo(() => {
    const recentFailed = turns.slice(-3).some(t => t.status === "failed")
    return recentFailed
  }, [turns])

  // Lightweight transition hint e.g. "DRIFT → READY" after a successful cal when device reports ready
  const transitionedHint = React.useMemo(() => {
    if (!connected || !isReady) return undefined
    const lastOk = [...turns].reverse().find(t => t.status === "succeeded" && t.fidelityHistory.length > 0)
    if (!lastOk) return undefined
    // Only surface a hint for a short window after the successful turn (use recency)
    const ageMs = Date.now() - (lastOk.createdAt || 0)
    if (ageMs > 45000) return undefined
    // If we were previously not-ready (we don't track prior, so show a compact "CAL → READY" style if cal-like)
    return "CAL → READY"
  }, [turns, isReady, connected])

  // Derive single stage machine state for the bottom-right chip (no scattered conditionals in JSX)
  const activeTurnGoal = activeTurn?.goal || ""
  const stageMachine: StageMachineState = React.useMemo(
    () =>
      getStageMachineState({
        connected,
        isReady,
        hasActiveJob,
        activeJobStatus: activeJobStatus as any,
        activeTurnRunning,
        activeTurnGoal,
        lastJobFailedRecently,
        lastTurnFailedRecently,
        transitionedHint,
      }),
    [
      connected,
      isReady,
      hasActiveJob,
      activeJobStatus,
      activeTurnRunning,
      activeTurnGoal,
      lastJobFailedRecently,
      lastTurnFailedRecently,
      transitionedHint,
    ]
  )

  const lastSummary = (t: Turn) => {
    if (t.error) return t.error
    if (t.bellCounts) return Object.entries(t.bellCounts).map(([k,v]) => `${k}=${v}`).join(" ")
    if (t.fidelityHistory.length) {
      const f = t.fidelityHistory[t.fidelityHistory.length-1].fidelity
      return `f=${f.toFixed(4)}`
    }
    return t.traces[t.traces.length-1]?.summary || ""
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#000000] text-white flex flex-col">
      <CommandPalette actions={commandActions} disabled={!connected} />

      {/* Frosted macOS / iMovie toolbar */}
      <div className="toolbar relative">
        {/* Traffic lights */}
        <div className="traffic">
          <div className="traffic-dot close" />
          <div className="traffic-dot min" />
          <div className="traffic-dot max" />
        </div>

        <div className="flex items-center gap-2 font-medium pl-4">
          <span className="font-sans tracking-[-0.2px]">Conductor QPU</span>
          <span
            className={`px-1.5 py-px rounded text-[10px] text-black font-mono tracking-[0.5px] ${connected ? "" : "opacity-60"}`}
            style={{ background: connected ? "var(--success)" : "#6b7280" }}
            title={connected ? "Connected to control plane" : "Not connected to control plane"}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <span className={isReady ? "text-success" : "text-applied"}>
            {isReady ? "READY" : "CAL NEEDED"}
          </span>
          {readiness && <span className="text-zinc-500">· {readiness}</span>}
        </div>

        <div className="ml-auto flex items-center gap-4 instrument-mono text-zinc-400 pr-1">
          {q0Fid != null && <span>Q0 <span className="text-white">{(q0Fid * 100).toFixed(1)}</span>%</span>}
          {q0Temp != null && <span><span className="text-white">{q0Temp}</span> mK</span>}
          {detuning && <span className="text-applied">Δf {Number(detuning.frequency_error || 0).toFixed(3)}</span>}
          {latestFidelity != null && <span>fid <span className="text-true">{latestFidelity.toFixed(4)}</span></span>}

          <button onClick={() => setCommandOpen(true)} className="rounded border hairline px-1.5 py-px hover:bg-white/5" title="⌘K">
            <CommandIcon className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              // Re-check connection first (recover from an initial failed health check), then refresh data if ok
              void checkConnection().then((ok) => {
                if (ok) {
                  void refreshDevice()
                  void refreshMetrics()
                }
              })
            }}
            className="rounded border hairline px-1.5 py-px hover:bg-white/5"
            title="Re-check connection and refresh device/metrics"
          >
            refresh
          </button>
        </div>
      </div>

      {/* Content area: full-bleed WebGPU stage (absolute inset-0) with progressive-blur dock overlaid at bottom.
          The stage extends *under* the dock so backdrop-filter has real content to blur.
          Dock itself is transparent; graduated blur comes from ::before/::after + mask-image. */}
      <div className="content-area">
        {/* Full-bleed stage — the WebGPU viz bleeds under the dock */}
        <div className="stage">
          {backendDown && (
            <div className="absolute top-2 left-2 z-40 text-[10px] px-2 py-px rounded bg-red-950/80 text-red-300 border border-red-900/40">
              Cannot reach backend — <span className="font-mono">make run-api</span>
            </div>
          )}

          {/* Stage tabs: clearest founder-demo layout (drift landscape vs hardware 3D) */}
          <div className="absolute top-1.5 left-1.5 z-30 flex rounded border border-white/10 bg-black/70 backdrop-blur">
            <button
              onClick={() => setStageTab("drift")}
              className={`px-2 py-0.5 text-[10px] font-mono rounded-l ${stageTab === "drift" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              drift
            </button>
            <button
              onClick={() => setStageTab("device")}
              className={`px-2 py-0.5 text-[10px] font-mono border-l border-white/10 rounded-r ${stageTab === "device" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              device
            </button>
          </div>

          {stageTab === "drift" ? (
            <CalibrationSurfaceLazy
              detuning={detuning}
              applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
              fidelityHistory={surfaceHistory}
              readinessScore={device?.readiness_score ?? 0.7}
              readoutFidelity={device?.readout_fidelity ?? null}
              className="absolute inset-0"
            />
          ) : (
            <Device3DLazy
              device={device}
              detuning={detuning}
              applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
              className="absolute inset-0"
            />
          )}

          {/* HUD label — only for drift tab. On device tab, Device3D owns its own top-right badge to avoid collision. */}
          {stageTab === "drift" && (
            <div className="absolute top-2 right-2 stage-hud text-zinc-500 pointer-events-none">
              param drift · Δfreq × Δamp
            </div>
          )}

          {/* Fidelity climb HUD — bumped upward and right to keep bottom-right free for state chip.
              Only shown during active calibrate/turn so bottom-right area stays clear for state machine. */}
          {activeTurn && activeTurn.fidelityHistory.length > 0 && (
            <div className="absolute top-12 right-3 w-[260px] hud rounded px-2 py-1 text-[10px] z-20">
              <div className="flex items-baseline justify-between mb-0.5 px-1">
                <div className="text-zinc-400">fidelity climb</div>
                <div className="instrument-mono" style={{color: 'var(--success)'}}>
                  {latestFidelity?.toFixed(4)} / {threshold}
                </div>
              </div>
              <div className="h-[56px] -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activeTurn.fidelityHistory.map(p => ({ step: p.iter, fidelity: p.fidelity }))} margin={{ top: 2, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                    <XAxis dataKey="step" tick={{ fontSize: 9, fill: "#52525b" }} />
                    <YAxis domain={[0.5, 1.0]} tick={{ fontSize: 9, fill: "#52525b" }} />
                    <ReferenceLine y={threshold} stroke="#FF9500" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="fidelity" stroke="#007AFF" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* State machine status chip — bottom-right of the stage, above progressive blur dock.
              Single derived state; updates from connected / is_ready / active jobs / turns. */}
          <div className="absolute bottom-3 right-3 z-30">
            <StageStateChip state={stageMachine} />
          </div>
        </div>

        {/* Progressive blur dock — transcript on top, chips, composer flush at absolute bottom.
            The stage extends under so blur has real content. Composer is lowest UI element. */}
        <div className="dock chat-dock">
          <div className="constrained chat-constrained">
            {/* Scrollable conversation transcript (top of dock, grows, scrolls) */}
            <div ref={transcriptRef} className="chat-transcript">
              {turns.length === 0 && (
                <div className="chat-empty text-zinc-500">No messages yet. Try “Calibrate Q0” or type a goal below.</div>
              )}
              {turns.map((t) => (
                <div key={t.id} className="chat-turn">
                  {/* User message */}
                  <div className="chat-user">
                    <span className="chat-label">you</span>
                    <span className="chat-text">{t.userMessage || t.goal}</span>
                  </div>
                  {/* Agent NL reply — primary content */}
                  <div className="chat-agent">
                    <span className="chat-label">agent</span>
                    {t.status === "running" && (
                      <span className="chat-text text-applied">running…</span>
                    )}
                    {t.status === "failed" && (
                      <span className="chat-text text-fail">{t.error || "failed"}</span>
                    )}
                    {t.status !== "running" && t.agentMessage && (
                      <span className="chat-text chat-nl">{t.agentMessage}</span>
                    )}
                    {t.status !== "running" && !t.agentMessage && !t.error && (
                      <span className="chat-text text-zinc-500">completed</span>
                    )}
                  </div>
                  {/* Optional micro traces line (collapsed; not the primary view) */}
                  {t.traces && t.traces.length > 0 && (
                    <div className="chat-traces">
                      {t.traces.slice(-3).map((tr, i) => (
                        <span key={i} className="chat-trace-pill">{tr.tool}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Soft suggestion chips (above composer) */}
            <div className="chat-chips">
              {suggested.map((s, i) => (
                <button key={i} onClick={() => runSuggested(s.goal)} disabled={!connected || submitting} className="preset-chip">
                  {s.label}
                </button>
              ))}
            </div>

            {/* Composer flush to the very bottom of the dock/viewport */}
            <div className="chat-composer">
              <div className="composer">
                <input
                  className="instrument-mono"
                  placeholder="Type a goal… or pick above"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !submitting) void submitGoal(goalInput) }}
                  disabled={submitting || !connected}
                />
                {hasRunning ? (
                  <Button variant="outline" size="sm" className="h-7 border-white/10" onClick={() => { void stopActive() }}>
                    <Square className="h-3 w-3 mr-1" /> stop
                  </Button>
                ) : (
                  <button onClick={() => { void submitGoal(goalInput) }} disabled={submitting || !goalInput.trim() || !connected} className="rounded-full p-1.5 hover:bg-white/5 disabled:opacity-40" aria-label="send">
                    <Send className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setCommandOpen(true)} className="ml-1 text-[10px] px-1.5 py-0.5 rounded border hairline text-zinc-500 hover:text-zinc-300" title="⌘K">⌘K</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
