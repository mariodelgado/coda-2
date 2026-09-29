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
  Activity, 
  Cpu, 
  Target, 
  Zap, 
  Play, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ThermometerSun
} from "lucide-react"
import { toast } from "sonner"
import { api, type DeviceState, type JobRecord, type MetricsSnapshot, type ToolResult } from "@/lib/api"

interface FidelityPoint {
  iter: number
  fidelity: number
}

interface HistoryEntry {
  ts: number
  message: string
  kind: "goal" | "result" | "error" | "system"
}

const DEFAULT_API = "http://localhost:8000"

export default function ConductorQPUControlPlane() {
  // Connection
  const [apiBase, setApiBase] = useState<string>(DEFAULT_API)
  const [connected, setConnected] = useState<boolean>(false)
  const [checking, setChecking] = useState<boolean>(false)

  // Device & State
  const [device, setDevice] = useState<DeviceState | null>(null)
  const [refreshingDevice, setRefreshingDevice] = useState(false)

  // Goals / Command bar
  const [goalInput, setGoalInput] = useState("")
  const [submittingGoal, setSubmittingGoal] = useState(false)
  const [lastGoalResults, setLastGoalResults] = useState<ToolResult[] | null>(null)

  // Live jobs
  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  // Calibration visualization
  const [fidelityHistory, setFidelityHistory] = useState<FidelityPoint[]>([])
  const [calibrating, setCalibrating] = useState(false)

  // Metrics
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [refreshingMetrics, setRefreshingMetrics] = useState(false)

  // Activity log
  const [history, setHistory] = useState<HistoryEntry[]>([
    { ts: Date.now(), message: "Control plane initialized. API target: " + DEFAULT_API, kind: "system" },
  ])

  const log = useCallback((message: string, kind: HistoryEntry["kind"] = "system") => {
    setHistory((h) => [...h.slice(-80), { ts: Date.now(), message, kind }])
  }, [])

  // ---------- Connection ----------
  const checkConnection = useCallback(async (base?: string) => {
    const target = base || apiBase
    setChecking(true)
    try {
      // Temporarily override for health check by using raw fetch
      const res = await fetch(`${target}/health`, { cache: "no-store" })
      if (!res.ok) throw new Error("not ok")
      const data = await res.json()
      setConnected(data?.status === "ok")
      log(`Connected to API at ${target}`, "system")
      return true
    } catch {
      setConnected(false)
      log(`Failed to reach API at ${target}`, "error")
      return false
    } finally {
      setChecking(false)
    }
  }, [apiBase, log])

  // ---------- Device ----------
  const refreshDevice = useCallback(async () => {
    setRefreshingDevice(true)
    try {
      const d = await api.deviceState()
      setDevice(d)
      log(`Device state updated (ready=${d.is_ready}, score=${d.readiness_score.toFixed(3)})`, "system")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "device fetch failed"
      log(`Device refresh failed: ${msg}`, "error")
      toast.error("Failed to fetch device state")
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
      const msg = e instanceof Error ? e.message : "metrics fetch failed"
      log(`Metrics refresh failed: ${msg}`, "error")
    } finally {
      setRefreshingMetrics(false)
    }
  }, [log])

  // ---------- Jobs (polling + SSE) ----------
  const upsertJob = useCallback((job: JobRecord) => {
    setJobs((prev) => ({ ...prev, [job.job_id]: job }))
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      // close any open SSE
      const es = eventSourcesRef.current[job.job_id]
      if (es) {
        es.close()
        delete eventSourcesRef.current[job.job_id]
      }
    }
  }, [])

  const pollJobOnce = useCallback(async (jobId: string) => {
    try {
      const j = await api.getJob(jobId)
      upsertJob(j)
      return j
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      log(`Job poll error for ${jobId}: ${msg}`, "error")
      return null
    }
  }, [upsertJob, log])

  const startJobSSE = useCallback((jobId: string) => {
    // Close existing
    const existing = eventSourcesRef.current[jobId]
    if (existing) existing.close()

    const url = api.sseJobUrl(jobId)
    try {
      const es = new EventSource(url)
      eventSourcesRef.current[jobId] = es

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data)
          if (data?.job_id) {
            const jr: JobRecord = {
              job_id: data.job_id,
              status: (data.status as JobRecord["status"]) || "running",
              job_type: "circuit",
              result: data.result || null,
              metrics: data.metrics || null,
              error: data.error || null,
            }
            upsertJob(jr)
          }
        } catch {
          // ignore non-json
        }
      }

      es.onerror = () => {
        // Fallback to polling if SSE drops
        es.close()
        delete eventSourcesRef.current[jobId]
        // start light polling
        const iv = setInterval(async () => {
          const j = await pollJobOnce(jobId)
          if (j && (j.status === "succeeded" || j.status === "failed" || j.status === "cancelled")) {
            clearInterval(iv)
          }
        }, 800)
      }
    } catch {
      // SSE not available; rely on polling
      const iv = setInterval(async () => {
        const j = await pollJobOnce(jobId)
        if (j && (j.status === "succeeded" || j.status === "failed" || j.status === "cancelled")) {
          clearInterval(iv)
        }
      }, 700)
    }
  }, [upsertJob, pollJobOnce])

  // ---------- Goal execution ----------
  const submitGoal = useCallback(async (raw: string) => {
    const goal = raw.trim()
    if (!goal) return
    setSubmittingGoal(true)
    setLastGoalResults(null)
    log(`→ ${goal}`, "goal")
    try {
      const resp = await api.postGoal(goal)
      setLastGoalResults(resp.results)
      // Record any calibration history if present in results
      for (const r of resp.results) {
        const data = r.data as Record<string, unknown> | undefined
        if (data && Array.isArray(data.history)) {
          const hist = (data.history as Array<[number, number]>).map(([it, f]) => ({ iter: it, fidelity: f }))
          if (hist.length) setFidelityHistory(hist)
        }
        if (r.ok) {
          log(`✓ ${r.data ? JSON.stringify(r.data).slice(0, 140) : "ok"}  (${r.latency_s.toFixed(3)}s)`, "result")
        } else {
          log(`✗ ${r.error || "failed"}`, "error")
        }
      }
      // Refresh supporting views
      await Promise.all([refreshDevice(), refreshMetrics()])
      toast.success("Goal completed")
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "goal failed"
      log(`✗ ${msg}`, "error")
      toast.error(msg)
    } finally {
      setSubmittingGoal(false)
      setGoalInput("")
    }
  }, [log, refreshDevice, refreshMetrics])

  // ---------- Quick actions ----------
  const runCalibrate = useCallback(async () => {
    setCalibrating(true)
    setFidelityHistory([])
    log("Quick action: Calibrate qubit 0 (target 0.88)", "goal")
    try {
      const res = await api.postCalibrate(0, 0.88)
      const hist: FidelityPoint[] = (res.history || []).map(([it, f]) => ({ iter: it, fidelity: f }))
      setFidelityHistory(hist.length ? hist : [{ iter: res.iterations, fidelity: res.fidelity }])
      log(`Calibration → fidelity=${res.fidelity.toFixed(4)} iters=${res.iterations}`, "result")
      toast.success(`Calibrated • ${res.fidelity.toFixed(4)} fidelity`)
      await Promise.all([refreshDevice(), refreshMetrics()])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "calibration failed"
      log(`Calibration error: ${msg}`, "error")
      toast.error(msg)
    } finally {
      setCalibrating(false)
    }
  }, [log, refreshDevice, refreshMetrics])

  const runBell = useCallback(async () => {
    log("Quick action: Run Bell pair (1024 shots)", "goal")
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
        // Also poll a couple times in case SSE path is slow
        setTimeout(() => pollJobOnce(res.job_id), 400)
        setTimeout(() => pollJobOnce(res.job_id), 1200)
      }
      if (res.counts) {
        log(`Bell counts: ${JSON.stringify(res.counts)}`, "result")
      }
      toast.success("Bell circuit submitted")
      await refreshMetrics()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "bell failed"
      log(`Bell error: ${msg}`, "error")
      toast.error(msg)
    }
  }, [log, upsertJob, startJobSSE, pollJobOnce, refreshMetrics])

  // ---------- Effects ----------
  // Initial connection + bootstrap
  useEffect(() => {
    checkConnection().then((ok) => {
      if (ok) {
        refreshDevice()
        refreshMetrics()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep device/metrics lightly fresh while idle
  useEffect(() => {
    const id = setInterval(() => {
      if (connected) {
        refreshDevice()
        refreshMetrics()
      }
    }, 8000)
    return () => clearInterval(id)
  }, [connected, refreshDevice, refreshMetrics])

  // Poll active job if SSE not attached
  useEffect(() => {
    if (!activeJobId) return
    const j = jobs[activeJobId]
    if (!j) return
    if (j.status !== "running") return
    const iv = setInterval(() => {
      pollJobOnce(activeJobId)
    }, 900)
    return () => clearInterval(iv)
  }, [activeJobId, jobs, pollJobOnce])

  // Derived
  const readinessPct = device ? Math.round(device.readiness_score * 100) : 0
  const latestFidelity = fidelityHistory.length ? fidelityHistory[fidelityHistory.length - 1].fidelity : undefined
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

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Top nav */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-emerald-500" />
              <div>
                <div className="font-semibold tracking-tight">Conductor QPU</div>
                <div className="text-[10px] text-zinc-500 -mt-1">Control Plane</div>
              </div>
            </div>
            <Badge variant={connected ? "default" : "destructive"} className="ml-2">
              {connected ? "connected" : "disconnected"}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <div className="hidden md:block">API</div>
            <Input
              className="h-7 w-[260px] bg-zinc-900 border-white/10 text-xs font-mono"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              onBlur={() => checkConnection(apiBase)}
              onKeyDown={(e) => e.key === "Enter" && checkConnection(apiBase)}
            />
            <Button size="sm" variant="outline" onClick={() => checkConnection()} disabled={checking}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${checking ? "animate-spin" : ""}`} />
              Check
            </Button>
            <div className="pl-3 border-l border-white/10 text-[10px] text-zinc-500">No LLM keys required • offline demo</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Command bar */}
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> Goal / Command
            </CardTitle>
            <CardDescription>
              Natural language goals are routed through the deterministic planner to the orchestrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                className="font-mono bg-zinc-950 border-white/10"
                placeholder='e.g. "Bring qubit 0 to ready" or "Run a Bell pair and report fidelity"'
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submittingGoal) submitGoal(goalInput)
                }}
                disabled={submittingGoal || !connected}
              />
              <Button onClick={() => submitGoal(goalInput)} disabled={submittingGoal || !goalInput.trim() || !connected}>
                <Send className="h-4 w-4 mr-2" /> Submit
              </Button>
            </div>

            {/* Quick actions */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={runCalibrate} disabled={calibrating || !connected}>
                <Target className="h-4 w-4 mr-2" /> Calibrate Qubit 0
              </Button>
              <Button variant="secondary" onClick={runBell} disabled={!connected}>
                <Zap className="h-4 w-4 mr-2" /> Run Bell Pair (1024)
              </Button>
              <Button variant="ghost" onClick={refreshDevice} disabled={refreshingDevice}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshingDevice ? "animate-spin" : ""}`} /> Refresh Device
              </Button>
              <Button variant="ghost" onClick={refreshMetrics} disabled={refreshingMetrics}>
                <Activity className="h-4 w-4 mr-2" /> Refresh Metrics
              </Button>
            </div>

            {lastGoalResults && lastGoalResults.length > 0 && (
              <div className="mt-3 text-xs text-zinc-400">
                Last goal produced {lastGoalResults.length} step(s). See Results tab for details.
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Device State */}
          <Card className="lg:col-span-5 bg-zinc-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" /> Device State
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!device && (
                <div className="text-sm text-zinc-400">No device snapshot yet. Click Refresh Device.</div>
              )}
              {device && (
                <>
                  <div className="flex items-center gap-3">
                    <Badge variant={device.is_ready ? "default" : "destructive"} className="text-sm px-3 py-1">
                      {device.is_ready ? "READY" : "CALIBRATION RECOMMENDED"}
                    </Badge>
                    <div className="text-sm text-zinc-400">{device.notes}</div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <div className="text-zinc-400">Readiness Score</div>
                      <div className="font-mono tabular-nums">{device.readiness_score.toFixed(3)}</div>
                    </div>
                    <Progress value={readinessPct} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-md border border-white/10 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1">
                        <ThermometerSun className="h-3 w-3" /> Temperatures (mK)
                      </div>
                      <div className="font-mono text-sm">
                        {Object.entries(device.temperatures_mk).map(([q, t]) => (
                          <div key={q}>Q{q}: {t}</div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Readout Fidelity</div>
                      <div className="font-mono text-sm">
                        {Object.entries(device.readout_fidelity).map(([q, f]) => (
                          <div key={q}>Q{q}: {(f * 100).toFixed(2)}%</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500">
                    Coherence (T1/T2 µs):{" "}
                    {Object.entries(device.coherence_us)
                      .map(([q, [t1, t2]]) => `Q${q}=${t1}/${t2}`)
                      .join("  ")}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Metrics Dashboard */}
          <Card className="lg:col-span-7 bg-zinc-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" /> Metrics
              </CardTitle>
              <CardDescription>
                time_to_calibrated • calibration_success_rate • interface_latency
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  label="Avg Time to Calibrated"
                  value={currentMetrics.timeToCal.toFixed(3)}
                  unit="s"
                  icon={<Clock className="h-4 w-4" />}
                />
                <MetricCard
                  label="Calibration Success Rate"
                  value={(currentMetrics.successRate * 100).toFixed(1)}
                  unit="%"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  sub={`${currentMetrics.successes}/${currentMetrics.attempts} successes`}
                />
                <MetricCard
                  label="Avg Interface Latency"
                  value={currentMetrics.interfaceLatency.toFixed(4)}
                  unit="s"
                  icon={<Zap className="h-4 w-4" />}
                />
              </div>

              <div className="mt-4 text-[10px] text-zinc-500">
                Additional signals from orchestrator/adapter are available in the raw metrics payload.
              </div>
            </CardContent>
          </Card>

          {/* Fidelity climb visualization */}
          <Card className="lg:col-span-5 bg-zinc-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> Calibration Fidelity Climb
              </CardTitle>
              <CardDescription>Most recent calibration trajectory</CardDescription>
            </CardHeader>
            <CardContent>
              {fidelityHistory.length === 0 && (
                <div className="h-40 flex items-center justify-center text-sm text-zinc-500 border border-dashed border-white/10 rounded">
                  Run a calibration (goal or quick action) to see fidelity climb.
                </div>
              )}
              {fidelityHistory.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl font-semibold tabular-nums tracking-tighter">
                      {latestFidelity !== undefined ? latestFidelity.toFixed(4) : "—"}
                    </div>
                    <div className="text-xs text-zinc-500">latest fidelity</div>
                  </div>

                  <div className="h-2 w-full bg-white/10 rounded overflow-hidden">
                    <div
                      className="h-2 bg-emerald-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, (latestFidelity || 0) * 100))}%` }}
                    />
                  </div>

                  <div className="pt-2">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">History</div>
                    <ScrollArea className="h-28 border border-white/10 rounded p-2 font-mono text-xs bg-black/40">
                      {fidelityHistory.map((p, i) => (
                        <div key={i} className="tabular-nums">
                          iter {p.iter.toString().padStart(2)} → {p.fidelity.toFixed(5)}
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Jobs + Results */}
          <Card className="lg:col-span-7 bg-zinc-900 border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="h-4 w-4" /> Jobs & Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="jobs" className="w-full">
                <TabsList className="bg-zinc-950">
                  <TabsTrigger value="jobs">Live Jobs</TabsTrigger>
                  <TabsTrigger value="results">Last Goal Results</TabsTrigger>
                </TabsList>

                <TabsContent value="jobs" className="mt-3">
                  {jobList.length === 0 && (
                    <div className="text-sm text-zinc-500 py-6 text-center border border-dashed border-white/10 rounded">
                      No jobs yet. Run the Bell pair quick action or submit a goal that triggers a circuit job.
                    </div>
                  )}
                  {jobList.length > 0 && (
                    <div className="space-y-2">
                      {jobList.map((j) => (
                        <div key={j.job_id} className="rounded border border-white/10 p-3 text-sm job-row">
                          <div className="flex items-center justify-between">
                            <div className="font-mono text-xs truncate pr-3">{j.job_id}</div>
                            <Badge
                              variant={
                                j.status === "succeeded" ? "default" :
                                j.status === "failed" ? "destructive" :
                                j.status === "cancelled" ? "outline" : "secondary"
                              }
                            >
                              {j.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-zinc-400 mt-1 flex items-center gap-3">
                            <span>type: {j.job_type}</span>
                            {j.metrics && (
                              <span className="font-mono">metrics: {JSON.stringify(j.metrics as Record<string, unknown>).slice(0, 80)}</span>
                            )}
                          </div>
                          {j.result && Boolean((j.result as Record<string, unknown>).counts) && (
                            <div className="mt-1 text-xs font-mono text-emerald-400">
                              counts: {JSON.stringify((j.result as Record<string, unknown>).counts)}
                            </div>
                          )}
                          {j.error && <div className="text-red-400 text-xs mt-1">{j.error}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="results" className="mt-3">
                  {!lastGoalResults || lastGoalResults.length === 0 ? (
                    <div className="text-sm text-zinc-500 py-6 text-center border border-dashed border-white/10 rounded">
                      Submit a goal to see orchestrator tool results here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lastGoalResults.map((r, idx) => (
                        <div key={idx} className="rounded border border-white/10 p-3 text-sm">
                          <div className="flex items-center gap-2">
                            {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            <span className="font-medium">step {idx + 1}</span>
                            <span className="text-xs text-zinc-500">latency {r.latency_s.toFixed(4)}s</span>
                          </div>
                          <pre className="mt-2 text-xs bg-black/40 p-2 rounded overflow-auto">{JSON.stringify(r.data, null, 2)}</pre>
                          {r.error && <div className="text-red-400 mt-1 text-xs">{r.error}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="lg:col-span-12 bg-zinc-900 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-40 rounded border border-white/10 bg-black/40 p-3 font-mono text-xs">
                {history.slice().reverse().map((h, i) => (
                  <div key={i} className={h.kind === "error" ? "text-red-400" : h.kind === "goal" ? "text-emerald-400" : "text-zinc-400"}>
                    {new Date(h.ts).toLocaleTimeString()} — {h.message}
                  </div>
                ))}
              </ScrollArea>
              <div className="text-[10px] text-zinc-500 mt-2">Local log. Does not persist across reloads.</div>
            </CardContent>
          </Card>
        </div>

        <Alert className="border-white/10 bg-zinc-900">
          <AlertDescription className="text-xs text-zinc-400">
            This is a control-plane prototype. The noisy simulator backend emulates drift and calibration effects.
            Swap the adapter implementation for real hardware without changing the orchestrator, API, or UI.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  unit,
  icon,
  sub,
}: {
  label: string
  value: string
  unit?: string
  icon?: React.ReactNode
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <div className="text-2xl font-semibold tabular-nums tracking-tighter">{value}</div>
        {unit && <div className="text-xs text-zinc-500">{unit}</div>}
      </div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}
