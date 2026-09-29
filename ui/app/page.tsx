"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Activity, Cpu, Target, Zap, Play, RefreshCw, Send, Clock,
  ThermometerSun, TrendingUp, AlertTriangle, X, Command as CommandIcon,
} from "lucide-react"
import { toast } from "sonner"
import { motion } from "motion/react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts"
import {
  api, setApiBase, getApiBase,
  type DeviceState, type JobRecord, type MetricsSnapshot, type ToolResult, type ToolTrace,
} from "@/lib/api"
import { useControlPlaneStore } from "@/lib/store"
import { CommandPalette, defaultCommandIcons, type CommandAction } from "@/components/command/command-palette"
import { MetricsCards } from "@/components/metrics-cards"
import { CalibrationSurfaceLazy } from "@/components/viz/calibration-surface-lazy"

interface FidelityPoint { iter: number; fidelity: number }
interface HistoryEntry { ts: number; message: string; kind: "goal" | "result" | "error" | "system" }

const READY_THRESHOLD = 0.82
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
  const [lastGoalResults, setLastGoalResults] = useState<ToolResult[] | null>(null)
  const [lastTraces, setLastTraces] = useState<ToolTrace[]>([])

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  const [fidelityHistory, setFidelityHistory] = useState<FidelityPoint[]>([])
  const [lastCalParams, setLastCalParams] = useState<Record<string, number> | null>(null)
  const [calThreshold, setCalThreshold] = useState(0.88)

  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)

  const [history, setHistory] = useState<HistoryEntry[]>([
    { ts: Date.now(), message: "Control plane ready. No LLM keys. Real traces only.", kind: "system" },
  ])

  const log = useCallback((message: string, kind: HistoryEntry["kind"] = "system") => {
    setHistory((h) => [...h.slice(-100), { ts: Date.now(), message, kind }])
  }, [])

  const updateApiBase = useCallback((base: string) => {
    setApiBaseState(base)
    setApiBase(base)
    setApiBaseLocal(base)
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
      if (ok) log(`Connected to ${target}`, "system")
      else toast.error("Backend unhealthy")
      return ok
    } catch {
      setConnected(false)
      setBackendDown(true)
      log(`Backend unreachable at ${target}`, "error")
      toast.error("Backend down", { description: `Cannot reach ${target}` })
      return false
    } finally {
      setChecking(false)
    }
  }, [apiBase, log, updateApiBase])

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
      log(`Device: ready=${d.is_ready} score=${d.readiness_score.toFixed(3)}`, "system")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "device fetch failed"
      log(`Device error: ${msg}`, "error")
      setBackendDown(true)
      toast.error("Backend down", { description: msg })
    } finally {
      setRefreshingDevice(false)
    }
  }, [log])

  const refreshMetrics = useCallback(async () => {
    try {
      const m = await api.getMetrics()
      setMetrics(m)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "metrics failed"
      log(`Metrics error: ${msg}`, "error")
    }
  }, [log])

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
      if (job.status === "cancelled") toast.message("Job cancelled", { description: job.job_id })
      if (job.status === "failed") toast.error("Job failed", { description: job.error || job.job_id })
      if (job.status === "succeeded") toast.success("Job succeeded", { description: job.job_id })
    }
  }, [])

  const pollJobOnce = useCallback(async (jobId: string) => {
    try {
      const j = await api.getJob(jobId)
      upsertJob(j)
      return j
    } catch (e: unknown) {
      log(`Job poll ${jobId}: ${e instanceof Error ? e.message : String(e)}`, "error")
      return null
    }
  }, [upsertJob, log])

  const startJobSSE = useCallback((jobId: string) => {
    const existing = eventSourcesRef.current[jobId]
    if (existing) existing.close()
    const url = api.sseJobUrl(jobId)
    try {
      const es = new EventSource(url)
      eventSourcesRef.current[jobId] = es
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            job_id?: string
            status?: JobRecord["status"]
            result?: Record<string, unknown> | null
            metrics?: Record<string, unknown> | null
            error?: string | null
          }
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
        } catch { /* ignore parse */ }
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
      log(`Cancel requested for ${jobId}`, "system")
      toast.message("Cancel requested", { description: jobId })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`Cancel failed: ${msg}`, "error")
      toast.error("Cancel failed", { description: msg })
    }
  }, [pollJobOnce, loadRecentJobs, log])

  const loadRecentTraces = useCallback(async () => {
    try {
      const { traces } = await api.getTraces()
      if (traces?.length) setLastTraces(traces.slice(-30))
    } catch { /* optional */ }
  }, [])

  const submitGoal = useCallback(async (raw: string) => {
    const goal = raw.trim()
    if (!goal) return
    setSubmittingGoal(true)
    setLastGoalResults(null)
    log(`→ ${goal}`, "goal")
    try {
      const resp = await api.postGoal(goal)
      setLastGoalResults(resp.results || [])
      if (resp.traces?.length) setLastTraces(resp.traces)

      let calOk: boolean | null = null
      for (const r of resp.results || []) {
        const data = r.data as Record<string, unknown> | undefined
        if (data && Array.isArray(data.history)) {
          const hist = (data.history as Array<[number, number]>).map(([it, f]) => ({
            iter: it,
            fidelity: f,
          }))
          if (hist.length) {
            setFidelityHistory(hist)
            if (typeof data.threshold === "number") setCalThreshold(data.threshold)
            if (data.params && typeof data.params === "object") {
              setLastCalParams(data.params as Record<string, number>)
            }
            if (typeof data.success === "boolean") calOk = data.success
            else if (typeof data.fidelity === "number") {
              calOk = (data.fidelity as number) >= (typeof data.threshold === "number" ? data.threshold : 0.88)
            }
          }
        }
        if (r.ok) {
          log(`✓ ${r.data ? JSON.stringify(r.data).slice(0, 120) : "ok"} (${r.latency_s.toFixed(3)}s)`, "result")
        } else {
          log(`✗ ${r.error || "failed"}`, "error")
        }
      }

      await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs(), loadRecentTraces()])

      if (calOk === true) toast.success("Calibration succeeded")
      else if (calOk === false) toast.error("Calibration failed", { description: "Did not reach fidelity threshold" })
      else toast.success("Goal executed")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "goal failed"
      log(`✗ ${msg}`, "error")
      setBackendDown(true)
      toast.error("Backend down / goal failed", { description: msg })
    } finally {
      setSubmittingGoal(false)
      setGoalInput("")
    }
  }, [log, refreshDevice, refreshMetrics, loadRecentJobs, loadRecentTraces])

  const runCalibrate = useCallback(async () => {
    await submitGoal("Bring qubit 0 to ready")
  }, [submitGoal])

  const runBell = useCallback(async () => {
    log("Quick: Bell pair 1024 shots", "goal")
    try {
      const res = await api.postBell(1024, [0, 1])
      if (res.job_id) {
        setActiveJobId(res.job_id)
        const jr: JobRecord = {
          job_id: res.job_id,
          status: "running",
          job_type: "circuit",
          result: null,
          metrics: null,
        }
        upsertJob(jr)
        startJobSSE(res.job_id)
        setTimeout(() => { void pollJobOnce(res.job_id) }, 500)
        setTimeout(() => { void pollJobOnce(res.job_id) }, 1400)
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
    }, 6500)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics, loadRecentJobs])

  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j || j.status !== "running") return
    const iv = setInterval(() => { void pollJobOnce(activeJobId) }, 850)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  const readinessPct = device ? Math.round(device.readiness_score * 100) : 0
  const isReady = !!device?.is_ready
  const latestFidelity = fidelityHistory.length
    ? fidelityHistory[fidelityHistory.length - 1].fidelity
    : undefined
  const crossedReady = latestFidelity !== undefined && latestFidelity >= READY_THRESHOLD

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

  const jobList = useMemo(
    () => Object.values(jobs).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")),
    [jobs],
  )

  const chartData = useMemo(
    () => fidelityHistory.map((p) => ({ step: p.iter, fidelity: p.fidelity, threshold: calThreshold })),
    [fidelityHistory, calThreshold],
  )

  const commandActions: CommandAction[] = useMemo(
    () => [
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
        run: async () => {
          await Promise.all([refreshDevice(), refreshMetrics(), loadRecentJobs(), loadRecentTraces()])
        },
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
            log("Demo: fidelity capped for next cal (will FAIL)", "system")
            toast.message("Next calibration will fail to reach threshold")
          } catch {
            toast.error("demo endpoint unavailable")
          }
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
            log(`Demo long job started: ${jid}`, "system")
            upsertJob({
              job_id: jid,
              status: "running",
              job_type: "diagnostic",
              result: null,
              metrics: null,
            })
            setActiveJobId(jid)
            toast.message("Long job running — click Cancel in Jobs list")
          } catch {
            toast.error("demo long job unavailable")
          }
        },
      },
    ],
    [submitGoal, runCalibrate, runBell, refreshDevice, refreshMetrics, loadRecentJobs, loadRecentTraces, log, upsertJob],
  )

  void lastGoalResults // retained for future detail panel

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <CommandPalette actions={commandActions} disabled={!connected && backendDown} />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-5 text-sm">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-emerald-500" />
              <div className="font-semibold tracking-[-0.3px]">Conductor QPU</div>
              <div className="text-[10px] text-zinc-500">Control Plane</div>
            </div>
            <Badge variant={connected ? "default" : "destructive"} className="px-1.5 py-0 text-[10px]">
              {connected ? "LIVE" : "OFFLINE"}
            </Badge>
            {backendDown && (
              <Badge variant="destructive" className="text-[10px]">BACKEND DOWN</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => setCommandOpen(true)}
            >
              <CommandIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Commands</span>
              <kbd className="rounded border border-white/10 px-1 text-[10px] text-zinc-500">⌘K</kbd>
            </Button>
            <div className="hidden text-zinc-500 md:block">API</div>
            <Input
              className="h-7 w-56 border-white/10 bg-zinc-900 font-mono text-xs"
              value={apiBase}
              onChange={(e) => updateApiBase(e.target.value)}
              onBlur={() => { void checkConnection(apiBase) }}
              onKeyDown={(e) => { if (e.key === "Enter") void checkConnection(apiBase) }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => { void checkConnection() }}
              disabled={checking}
              className="h-7"
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              Ping
            </Button>
            <div className="hidden border-l border-white/10 pl-3 text-[10px] text-zinc-500 lg:block">
              Offline · No LLM keys · Real traces
            </div>
          </div>
        </div>
      </header>

      {backendDown && (
        <div className="border-b border-red-900/50 bg-red-950/60">
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-2 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Cannot reach backend. Start with{" "}
            <span className="font-mono">make run-api</span> in another shell.
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: easeOut }}
        >
          <Card className="border-white/10 bg-zinc-900">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" /> Goal / Command Bar
              </CardTitle>
              <CardDescription className="text-xs">
                Natural language → deterministic planner → orchestrator tools. Press ⌘K for the palette (no open animation).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  className="h-9 border-white/10 bg-zinc-950 font-mono"
                  placeholder='e.g. "Bring qubit 0 to ready" or "Run a Bell pair and report fidelity"'
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !submittingGoal) void submitGoal(goalInput)
                  }}
                  disabled={submittingGoal || !connected}
                />
                <Button
                  onClick={() => { void submitGoal(goalInput) }}
                  disabled={submittingGoal || !goalInput.trim() || !connected}
                  className="h-9 active:scale-[0.97] transition-transform duration-100"
                >
                  <Send className="mr-2 h-4 w-4" /> Execute
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { void runCalibrate() }}
                  disabled={!connected}
                  className="active:scale-[0.97] transition-transform duration-100"
                >
                  <Target className="mr-1.5 h-3.5 w-3.5" /> Calibrate Q0 → 0.88
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { void runBell() }}
                  disabled={!connected}
                  className="active:scale-[0.97] transition-transform duration-100"
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" /> Bell 1024
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { void refreshDevice() }}
                  disabled={refreshingDevice}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshingDevice ? "animate-spin" : ""}`} /> Device
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void refreshMetrics()
                    void loadRecentJobs()
                    void loadRecentTraces()
                  }}
                >
                  <Activity className="mr-1.5 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>

              <div className="mt-2 border-t border-white/10 pt-1">
                <div className="mb-1 text-[10px] uppercase tracking-widest text-amber-400/70">
                  Founder demo guardrails (reproducible failure + cancel)
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-900/50 text-amber-300 hover:bg-amber-950/30"
                    onClick={async () => {
                      try {
                        await api.demoForceFailNextCal()
                        log("Demo: fidelity capped for next cal (will FAIL)", "system")
                        toast.message("Next calibration will fail to reach threshold")
                      } catch {
                        toast.error("demo endpoint unavailable")
                      }
                    }}
                  >
                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> Force Fail Next Cal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-900/50 text-amber-300 hover:bg-amber-950/30"
                    onClick={async () => {
                      try {
                        const r = await api.demoStartLongJob()
                        const jid = r.job_id
                        log(`Demo long job started: ${jid}`, "system")
                        upsertJob({
                          job_id: jid,
                          status: "running",
                          job_type: "diagnostic",
                          result: null,
                          metrics: null,
                        })
                        setActiveJobId(jid)
                        toast.message("Long job running — click Cancel in Jobs list")
                      } catch {
                        toast.error("demo long job unavailable")
                      }
                    }}
                  >
                    Start Long Job (cancel me)
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-amber-400/60">
                  These mutate only the current backend session for demo purposes.
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* Device */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-5">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cpu className="h-4 w-4" /> Device State
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!device && (
                <div className="text-xs text-zinc-500">No snapshot. Backend must be running.</div>
              )}
              {device && (
                <>
                  <div className="flex items-center gap-2">
                    <Badge variant={isReady ? "default" : "destructive"} className="px-2 py-0.5 text-xs">
                      {isReady ? "READY" : "CALIBRATION RECOMMENDED"}
                    </Badge>
                    <span className="text-xs text-zinc-400">{device.notes}</span>
                    {crossedReady && (
                      <Badge variant="default" className="text-[10px]">CROSSED 0.82</Badge>
                    )}
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                      <div>Readiness</div>
                      <div className="tabular-nums">{device.readiness_score.toFixed(3)}</div>
                    </div>
                    <Progress value={readinessPct} className="h-1.5" />
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      Predicate:{" "}
                      {device.readiness_predicate
                        ? device.readiness_predicate.name
                        : "all_qubits_readout_fidelity_above"}{" "}
                      ≥{" "}
                      {device.readiness_predicate
                        ? device.readiness_predicate.readout_fidelity_threshold
                        : 0.82}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded border border-white/10 bg-black/30 p-2">
                      <div className="mb-1 flex items-center gap-1 text-[10px] text-zinc-500">
                        <ThermometerSun className="h-3 w-3" /> Temps (mK)
                      </div>
                      {Object.entries(device.temperatures_mk).map(([q, t]) => (
                        <div key={q} className="tabular-nums">Q{q}: {t}</div>
                      ))}
                    </div>
                    <div className="rounded border border-white/10 bg-black/30 p-2">
                      <div className="mb-1 text-[10px] text-zinc-500">Readout Fidelity</div>
                      {Object.entries(device.readout_fidelity).map(([q, f]) => (
                        <div key={q} className="tabular-nums">Q{q}: {(f * 100).toFixed(1)}%</div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded border border-amber-900/40 bg-amber-950/20 p-2 text-xs">
                    <div className="mb-1 flex items-center gap-1 text-amber-400">
                      <TrendingUp className="h-3 w-3" /> Hidden Detuning (Q0) — calibration chasing a drifting target
                    </div>
                    {detuning ? (
                      <div className="grid grid-cols-2 gap-x-4 tabular-nums text-amber-300/90">
                        <div>Δfreq: {detuning.frequency_error}</div>
                        <div>Δamp: {detuning.amplitude_error}</div>
                        <div>Δphase: {detuning.phase_error}</div>
                        <div>Δreadout: {detuning.readout_error_delta}</div>
                      </div>
                    ) : (
                      <div className="text-amber-400/60">
                        Run a refresh or calibration to see current detuning.
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-amber-400/60">
                      True params perform a slow random walk + sine drift on every device read.
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Metrics */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-7">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4" /> Control-Plane Metrics
              </CardTitle>
              <CardDescription className="text-xs">
                time_to_calibrated · calibration_success_rate · interface_latency — NumberFlow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MetricsCards
                timeToCal={currentMetrics.timeToCal}
                successRate={currentMetrics.successRate}
                interfaceLatency={currentMetrics.interfaceLatency}
                successes={currentMetrics.successes}
                attempts={currentMetrics.attempts}
              />
            </CardContent>
          </Card>

          {/* WebGPU surface */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-7">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4" /> Param Drift Surface (WebGPU)
              </CardTitle>
              <CardDescription className="text-xs">
                Live fidelity landscape over Δfreq × Δamp. Cyan = hidden true target from{" "}
                <span className="font-mono">/device/detuning</span>; amber = applied calibration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <CalibrationSurfaceLazy
                  detuning={detuning}
                  applied={appliedParams || lastCalParams}
                  fidelityHistory={fidelityHistory}
                  readinessScore={device?.readiness_score ?? 0.7}
                  readoutFidelity={device?.readout_fidelity ?? null}
                />
              </div>
            </CardContent>
          </Card>

          {/* Fidelity climb */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-5">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Target className="h-4 w-4" /> Calibration Fidelity Climb
              </CardTitle>
              <CardDescription className="text-xs">
                Real steps from the gradient-free loop. Threshold line shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!fidelityHistory.length && (
                <div className="flex h-40 items-center justify-center rounded border border-dashed border-white/10 text-xs text-zinc-500">
                  Run calibration to see trajectory.
                </div>
              )}
              {!!fidelityHistory.length && (
                <div className="h-44 -mx-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#27272a" />
                      <XAxis dataKey="step" tick={{ fontSize: 10, fill: "#52525b" }} />
                      <YAxis domain={[0.55, 1.0]} tick={{ fontSize: 10, fill: "#52525b" }} />
                      <Tooltip
                        contentStyle={{
                          background: "#111113",
                          border: "1px solid #27272a",
                          fontSize: 11,
                        }}
                      />
                      <ReferenceLine
                        y={calThreshold}
                        stroke="#f59e0b"
                        strokeDasharray="3 2"
                        label={{ value: "threshold", fill: "#f59e0b", fontSize: 10 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="fidelity"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 1.5, fill: "#10b981" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex items-center gap-4 text-xs">
                <div>
                  Latest:{" "}
                  <span className="font-medium tabular-nums">
                    {latestFidelity !== undefined ? latestFidelity.toFixed(5) : "—"}
                  </span>
                </div>
                <div>
                  Threshold: <span className="tabular-nums">{calThreshold}</span>
                </div>
                {lastCalParams && (
                  <div className="text-amber-400/80">
                    last params f={lastCalParams.frequency?.toFixed(3)} a=
                    {lastCalParams.amplitude?.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-zinc-500">
                When fidelity ≥ threshold the service marks success. Device “ready” also requires
                average readout fidelity &gt; ~0.82.
              </div>
            </CardContent>
          </Card>

          {/* Traces */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-12">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Play className="h-4 w-4" /> Execution Timeline (Real Traces)
              </CardTitle>
              <CardDescription className="text-xs">
                Orchestrator tool calls for the last goal. This is the control plane, not an LLM transcript.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!lastTraces.length && (
                <div className="rounded border border-dashed border-white/10 py-4 text-center text-xs text-zinc-500">
                  Submit a goal or quick action to see tool traces.
                </div>
              )}
              {!!lastTraces.length && (
                <div className="space-y-1 font-mono text-xs">
                  {lastTraces.map((t, i) => (
                    <div
                      key={`${t.ts}-${t.tool}-${i}`}
                      className="flex items-start gap-2 rounded border border-white/10 bg-black/30 px-2 py-1"
                    >
                      <div className="w-36 shrink-0 tabular-nums text-zinc-400">
                        {new Date(t.ts * 1000).toLocaleTimeString()}
                      </div>
                      <div className="w-40 shrink-0 font-medium text-emerald-400">{t.tool}</div>
                      <div className="flex-1 truncate text-zinc-400">
                        {JSON.stringify(t.args).slice(0, 90)}
                      </div>
                      <div className="w-16 text-right tabular-nums text-zinc-400">
                        {t.latency_s.toFixed(3)}s
                      </div>
                      <Badge
                        variant={t.ok ? "default" : "destructive"}
                        className="px-1 py-0 text-[10px]"
                      >
                        {t.ok ? "OK" : "ERR"}
                      </Badge>
                      <div className="w-44 truncate text-right text-emerald-400/80">{t.summary}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[10px] text-zinc-500">
                Traces come from /traces and the last /goals response.
              </div>
            </CardContent>
          </Card>

          {/* Jobs */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-12">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" /> Jobs (History via Backend)
              </CardTitle>
              <CardDescription className="text-xs">
                In-memory on backend (documented). Survives UI refresh while the process is up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobList.length === 0 && (
                <div className="rounded border border-dashed border-white/10 py-3 text-center text-xs text-zinc-500">
                  No jobs yet.
                </div>
              )}
              {jobList.length > 0 && (
                <div className="space-y-1 text-xs">
                  {jobList.slice(0, 12).map((j) => {
                    const counts =
                      j.result && typeof j.result === "object" && "counts" in j.result
                        ? (j.result as { counts: unknown }).counts
                        : undefined
                    return (
                      <div
                        key={j.job_id}
                        className="flex items-center gap-2 rounded border border-white/10 bg-black/30 px-2 py-1"
                      >
                        <div className="w-44 truncate font-mono text-[10px] text-zinc-400">
                          {j.job_id}
                        </div>
                        <Badge
                          variant={
                            j.status === "succeeded"
                              ? "default"
                              : j.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {j.status}
                        </Badge>
                        <div className="text-zinc-400">{j.job_type}</div>
                        {counts !== undefined && (
                          <div className="font-mono text-emerald-400">{JSON.stringify(counts)}</div>
                        )}
                        {j.error && <div className="text-red-400">{j.error}</div>}
                        {(j.status === "running" || j.status === "queued") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6"
                            onClick={() => { void cancelJob(j.job_id) }}
                          >
                            <X className="mr-1 h-3 w-3" /> cancel
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card className="border-white/10 bg-zinc-900 xl:col-span-12">
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-sm">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-28 rounded border border-white/10 bg-black/40 p-2 font-mono text-[11px]">
                {history.slice().reverse().map((h, i) => (
                  <div
                    key={`${h.ts}-${i}`}
                    className={
                      h.kind === "error"
                        ? "text-red-400"
                        : h.kind === "goal"
                          ? "text-emerald-400"
                          : "text-zinc-400"
                    }
                  >
                    {new Date(h.ts).toLocaleTimeString()} — {h.message}
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <Alert className="border-white/10 bg-zinc-900 text-xs text-zinc-400">
          <AlertDescription>
            Control-plane prototype with Emil Kowalski stack (cmdk · Sonner · NumberFlow · motion ·
            next-themes · zustand · leva) and a WebGPU param-drift surface via three + R3F. Simulator
            has hidden drifting parameters; calibration chases them. Swap the adapter for real hardware.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}
