"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { motion, AnimatePresence } from "motion/react"
import { Send, Square, Command as CommandIcon, X, Cpu, Zap } from "lucide-react"
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

const easeOut = [0.23, 1, 0.32, 1] as const

interface FidelityPoint { iter: number; fidelity: number }

interface Turn {
  id: string
  goal: string
  status: "running" | "succeeded" | "failed"
  traces: ToolTrace[]
  results: Array<{ ok: boolean; data?: any; latency_s: number; error?: string | null }>
  fidelityHistory: FidelityPoint[]
  calThreshold: number
  lastCalParams?: Record<string, number> | null
  bellCounts?: Record<string, number> | null
  error?: string
  createdAt: number
}

export default function ConductorQPUChat() {
  const setCommandOpen = useControlPlaneStore((s) => s.setCommandOpen)

  const [apiBase, setApiBaseState] = useState<string>(getApiBase())
  const [connected, setConnected] = useState(false)
  const [backendDown, setBackendDown] = useState(false)

  const [device, setDevice] = useState<DeviceState | null>(null)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)
  const [appliedParams, setAppliedParams] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)

  const [turns, setTurns] = useState<Turn[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [viewingDriftFor, setViewingDriftFor] = useState<string | null>(null)

  const [goalInput, setGoalInput] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  const [inspectOpen, setInspectOpen] = useState(false)

  const threadRef = useRef<HTMLDivElement>(null)

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
      const { jobs: list } = await api.listJobs(50)
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

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({ top: 999999, behavior: "smooth" })
    })
  }, [])

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
    const newTurn: Turn = {
      id: turnId,
      goal,
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
    setExpanded(prev => ({ ...prev, [turnId]: false }))
    setViewingDriftFor(null)
    setSubmitting(true)
    setGoalInput("")

    scrollToBottom()

    try {
      const resp = await api.postGoal(goal)
      const traces = resp.traces || []
      const { history, params, counts, threshold } = extractFromResults(resp.results || [])

      setTurns(prev => prev.map(t => {
        if (t.id !== turnId) return t
        return {
          ...t,
          status: "succeeded",
          traces,
          results: resp.results || [],
          fidelityHistory: history,
          calThreshold: threshold,
          lastCalParams: params,
          bellCounts: counts,
        }
      }))

      // If a job came back, wire it
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
      scrollToBottom()
    }
  }, [refreshDevice, refreshMetrics, loadRecentJobs, startJobSSE, scrollToBottom])

  const runSuggested = useCallback((label: string, goal: string) => {
    void submitGoal(goal)
  }, [submitGoal])

  const stopActive = useCallback(async () => {
    const runningJob = Object.values(jobs).find(j => j.status === "running" || j.status === "queued")
    if (runningJob) {
      await cancelJob(runningJob.job_id)
    }
    // Also mark any running turn as cancelled (best effort)
    setTurns(prev => prev.map(t => t.status === "running" ? { ...t, status: "failed", error: "cancelled" } : t))
  }, [jobs, cancelJob])

  // Bootstrap
  useEffect(() => {
    void checkConnection().then(ok => {
      if (ok) {
        void refreshDevice()
        void refreshMetrics()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Background refresh
  useEffect(() => {
    const id = setInterval(() => {
      if (connected) {
        void refreshDevice()
        void refreshMetrics()
      }
    }, 8000)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics])

  // Poll active job
  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j || j.status !== "running") return
    const iv = setInterval(() => { void pollJobOnce(activeJobId) }, 900)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  const hasRunning = useMemo(() => turns.some(t => t.status === "running") || Object.values(jobs).some(j => j.status === "running"), [turns, jobs])

  const suggested = useMemo(() => [
    { label: "Calibrate Q0", goal: "Bring qubit 0 to ready" },
    { label: "Bell pair", goal: "Run a Bell pair and report fidelity" },
    { label: "Bring device ready", goal: "Bring qubit 0 to ready" },
  ], [])

  const commandActions: CommandAction[] = useMemo(() => [
    { id: "c1", label: "Bring qubit 0 to ready", hint: "calibrate", group: "Goals", icon: defaultCommandIcons.calibrate, run: () => submitGoal("Bring qubit 0 to ready") },
    { id: "c2", label: "Run a Bell pair and report fidelity", hint: "circuit", group: "Goals", icon: defaultCommandIcons.bell, run: () => submitGoal("Run a Bell pair and report fidelity") },
    { id: "c3", label: "Refresh device", group: "Quick", icon: defaultCommandIcons.refresh, run: async () => { await Promise.all([refreshDevice(), refreshMetrics()]) } },
    { id: "c4", label: "Force fail next calibration", hint: "demo", group: "Demo", icon: defaultCommandIcons.fail, run: async () => { try { await api.demoForceFailNextCal(); toast.message("Next cal will fail") } catch { toast.error("unavailable") } } },
    { id: "c5", label: "Start long job (cancel me)", hint: "demo", group: "Demo", icon: defaultCommandIcons.long, run: async () => {
      try {
        const r = await api.demoStartLongJob()
        const tId = (globalThis.crypto?.randomUUID?.() || `t_${Date.now()}`) as string
        setTurns(prev => [...prev, { id: tId, goal: "Start long job (demo)", status: "running", traces: [], results: [], fidelityHistory: [], calThreshold: 0.88, createdAt: Date.now() }])
        setActiveJobId(r.job_id)
        startJobSSE(r.job_id)
        toast.message("Long job running")
      } catch { toast.error("unavailable") }
    }} ,
  ], [submitGoal, refreshDevice, refreshMetrics, startJobSSE])

  const toggleExpand = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const openDriftFor = (id: string) => {
    setViewingDriftFor(id)
    setInspectOpen(true)
  }

  // Current turn for drift (latest or selected)
  const driftTurn = useMemo(() => {
    if (viewingDriftFor) return turns.find(t => t.id === viewingDriftFor) || null
    return [...turns].reverse().find(t => t.fidelityHistory?.length) || null
  }, [turns, viewingDriftFor])

  const currentMetrics = useMemo(() => {
    const cal = (metrics?.orchestrator?.calibration || metrics?.calibration || {}) as any
    return {
      attempts: Number(cal.attempts ?? 0),
      successes: Number(cal.successes ?? 0),
      successRate: Number(cal.calibration_success_rate ?? 0),
      timeToCal: Number(cal.avg_time_to_calibrated_s ?? 0),
      iface: Number(cal.avg_interface_latency_s ?? 0),
    }
  }, [metrics])

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-200 flex flex-col selection:bg-white/20">
      <CommandPalette actions={commandActions} disabled={!connected && backendDown} />

      {/* Minimal top chrome — just the name */}
      <header className="h-12 border-b border-white/10 bg-[#0a0a0b]/95 backdrop-blur flex items-center px-4 z-50">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-emerald-500" />
          <div className="font-semibold tracking-[-0.3px]">Conductor <span className="text-zinc-500">QPU</span></div>
          <Badge variant={connected ? "default" : "destructive"} className="px-1.5 py-0 text-[10px]">{connected ? "LIVE" : "OFFLINE"}</Badge>
        </div>

        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setInspectOpen(v => !v)}
            className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            <Cpu className="h-3.5 w-3.5" /> Device
          </button>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 hover:bg-white/5"
            title="⌘K"
          >
            <CommandIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { void refreshDevice(); void refreshMetrics() }}
            className="rounded border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            Refresh
          </button>
          <div className="pl-2 text-[10px] text-zinc-500 hidden md:block">No LLM keys · real traces</div>
        </div>
      </header>

      {backendDown && (
        <div className="border-b border-red-900/40 bg-red-950/40 text-[11px] px-4 py-1 text-red-300">
          Cannot reach backend — <span className="font-mono">make run-api</span> in another terminal.
        </div>
      )}

      {/* Vast center / thread area */}
      <div ref={threadRef} className="flex-1 overflow-y-auto">
        {turns.length === 0 ? (
          // First paint — ChatGPT-like empty with centered soft suggestions
          <div className="min-h-[calc(100vh-140px)] flex items-center justify-center">
            <div className="max-w-xl px-6 text-center">
              <div className="text-2xl font-semibold tracking-[-0.4px] mb-2">What would you like to run?</div>
              <div className="text-sm text-zinc-500 mb-6">Real traces. No theater.</div>

              <div className="flex flex-wrap gap-2 justify-center">
                {suggested.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => runSuggested(s.label, s.goal)}
                    disabled={!connected || submitting}
                    className="rounded-full border border-white/10 bg-zinc-950 px-4 py-2 text-sm hover:bg-white/5 active:scale-[0.985] transition disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="mt-8 text-[11px] text-zinc-600">
                Or type anything below. ⌘K for more.
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 pt-6 pb-28 space-y-8">
            {turns.map((turn, idx) => {
              const isOpen = !!expanded[turn.id]
              const latestF = turn.fidelityHistory.length ? turn.fidelityHistory[turn.fidelityHistory.length - 1].fidelity : null
              const outcome = turn.bellCounts
                ? `Bell: ${Object.entries(turn.bellCounts).map(([k, v]) => `${k}=${v}`).join(" ")}`
                : latestF != null
                  ? `fidelity = ${latestF.toFixed(5)} (threshold ${turn.calThreshold})`
                  : turn.status === "running" ? "Running…" : "Complete"

              return (
                <div key={turn.id} className="group">
                  {/* User turn */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2 text-sm">
                      {turn.goal}
                    </div>
                  </div>

                  {/* Assistant response */}
                  <div className="mt-3 pl-1">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Conductor</div>

                    {turn.status === "running" && (
                      <div className="text-sm text-zinc-400">Working…</div>
                    )}

                    {turn.traces.length > 0 && (
                      <div className="mt-1 space-y-1 text-sm">
                        {turn.traces.slice(-6).map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                            <span className="font-mono text-emerald-400/90">{t.tool}</span>
                            <span className="truncate text-zinc-500">{JSON.stringify(t.args).slice(0, 80)}</span>
                            <span className="tabular-nums ml-auto">{t.latency_s.toFixed(3)}s</span>
                            <span className={t.ok ? "text-emerald-400" : "text-red-400"}>{t.ok ? "ok" : "err"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 text-sm">
                      {turn.status === "failed" && turn.error ? (
                        <span className="text-red-400">{turn.error}</span>
                      ) : (
                        <span className="text-emerald-400">{outcome}</span>
                      )}
                    </div>

                    {/* Per-turn details (opt-in, calm) */}
                    <div className="mt-2">
                      <button
                        onClick={() => toggleExpand(turn.id)}
                        className="text-xs text-zinc-500 hover:text-zinc-300 underline decoration-white/20"
                      >
                        {isOpen ? "Hide details" : "Details"}
                      </button>

                      {isOpen && (
                        <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3 text-sm">
                          {turn.fidelityHistory.length > 0 && (
                            <div className="mb-3">
                              <div className="text-[10px] text-zinc-500 mb-1">Fidelity climb</div>
                              <div className="h-40 -mx-1">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={turn.fidelityHistory.map(p => ({ step: p.iter, fidelity: p.fidelity }))} margin={{ top: 6, right: 10, bottom: 2, left: -6 }}>
                                    <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                                    <XAxis dataKey="step" tick={{ fontSize: 10, fill: "#52525b" }} />
                                    <YAxis domain={[0.5, 1.02]} tick={{ fontSize: 10, fill: "#52525b" }} />
                                    <ReferenceLine y={turn.calThreshold} stroke="#f59e0b" strokeDasharray="2 2" />
                                    <Line type="monotone" dataKey="fidelity" stroke="#10b981" strokeWidth={2} dot={{ r: 1.2 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="text-[10px] text-zinc-500">Real steps from the gradient-free loop.</div>
                            </div>
                          )}

                          {turn.bellCounts && (
                            <div className="mb-3 text-xs text-emerald-400/90">
                              Counts: {JSON.stringify(turn.bellCounts)}
                            </div>
                          )}

                          {turn.traces.length > 0 && (
                            <div>
                              <div className="text-[10px] text-zinc-500 mb-1">Traces</div>
                              <div className="font-mono text-[10px] space-y-0.5 text-zinc-400 max-h-[140px] overflow-auto">
                                {turn.traces.map((t, i) => (
                                  <div key={i}>{new Date(t.ts * 1000).toLocaleTimeString()} · {t.tool} · {t.summary || JSON.stringify(t.args).slice(0, 60)}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-3">
                            <button
                              onClick={() => openDriftFor(turn.id)}
                              className="text-xs rounded border border-white/10 px-2 py-1 hover:bg-white/5"
                            >
                              View param drift surface
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom composer — ChatGPT style */}
      <div className="border-t border-white/10 bg-[#0a0a0b] p-3">
        <div className="mx-auto max-w-3xl">
          {/* Compact suggestions when conversation started */}
          {turns.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              {suggested.map((s, i) => (
                <button
                  key={i}
                  onClick={() => runSuggested(s.label, s.goal)}
                  disabled={!connected || submitting}
                  className="rounded-full border border-white/10 px-3 py-0.5 text-xs text-zinc-400 hover:bg-white/5 disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-zinc-950 px-3 py-1.5 shadow-inner">
            <Input
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-sm placeholder:text-zinc-600 h-9"
              placeholder="Type a goal… or pick a suggestion above"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !submitting) void submitGoal(goalInput) }}
              disabled={submitting || !connected}
            />
            {hasRunning ? (
              <Button variant="outline" size="icon" className="h-8 w-8 border-white/10" onClick={() => { void stopActive() }}>
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={() => { void submitGoal(goalInput) }}
                disabled={submitting || !goalInput.trim() || !connected}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="mt-1 px-1 text-[10px] text-zinc-600 text-center">
            Real control plane. Traces only. No LLM.
          </div>
        </div>
      </div>

      {/* Quiet side panel (device + drift) — never on first paint */}
      <AnimatePresence>
        {inspectOpen && (
          <motion.aside
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.16, ease: easeOut }}
            className="fixed right-0 top-12 bottom-0 w-[320px] border-l border-white/10 bg-[#0a0a0b] p-3 overflow-auto z-[60]"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Device &amp; drift</div>
              <button onClick={() => setInspectOpen(false)} className="text-zinc-400 hover:text-zinc-200"><X className="h-4 w-4" /></button>
            </div>

            {!device && (
              <div className="text-xs text-zinc-500">No snapshot yet. Run something or refresh.</div>
            )}

            {device && (
              <div className="space-y-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={device.is_ready ? "default" : "destructive"} className="text-[10px]">{device.is_ready ? "READY" : "CAL NEEDED"}</Badge>
                    <span className="tabular-nums text-zinc-400">{device.readiness_score.toFixed(3)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3">
                    <div>
                      <div className="text-[10px] text-zinc-500">Temps (mK)</div>
                      {Object.entries(device.temperatures_mk).map(([q, t]) => <div key={q} className="tabular-nums">Q{q}: {t}</div>)}
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500">Readout</div>
                      {Object.entries(device.readout_fidelity).map(([q, f]) => <div key={q} className="tabular-nums">Q{q}: {(f * 100).toFixed(1)}%</div>)}
                    </div>
                  </div>
                  {detuning && (
                    <div className="mt-2 text-[10px] text-amber-400/90">Δfreq {detuning.frequency_error} · Δamp {detuning.amplitude_error}</div>
                  )}
                </div>

                <div className="rounded-lg border border-white/10 bg-black/30 p-2 text-xs">
                  <div className="text-[10px] text-zinc-500 mb-1">Metrics</div>
                  <div>attempts {currentMetrics.attempts} · successes {currentMetrics.successes}</div>
                  <div>success rate {(currentMetrics.successRate * 100).toFixed(1)}%</div>
                  <div>avg time {currentMetrics.timeToCal.toFixed(4)}s · iface {currentMetrics.iface.toFixed(4)}s</div>
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-zinc-500 mb-1">
                <Zap className="h-3 w-3" /> Param drift
              </div>
              <div className="h-[220px] rounded-lg border border-white/10 overflow-hidden">
                <CalibrationSurfaceLazy
                  detuning={detuning}
                  applied={appliedParams || (driftTurn?.lastCalParams ?? null)}
                  fidelityHistory={driftTurn?.fidelityHistory ?? []}
                  readinessScore={device?.readiness_score ?? 0.7}
                  readoutFidelity={device?.readout_fidelity ?? null}
                />
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">Cyan = true target, amber = applied. Only renders when opened.</div>
            </div>

            <div className="mt-4 text-[10px] text-zinc-600">
              API {apiBase}
              <button className="ml-2 underline" onClick={() => {
                const v = prompt("API base", apiBase)
                if (v) { updateApiBase(v); void checkConnection(v) }
              }}>change</button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}
