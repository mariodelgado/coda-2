"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { 
  Activity, Cpu, Target, Zap, Play, RefreshCw, Send, CheckCircle2, XCircle, Clock,
  ThermometerSun, TrendingUp, AlertTriangle, X
} from "lucide-react"
import { toast } from "sonner"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer
} from "recharts"
import { api, type DeviceState, type JobRecord, type MetricsSnapshot, type ToolResult, type ToolTrace } from "@/lib/api"

interface FidelityPoint { iter: number; fidelity: number }
interface HistoryEntry { ts: number; message: string; kind: "goal" | "result" | "error" | "system" }

const DEFAULT_API = "http://localhost:8000"
const READY_THRESHOLD = 0.82

export default function ConductorQPUControlPlane() {
  // Connection
  const [apiBase, setApiBase] = useState<string>(DEFAULT_API)
  const [connected, setConnected] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(false)
  const [backendDown, setBackendDown] = useState<boolean>(false)

  // Device
  const [device, setDevice] = useState<DeviceState | null>(null)
  const [refreshingDevice, setRefreshingDevice] = useState(false)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)

  // Goals + Traces (real orchestrator decisions)
  const [goalInput, setGoalInput] = useState("")
  const [submittingGoal, setSubmittingGoal] = useState(false)
  const [lastGoalResults, setLastGoalResults] = useState<ToolResult[] | null>(null)
  const [lastTraces, setLastTraces] = useState<ToolTrace[]>([])

  // Jobs (history from backend; survives UI refresh while backend lives)
  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  // Calibration story
  const [fidelityHistory, setFidelityHistory] = useState<FidelityPoint[]>([])
  const [lastCalParams, setLastCalParams] = useState<Record<string, number> | null>(null)
  const [calThreshold, setCalThreshold] = useState<number>(0.88)
  const [calibrating, setCalibrating] = useState(false)

  // Metrics
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [refreshingMetrics, setRefreshingMetrics] = useState(false)

  // Activity
  const [history, setHistory] = useState<HistoryEntry[]>([
    { ts: Date.now(), message: "Control plane ready. No LLM keys. Real traces only.", kind: "system" },
  ])

  const log = useCallback((message: string, kind: HistoryEntry["kind"] = "system") => {
    setHistory((h) => [...h.slice(-100), { ts: Date.now(), message, kind }])
  }, [])

  // ---------- Connection & health ----------
  const checkConnection = useCallback(async (base?: string) => {
    const target = base || apiBase
    setChecking(true)
    try {
      const res = await fetch(`${target}/health`, { cache: "no-store" })
      if (!res.ok) throw new Error("not ok")
      const data = await res.json()
      const ok = data?.status === "ok"
      setConnected(ok)
      setBackendDown(!ok)
      if (ok) log(`Connected to ${target}`, "system")
      return ok
    } catch {
      setConnected(false)
      setBackendDown(true)
      log(`Backend unreachable at ${target}`, "error")
      return false
    } finally {
      setChecking(false)
    }
  }, [apiBase, log])

  // ---------- Device + Detuning (drift visible) ----------
  const refreshDevice = useCallback(async () => {
    setRefreshingDevice(true)
    try {
      const d = await api.deviceState()
      setDevice(d)
      // fetch detuning for qubit 0 to surface the "moving target"
      try {
        const dt = await api.getDetuning(0)
        setDetuning(dt.detuning)
      } catch { /* optional */ }
      log(`Device: ready=${d.is_ready} score=${d.readiness_score.toFixed(3)}`, "system")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "device fetch failed"
      log(`Device error: ${msg}`, "error")
      setBackendDown(true)
    } finally {
      setRefreshingDevice(false)
    }
  }, [log])

  // ---------- Metrics ----------
  const refreshMetrics = useCallback(async () => {
    setRefreshingMetrics(true)
    try {
      const m = await api.getMetrics()
      setMetrics(m)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "metrics failed"
      log(`Metrics error: ${msg}`, "error")
    } finally {
      setRefreshingMetrics(false)
    }
  }, [log])

  // ---------- Jobs (durable across refresh via backend list) ----------
  const loadRecentJobs = useCallback(async () => {
    try {
      const { jobs: list } = await api.listJobs(80)
      const map: Record<string, JobRecord> = {}
      list.forEach(j => { map[j.job_id] = j })
      setJobs(map)
    } catch { /* non-fatal */ }
  }, [])

  const upsertJob = useCallback((job: JobRecord) => {
    setJobs(prev => ({ ...prev, [job.job_id]: job }))
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      const es = eventSourcesRef.current[job.job_id]
      if (es) { es.close(); delete eventSourcesRef.current[job.job_id] }
    }
  }, [])

  const pollJobOnce = useCallback(async (jobId: string) => {
    try {
      const j = await api.getJob(jobId)
      upsertJob(j)
      return j
    } catch (e: unknown) {
      log(`Job poll ${jobId}: ${e instanceof Error ? e.message : e}`, "error")
      return null
    }
  }, [upsertJob, log])

  const startJobSSE = useCallback((jobId: string) => {
    const existing = eventSourcesRef.current[jobId]; if (existing) existing.close()
    const url = api.sseJobUrl(jobId)
    try {
      const es = new EventSource(url)
      eventSourcesRef.current[jobId] = es
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data?.job_id) upsertJob({
            job_id: data.job_id,
            status: (data.status as JobRecord["status"]) || "running",
            job_type: "circuit",
            result: data.result || null,
            metrics: data.metrics || null,
            error: data.error || null,
          })
        } catch {}
      }
      es.onerror = () => {
        es.close(); delete eventSourcesRef.current[jobId]
        const iv = setInterval(async () => {
          const j = await pollJobOnce(jobId)
          if (j && ["succeeded","failed","cancelled"].includes(j.status)) clearInterval(iv)
        }, 900)
      }
    } catch {
      const iv = setInterval(async () => {
        const j = await pollJobOnce(jobId)
        if (j && ["succeeded","failed","cancelled"].includes(j.status)) clearInterval(iv)
      }, 800)
    }
  }, [upsertJob, pollJobOnce])

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await api.postGoal(`__internal_cancel__`) // no-op; use direct if available
      // direct cancel via orchestrator tool is exposed via goal; use raw call
      const res = await fetch(`${apiBase}/goals`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: `cancel job ${jobId}` }),
      }).catch(() => null)
      // fallback: call cancel_job directly by goal phrasing the orchestrator understands
      // Better: just poll status after marking; the adapter supports cancel.
      // Call via a lightweight goal that hits the tool if planner routes it.
      // Simpler: directly hit a cancel if we expose; for now use orchestrator goal phrasing.
      const j = await api.getJob(jobId)
      if (j.status === "running" || j.status === "queued") {
        // attempt cancel via a goal that planner will map (best-effort)
        await api.postGoal(`cancel ${jobId}`).catch(() => {})
      }
      await pollJobOnce(jobId)
      await loadRecentJobs()
      log(`Cancel requested for ${jobId}`, "system")
    } catch (e: unknown) {
      log(`Cancel failed: ${e instanceof Error ? e.message : e}`, "error")
    }
  }, [apiBase, pollJobOnce, loadRecentJobs, log])

  // ---------- Traces (real agent/control-plane decisions) ----------
  const loadRecentTraces = useCallback(async () => {
    try {
      const { traces } = await api.getTraces()
      if (traces?.length) setLastTraces(traces.slice(-30))
    } catch { /* optional */ }
  }, [])

  // ---------- Calibration + fidelity story ----------
  const refreshFidelityFromDevice = useCallback(async () => {
    // keep a lightweight "current" point if we have device
    if (!device) return
    // no direct current fidelity exposed; we surface via last calibration or detuning
  }, [device])

  // ---------- Goal execution (captures real traces) ----------
  const submitGoal = useCallback(async (raw: string) => {
    const goal = raw.trim()
    if (!goal) return
    setSubmittingGoal(true)
    setLastGoalResults(null)
    log(`→ ${goal}`, "goal")
    try {
      const resp = await api.postGoal(goal)
      setLastGoalResults(resp.results || [])
      if (resp.traces && resp.traces.length) {
        setLastTraces(resp.traces)
      }
      for (const r of (resp.results || [])) {
        const data = r.data as Record<string, unknown> | undefined
        if (data && Array.isArray(data.history)) {
          const hist = (data.history as Array<[number, number]>).map(([it, f]) => ({ iter: it, fidelity: f }))
          if (hist.length) {
            setFidelityHistory(hist)
            if (typeof data.threshold === "number") setCalThreshold(data.threshold)
            if (data.params) setLastCalParams(data.params as Record<string, number>)
          }
        }
        if (r.ok) {
          log(`✓ ${r.data ? JSON.stringify(r.data).slice(0,120) : "ok"} (${r.latency_s.toFixed(3)}s)`, "result")
        } else {
          log(`✗ ${r.error || "failed"}`, "error")
        }
      }
      await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs(), loadRecentTraces()])
      toast.success("Goal executed")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "goal failed"
      log(`✗ ${msg}`, "error")
      setBackendDown(true)
      toast.error(msg)
    } finally {
      setSubmittingGoal(false)
      setGoalInput("")
    }
  }, [log, refreshDevice, refreshMetrics, loadRecentJobs, loadRecentTraces])

  // ---------- Quick actions (real paths) ----------
  const runCalibrate = useCallback(async () => {
    // Route through goal so we get real orchestrator traces in the timeline
    await submitGoal("Bring qubit 0 to ready")
  }, [submitGoal])

  const runBell = useCallback(async () => {
    log("Quick: Bell pair 1024 shots", "goal")
    try {
      const res = await api.postBell(1024, [0, 1])
      if (res.job_id) {
        setActiveJobId(res.job_id)
        const jr: JobRecord = { job_id: res.job_id, status: "running", job_type: "circuit", result: null, metrics: null }
        upsertJob(jr)
        startJobSSE(res.job_id)
        setTimeout(() => pollJobOnce(res.job_id), 500)
        setTimeout(() => pollJobOnce(res.job_id), 1400)
      }
      if (res.counts) log(`Bell: ${JSON.stringify(res.counts)}`, "result")
      await Promise.all([refreshMetrics(), loadRecentJobs()])
      toast.success("Bell submitted")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "bell failed"
      log(`Bell error: ${msg}`, "error")
      toast.error(msg)
    }
  }, [log, upsertJob, startJobSSE, pollJobOnce, refreshMetrics, loadRecentJobs])

  // ---------- Effects ----------
  useEffect(() => { checkConnection().then(ok => { if (ok) { refreshDevice(); refreshMetrics(); loadRecentJobs(); loadRecentTraces() } }) }, []) // eslint-disable-line

  // Periodic refresh while connected (drift becomes visible)
  useEffect(() => {
    const id = setInterval(() => {
      if (connected) {
        refreshDevice()
        refreshMetrics()
        loadRecentJobs()
      }
    }, 6500)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics, loadRecentJobs])

  // Light poll for active job
  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j || j.status !== "running") return
    const iv = setInterval(() => { pollJobOnce(activeJobId) }, 850)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  // Derived
  const readinessPct = device ? Math.round(device.readiness_score * 100) : 0
  const isReady = !!device?.is_ready
  const latestFidelity = fidelityHistory.length ? fidelityHistory[fidelityHistory.length - 1].fidelity : undefined
  const crossedReady = latestFidelity !== undefined && latestFidelity >= READY_THRESHOLD

  const currentMetrics = useMemo(() => {
    const cal = metrics?.orchestrator?.calibration || metrics?.calibration || {}
    return {
      attempts: Number(cal.attempts ?? 0),
      successes: Number(cal.successes ?? 0),
      successRate: Number(cal.calibration_success_rate ?? 0),
      timeToCal: Number(cal.avg_time_to_calibrated_s ?? 0),
      interfaceLatency: Number(cal.avg_interface_latency_s ?? 0),
    }
  }, [metrics])

  const jobList = useMemo(() => Object.values(jobs).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")), [jobs])

  // Recharts data
  const chartData = useMemo(() => fidelityHistory.map(p => ({
    step: p.iter,
    fidelity: p.fidelity,
    threshold: calThreshold,
  })), [fidelityHistory, calThreshold])

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Top bar - instrument panel */}
      <header className="border-b border-white/10 bg-zinc-950/90 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-5 h-12 flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-emerald-500" />
              <div className="font-semibold tracking-[-0.3px]">Conductor QPU</div>
              <div className="text-[10px] text-zinc-500">Control Plane</div>
            </div>
            <Badge variant={connected ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
              {connected ? "LIVE" : "OFFLINE"}
            </Badge>
            {backendDown && <Badge variant="destructive" className="text-[10px]">BACKEND DOWN</Badge>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="text-zinc-500 hidden md:block">API</div>
            <Input
              className="h-7 w-64 bg-zinc-900 border-white/10 font-mono text-xs"
              value={apiBase}
              onChange={e => setApiBase(e.target.value)}
              onBlur={() => checkConnection(apiBase)}
              onKeyDown={e => e.key === "Enter" && checkConnection(apiBase)}
            />
            <Button size="sm" variant="outline" onClick={() => checkConnection()} disabled={checking} className="h-7">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checking ? "animate-spin" : ""}`} />Ping
            </Button>
            <div className="pl-3 border-l border-white/10 text-[10px] text-zinc-500">Offline • No LLM keys • Real traces</div>
          </div>
        </div>
      </header>

      {backendDown && (
        <div className="bg-red-950/60 border-b border-red-900/50">
          <div className="mx-auto max-w-7xl px-5 py-2 text-xs flex items-center gap-2 text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Cannot reach backend. Start with <span className="font-mono">make run-api</span> in another shell.
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-5 py-5 space-y-5">
        {/* Command + Quick Actions - dense */}
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4" /> Goal / Command Bar
            </CardTitle>
            <CardDescription className="text-xs">
              Natural language → deterministic planner → orchestrator tools. Traces below are the actual decisions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                className="font-mono bg-zinc-950 border-white/10 h-9"
                placeholder='e.g. "Bring qubit 0 to ready" or "Run a Bell pair and report fidelity"'
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !submittingGoal) submitGoal(goalInput) }}
                disabled={submittingGoal || !connected}
              />
              <Button onClick={() => submitGoal(goalInput)} disabled={submittingGoal || !goalInput.trim() || !connected} className="h-9">
                <Send className="h-4 w-4 mr-2" /> Execute
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={runCalibrate} disabled={calibrating || !connected}>
                <Target className="h-3.5 w-3.5 mr-1.5" /> Calibrate Q0 → 0.88
              </Button>
              <Button variant="secondary" size="sm" onClick={runBell} disabled={!connected}>
                <Zap className="h-3.5 w-3.5 mr-1.5" /> Bell 1024
              </Button>
              <Button variant="ghost" size="sm" onClick={refreshDevice} disabled={refreshingDevice}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshingDevice ? "animate-spin" : ""}`} /> Device
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { refreshMetrics(); loadRecentJobs(); loadRecentTraces() }}>
                <Activity className="h-3.5 w-3.5 mr-1.5" /> Refresh
              </Button>
            </div>

            {/* Founder demo guardrails (clickable, reproducible) */}
            <div className="pt-1 border-t border-white/10 mt-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">Founder demo guardrails (reproducible failure + cancel)</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-amber-900/50 text-amber-300 hover:bg-amber-950/30" onClick={async () => {
                  try { await api.demoForceFailNextCal(); log("Demo: fidelity capped for next cal (will FAIL)", "system"); toast("Next calibration will fail to reach threshold"); } catch { toast.error("demo endpoint unavailable") }
                }}>
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" /> Force Fail Next Cal
                </Button>
                <Button variant="outline" size="sm" className="border-amber-900/50 text-amber-300 hover:bg-amber-950/30" onClick={async () => {
                  try {
                    const r = await api.demoStartLongJob();
                    const jid = r.job_id;
                    log(`Demo long job started: ${jid}`, "system");
                    const jr: JobRecord = { job_id: jid, status: "running", job_type: "diagnostic", result: null, metrics: null };
                    upsertJob(jr);
                    setActiveJobId(jid);
                    // immediately allow cancel in UI
                    toast("Long job running — click Cancel in Jobs list");
                  } catch { toast.error("demo long job unavailable") }
                }}>
                  Start Long Job (cancel me)
                </Button>
              </div>
              <div className="text-[10px] text-amber-400/60 mt-1">These mutate only the current backend session for demo purposes.</div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Device + Drift */}
          <Card className="xl:col-span-5 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Cpu className="h-4 w-4" /> Device State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!device && <div className="text-xs text-zinc-500">No snapshot. Backend must be running.</div>}
              {device && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant={isReady ? "default" : "destructive"} className="text-xs px-2 py-0.5">
                      {isReady ? "READY" : "CALIBRATION RECOMMENDED"}
                    </Badge>
                    <span className="text-xs text-zinc-400">{device.notes}</span>
                    {crossedReady && <Badge variant="default" className="text-[10px]">CROSSED 0.82</Badge>}
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] mb-1 text-zinc-400">
                      <div>Readiness</div><div className="tabular-nums">{device.readiness_score.toFixed(3)}</div>
                    </div>
                    <Progress value={readinessPct} className="h-1.5" />
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      Predicate: {device.readiness_predicate ? device.readiness_predicate.name : "all_qubits_readout_fidelity_above"} ≥ {device.readiness_predicate ? device.readiness_predicate.readout_fidelity_threshold : 0.82}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded border border-white/10 p-2 bg-black/30">
                      <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1"><ThermometerSun className="h-3 w-3" /> Temps (mK)</div>
                      {Object.entries(device.temperatures_mk).map(([q,t]) => <div key={q} className="tabular-nums">Q{q}: {t}</div>)}
                    </div>
                    <div className="rounded border border-white/10 p-2 bg-black/30">
                      <div className="text-[10px] text-zinc-500 mb-1">Readout Fidelity</div>
                      {Object.entries(device.readout_fidelity).map(([q,f]) => <div key={q} className="tabular-nums">Q{q}: {(f*100).toFixed(1)}%</div>)}
                    </div>
                  </div>

                  {/* Drift / Detuning - the lab problem */}
                  <div className="rounded border border-amber-900/40 bg-amber-950/20 p-2 text-xs">
                    <div className="text-amber-400 mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Hidden Detuning (Q0) — calibration is chasing a drifting target</div>
                    {detuning ? (
                      <div className="grid grid-cols-2 gap-x-4 tabular-nums text-amber-300/90">
                        <div>Δfreq: {detuning.frequency_error}</div>
                        <div>Δamp: {detuning.amplitude_error}</div>
                        <div>Δphase: {detuning.phase_error}</div>
                        <div>Δreadout: {detuning.readout_error_delta}</div>
                      </div>
                    ) : <div className="text-amber-400/60">Run a refresh or calibration to see current detuning.</div>}
                    <div className="text-[10px] text-amber-400/60 mt-1">True params perform a slow random walk + sine drift on every device read.</div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Metrics - the three that matter */}
          <Card className="xl:col-span-7 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4" /> Control-Plane Metrics</CardTitle>
              <CardDescription className="text-xs">time_to_calibrated • calibration_success_rate • interface_latency</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded border border-white/10 bg-zinc-950 p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">Avg Time to Calibrated</div>
                  <div className="text-2xl tabular-nums tracking-[-1px] font-semibold">{currentMetrics.timeToCal.toFixed(3)}<span className="text-xs text-zinc-500 ml-1">s</span></div>
                </div>
                <div className="rounded border border-white/10 bg-zinc-950 p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">Calibration Success Rate</div>
                  <div className="text-2xl tabular-nums tracking-[-1px] font-semibold">{(currentMetrics.successRate * 100).toFixed(1)}<span className="text-xs text-zinc-500 ml-1">%</span></div>
                  <div className="text-[10px] text-zinc-500">{currentMetrics.successes}/{currentMetrics.attempts} successes</div>
                </div>
                <div className="rounded border border-white/10 bg-zinc-950 p-3">
                  <div className="text-[10px] text-zinc-400 mb-1">Avg Interface Latency</div>
                  <div className="text-2xl tabular-nums tracking-[-1px] font-semibold">{currentMetrics.interfaceLatency.toFixed(4)}<span className="text-xs text-zinc-500 ml-1">s</span></div>
                  <div className="text-[10px] text-zinc-500">decision → backend ack</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fidelity climb - the calibration narrative */}
          <Card className="xl:col-span-5 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Calibration Fidelity Climb</CardTitle>
              <CardDescription className="text-xs">Real steps from the gradient-free loop. Threshold line shown.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!fidelityHistory.length && (
                <div className="h-40 flex items-center justify-center text-xs text-zinc-500 border border-dashed border-white/10 rounded">Run calibration to see trajectory.</div>
              )}
              {!!fidelityHistory.length && (
                <div className="h-44 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                      <XAxis dataKey="step" tick={{ fontSize: 10, fill: "#52525b" }} />
                      <YAxis domain={[0.55, 1.0]} tick={{ fontSize: 10, fill: "#52525b" }} />
                      <Tooltip contentStyle={{ background: "#111113", border: "1px solid #27272a", fontSize: 11 }} />
                      <ReferenceLine y={calThreshold} stroke="#f59e0b" strokeDasharray="3 2" label={{ value: "threshold", fill: "#f59e0b", fontSize: 10 }} />
                      <Line type="monotone" dataKey="fidelity" stroke="#10b981" strokeWidth={2} dot={{ r: 1.5, fill: "#10b981" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="text-xs flex items-center gap-4">
                <div>Latest: <span className="tabular-nums font-medium">{latestFidelity !== undefined ? latestFidelity.toFixed(5) : "—"}</span></div>
                <div>Threshold: <span className="tabular-nums">{calThreshold}</span></div>
                {lastCalParams && (
                  <div className="text-amber-400/80">last params f={lastCalParams.frequency?.toFixed(3)} a={lastCalParams.amplitude?.toFixed(3)}</div>
                )}
              </div>
              <div className="text-[10px] text-zinc-500">When fidelity ≥ threshold the service marks success. Device “ready” also requires average readout fidelity &gt; ~0.82.</div>
            </CardContent>
          </Card>

          {/* Agent / Orchestrator Traces - the real decisions */}
          <Card className="xl:col-span-7 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Play className="h-4 w-4" /> Execution Timeline (Real Traces)</CardTitle>
              <CardDescription className="text-xs">Orchestrator tool calls for the last goal. This is the control plane, not an LLM transcript.</CardDescription>
            </CardHeader>
            <CardContent>
              {!lastTraces.length && <div className="text-xs text-zinc-500 py-4 text-center border border-dashed border-white/10 rounded">Submit a goal or quick action to see tool traces.</div>}
              {!!lastTraces.length && (
                <div className="space-y-1 text-xs font-mono">
                  {lastTraces.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-white/10 bg-black/30 px-2 py-1">
                      <div className="w-36 shrink-0 text-zinc-400 tabular-nums">{new Date(t.ts * 1000).toLocaleTimeString()}</div>
                      <div className="w-40 shrink-0 font-medium text-emerald-400">{t.tool}</div>
                      <div className="flex-1 text-zinc-400 truncate">{JSON.stringify(t.args).slice(0, 90)}</div>
                      <div className="w-16 text-right tabular-nums text-zinc-400">{t.latency_s.toFixed(3)}s</div>
                      <Badge variant={t.ok ? "default" : "destructive"} className="text-[10px] px-1 py-0">{t.ok ? "OK" : "ERR"}</Badge>
                      <div className="w-44 text-right text-emerald-400/80 truncate">{t.summary}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[10px] text-zinc-500">Traces come from /traces and the last /goals response. They are the actual calls the orchestrator made.</div>
            </CardContent>
          </Card>

          {/* Jobs + History */}
          <Card className="xl:col-span-12 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Jobs (History via Backend)</CardTitle>
              <CardDescription className="text-xs">In-memory on backend (documented). Survives UI refresh while the process is up.</CardDescription>
            </CardHeader>
            <CardContent>
              {jobList.length === 0 && <div className="text-xs text-zinc-500 py-3 text-center border border-dashed border-white/10 rounded">No jobs yet.</div>}
              {jobList.length > 0 && (
                <div className="space-y-1 text-xs">
                  {jobList.slice(0, 12).map(j => (
                    <div key={j.job_id} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 bg-black/30">
                      <div className="font-mono text-[10px] text-zinc-400 w-44 truncate">{j.job_id}</div>
                      <Badge variant={j.status === "succeeded" ? "default" : j.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{j.status}</Badge>
                      <div className="text-zinc-400">{j.job_type}</div>
                      {((j.result as any)?.counts !== undefined) && <div className="text-emerald-400 font-mono">{JSON.stringify((j.result as any).counts)}</div>}
                      {j.error && <div className="text-red-400">{j.error}</div>}
                      {(j.status === "running" || j.status === "queued") && (
                        <Button size="sm" variant="ghost" className="h-6 ml-auto" onClick={() => cancelJob(j.job_id)}>
                          <X className="h-3 w-3 mr-1" /> cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity log */}
          <Card className="xl:col-span-12 bg-zinc-900 border-white/10">
            <CardHeader className="pb-1 pt-3"><CardTitle className="text-sm">Activity</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-28 rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px]">
                {history.slice().reverse().map((h, i) => (
                  <div key={i} className={h.kind === "error" ? "text-red-400" : h.kind === "goal" ? "text-emerald-400" : "text-zinc-400"}>
                    {new Date(h.ts).toLocaleTimeString()} — {h.message}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Alert className="border-white/10 bg-zinc-900 text-xs text-zinc-400">
          <AlertDescription>
            This is a control-plane prototype. The simulator has hidden drifting parameters; calibration chases them. All traces are real orchestrator calls. Swap the adapter for real hardware.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
