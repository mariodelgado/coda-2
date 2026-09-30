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

const easeOut = [0.23, 1, 0.32, 1] as const

interface FidelityPoint { iter: number; fidelity: number }

interface Turn {
  id: string
  goal: string
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

  const [turns, setTurns] = useState<Turn[]>([])
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

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
    setSelectedTurnId(turnId)
    setSubmitting(true)
    setGoalInput("")

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
  useEffect(() => {
    void checkConnection().then(ok => {
      if (ok) {
        void refreshDevice()
        void refreshMetrics()
      }
    })
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

  const hasRunning = useMemo(() =>
    turns.some(t => t.status === "running") || Object.values(jobs).some(j => j.status === "running"),
  [turns, jobs])

  const suggested = useMemo(() => [
    { label: "Calibrate Q0", goal: "Bring qubit 0 to ready" },
    { label: "Bell pair", goal: "Run a Bell pair and report fidelity" },
    { label: "Bring ready", goal: "Bring qubit 0 to ready" },
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
      <CommandPalette actions={commandActions} disabled={!connected && backendDown} />

      {/* Status bar is thin; the rest of the viewport is split 65/35 with continuous gradient (no hard seam) */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* HERO — 65% of remaining height */}
        <div className="hero">
        {/* Floating instrument status bar over the viz */}
        <div className="status-bar absolute top-0 left-0 right-0 z-50 flex items-center px-3">
          <div className="flex items-center gap-2 font-medium">
            <span className="font-sans tracking-[-0.2px]">Conductor QPU</span>
            <span className="px-1.5 py-px rounded text-[10px] text-black font-mono tracking-[0.5px]" style={{background: 'var(--success)'}}>LIVE</span>
            <span className={isReady ? "text-success" : "text-applied"}>
              {isReady ? "READY" : "CAL NEEDED"}
            </span>
            {readiness && <span className="text-zinc-500">· {readiness}</span>}
          </div>

          <div className="ml-auto flex items-center gap-4 instrument-mono text-zinc-400">
            {q0Fid != null && (
              <span>Q0 <span className="text-zinc-200">{(q0Fid * 100).toFixed(1)}</span>%</span>
            )}
            {q0Temp != null && (
              <span><span className="text-zinc-200">{q0Temp}</span> mK</span>
            )}
            {detuning && (
              <span className="text-applied">Δf {Number(detuning.frequency_error || 0).toFixed(3)}</span>
            )}
            {latestFidelity != null && (
              <span>fid <span className="text-true">{latestFidelity.toFixed(4)}</span></span>
            )}

            <button
              onClick={() => setCommandOpen(true)}
              className="rounded border hairline px-1.5 py-px hover:bg-white/5"
              title="⌘K"
            >
              <CommandIcon className="h-3 w-3" />
            </button>
            <button
              onClick={() => { void refreshDevice(); void refreshMetrics() }}
              className="rounded border hairline px-1.5 py-px hover:bg-white/5"
            >
              refresh
            </button>
          </div>
        </div>

        {backendDown && (
          <div className="absolute top-[34px] left-0 right-0 z-40 text-[10px] px-3 py-px bg-red-950/70 text-red-300 border-b border-red-900/40">
            Cannot reach backend — start with <span className="font-mono">make run-api</span>
          </div>
        )}

        <CalibrationSurfaceLazy
          detuning={detuning}
          applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
          fidelityHistory={surfaceHistory}
          readinessScore={device?.readiness_score ?? 0.7}
          readoutFidelity={device?.readout_fidelity ?? null}
          className="absolute inset-0"
        />

        {/* Tiny stage label */}
        <div className="absolute top-3 left-3 stage-hud text-zinc-500 pointer-events-none">
          param drift · Δfreq × Δamp
        </div>

        {/* Small fidelity climb HUD (only when we have real steps) */}
        {activeTurn && activeTurn.fidelityHistory.length > 0 && (
          <div className="absolute bottom-3 right-3 w-[300px] hud rounded px-2 py-1.5 text-[10px]">
            <div className="flex items-baseline justify-between mb-0.5 px-1">
              <div className="text-zinc-400">fidelity climb</div>
              <div className="instrument-mono" style={{color: 'var(--success)'}}>
                {latestFidelity?.toFixed(4)} / {threshold}
              </div>
            </div>
            <div className="h-[72px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={activeTurn.fidelityHistory.map(p => ({ step: p.iter, fidelity: p.fidelity }))}
                  margin={{ top: 2, right: 6, bottom: 0, left: 0 }}
                >
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
      </div>

      {/* BOTTOM 35% — agent zone (continuous gradient, no hard seam) */}
      <div className="lower">
        <div className="constrained">
          {/* Quiet centered ledger turns */}
          {ledger.length > 0 && (
            <div className="ledger mb-1">
              {ledger.map((t) => {
                const isSel = t.id === selectedTurnId
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTurnId(t.id)}
                    className={`ledger-row w-full text-left ${isSel ? "selected" : ""}`}
                  >
                    <span className="text-zinc-500 w-[76px] shrink-0 tabular-nums instrument-mono">
                      {new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className="text-true shrink-0">{t.goal}</span>
                    <span className="text-zinc-400 truncate">{lastSummary(t)}</span>
                    {t.status === "running" && <span className="ml-auto text-applied">running</span>}
                    {t.status === "failed" && <span className="ml-auto text-red-400">failed</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Intent chips + centered composer */}
          <div className="mt-1 flex flex-col items-center gap-2">
            <div className="flex flex-wrap justify-center gap-1.5">
              {suggested.map((s, i) => (
                <button
                  key={i}
                  onClick={() => runSuggested(s.goal)}
                  disabled={!connected || submitting}
                  className="preset-chip"
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="composer-wrap w-full">
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
                  <button
                    onClick={() => { void submitGoal(goalInput) }}
                    disabled={submitting || !goalInput.trim() || !connected}
                    className="rounded-full p-1.5 hover:bg-white/5 disabled:opacity-40"
                    aria-label="send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setCommandOpen(true)}
                  className="ml-1 text-[10px] px-1.5 py-0.5 rounded border hairline text-zinc-500 hover:text-zinc-300"
                  title="⌘K"
                >
                  ⌘K
                </button>
              </div>
            </div>
          </div>

          {/* Slim in-rail details for selected turn */}
          <AnimatePresence>
            {selectedTurn && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.12, ease: easeOut }}
                className="details mt-2 rounded p-2 overflow-hidden"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-zinc-400">{selectedTurn.goal}</div>
                  <button className="text-[10px] text-zinc-500" onClick={() => setSelectedTurnId(null)}>close</button>
                </div>

                {selectedTurn.fidelityHistory.length > 0 && (
                  <div className="h-[84px] -mx-1 mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selectedTurn.fidelityHistory.map(p => ({ step: p.iter, fidelity: p.fidelity }))} margin={{ top: 2, right: 4, bottom: 0, left: -4 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                        <XAxis dataKey="step" tick={{ fontSize: 9, fill: "#52525b" }} />
                        <YAxis domain={[0.5, 1.0]} tick={{ fontSize: 9, fill: "#52525b" }} />
                        <ReferenceLine y={selectedTurn.calThreshold} stroke="#FF9500" strokeDasharray="2 2" />
                        <Line type="monotone" dataKey="fidelity" stroke="#007AFF" strokeWidth={1.5} dot={{ r: 1 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {selectedTurn.traces.length > 0 && (
                  <div className="instrument-mono text-[10px] text-zinc-400 space-y-px max-h-[58px] overflow-auto">
                    {selectedTurn.traces.slice(-5).map((tr, i) => (
                      <div key={i}>{new Date(tr.ts * 1000).toLocaleTimeString()} · {tr.tool} · {tr.summary}</div>
                    ))}
                  </div>
                )}

                {selectedTurn.bellCounts && (
                  <div className="instrument-mono text-true text-[10px] mt-1">
                    {JSON.stringify(selectedTurn.bellCounts)}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-auto pt-1 text-[9px] text-zinc-600 text-center">Real control plane. Traces only. No LLM.</div>
      </div>
    </div>
  </div>
  )
}
