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
import { CryostatPlate } from "@/components/viz/cryostat-plate"
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

/** Bell quality from job metrics: estimated_fidelity, else P(00)+P(11). */
function bellMetricsFromResults(results: unknown[]): { fidelity: number; shots?: number } | null {
  for (const raw of results || []) {
    const r = raw as { data?: Record<string, unknown> } | null
    const d = (r?.data || {}) as Record<string, unknown>
    const m = (d.metrics && typeof d.metrics === "object" ? d.metrics : {}) as Record<string, unknown>
    const counts = d.counts as Record<string, number> | undefined
    let fidelity: number | undefined
    if (typeof m.estimated_fidelity === "number") {
      fidelity = m.estimated_fidelity
    } else if (counts && typeof counts === "object") {
      const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0) || 1
      fidelity = (Number(counts["00"] || 0) + Number(counts["11"] || 0)) / Number(total)
    }
    if (fidelity == null || Number.isNaN(fidelity)) continue
    const shotsRaw = m.shots ?? d.shots
    const shots = typeof shotsRaw === "number" ? shotsRaw : undefined
    return { fidelity, shots }
  }
  return null
}

export default function QuantumChatInstrument() {
  const setCommandOpen = useControlPlaneStore((s) => s.setCommandOpen)

  const [apiBase, setApiBaseState] = useState<string>(getApiBase())
  const [connected, setConnected] = useState(false)
  const [backendDown, setBackendDown] = useState(false)

  const [device, setDevice] = useState<DeviceState | null>(null)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)
  const [appliedParams, setAppliedParams] = useState<any>(null)
  const [metrics, setMetrics] = useState<any>(null)
  // Peer side-by-side stage: drift landscape (left) and 3D device (right) share the stage equally.

  const [turns, setTurns] = useState<Turn[]>([])
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})

  // Resizable stage split (iPadOS Split View style) — three panes left→mid→right.
  // Stored as fr units. Two 14px splitter tracks are fixed and excluded from fr math.
  // Default roughly equal thirds (~34/33/33). Enforce ~22–28% minimum per pane.
  const [leftFr, setLeftFr] = React.useState<number>(1.02)
  const [midFr, setMidFr] = React.useState<number>(1.0)
  const [rightFr, setRightFr] = React.useState<number>(1.0)
  const [isDraggingSplit, setIsDraggingSplit] = React.useState(false)
  const stageRef = React.useRef<HTMLDivElement | null>(null)
  // Drag state records which splitter (0 = L|M, 1 = M|R) and starting fr triple.
  const dragStateRef = React.useRef<{
    startX: number
    startLeft: number
    startMid: number
    startRight: number
    splitter: 0 | 1
  } | null>(null)

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

  const runSuggested = useCallback((goal: string, opts?: { warnCalibrateFirst?: boolean }) => {
    if (opts?.warnCalibrateFirst) {
      toast.warning("Not READY", { description: "Calibrating Q0 first, then Bell." })
    }
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
    { label: "Calibrate Q0", goal: "Bring qubit 0 to ready", kind: "calibrate" as const },
    { label: "Q0 readiness", goal: "Report qubit 0 readiness and fidelity status", kind: "status" as const },
    { label: "Device status", goal: "Report device health and temperature status", kind: "status" as const },
    { label: "Bell pair", goal: "Run a Bell pair and report fidelity", kind: "bell" as const },
    { label: "Improve Bell", goal: "Run a precise Bell pair and report fidelity", kind: "bell" as const },
    { label: "Diagnose Q0", goal: "Check qubit 0 health and readout status", kind: "diagnose" as const },
  ], [])

  // Live readouts for top bar (instrument)
  const q0Fid = device?.readout_fidelity?.["0"] ?? device?.readout_fidelity?.[0 as any] ?? null
  const q0Temp = device?.temperatures_mk?.["0"] ?? device?.temperatures_mk?.[0 as any] ?? null
  const isReady = !!device?.is_ready
  const q0Ready = isReady || (q0Fid != null && Number(q0Fid) >= 0.82)
  const readiness = device ? device.readiness_score.toFixed(3) : null

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
    { id: "g2", label: "Run a Bell pair and report fidelity", hint: q0Ready ? "circuit" : "calibrate first", group: "Goals", icon: defaultCommandIcons.bell, run: () => runSuggested("Run a Bell pair and report fidelity", { warnCalibrateFirst: !q0Ready }) },
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
  ], [submitGoal, runSuggested, q0Ready, refreshDevice, refreshMetrics, startJobSSE])

  const selectedTurn = useMemo(() => turns.find(t => t.id === selectedTurnId) || null, [turns, selectedTurnId])

  const ledger = useMemo(() => [...turns].reverse().slice(0, 10), [turns])

  // Stage machine state (bottom-right chip) — derives from live device + jobs + turns
  const hasActiveJob = !!activeJobId && ["queued", "running"].includes(jobs[activeJobId]?.status || "")
  const activeJobStatus = activeJobId ? (jobs[activeJobId]?.status || null) : null
  const activeTurnRunning = !!activeTurn && activeTurn.status === "running"
  const activeTurnGoal = activeTurn?.goal
  const lastJobFailedRecently = Object.values(jobs).some(j => j.status === "failed")
  const lastTurnFailedRecently = turns.some(t => t.status === "failed")
  const transitionedHint = React.useMemo(() => {
    if (activeTurn && activeTurn.status === "succeeded" && activeTurn.fidelityHistory.length) {
      const f = activeTurn.fidelityHistory[activeTurn.fidelityHistory.length - 1].fidelity
      if (f >= (activeTurn.calThreshold ?? 0.88)) return "→ ready"
    }
    return undefined
  }, [activeTurn])

  const stageMachine = React.useMemo(
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
    ],
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

  // --- Splitter drag handlers (iPadOS Split View style, three panes) ---
  // Enforce ~22–28% minimum per pane (MIN_FR/MAX_FR calibrated to a 3-pane sum ≈ 3.02).
  const MIN_FR = 0.66
  const MAX_FR = 2.22

  const clampFr = (v: number) => Math.max(MIN_FR, Math.min(MAX_FR, v))

  // Pointer down: capture which splitter (0 = L|M, 1 = M|R) from data attr.
  const handleSplitterPointerDown = React.useCallback((e: React.PointerEvent) => {
    const stageEl = stageRef.current
    if (!stageEl) return
    const splitter = (e.currentTarget as HTMLElement).getAttribute("data-splitter") === "1" ? 1 : 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setIsDraggingSplit(true)
    dragStateRef.current = {
      startX: e.clientX,
      startLeft: leftFr,
      startMid: midFr,
      startRight: rightFr,
      splitter,
    }
    window.addEventListener("pointermove", handlePointerMove as unknown as EventListener, { passive: true })
    window.addEventListener("pointerup", handlePointerUp as unknown as EventListener, { once: true })
    window.addEventListener("pointercancel", handlePointerUp as unknown as EventListener, { once: true })
  }, [leftFr, midFr, rightFr])

  const handlePointerMove = React.useCallback((e: PointerEvent) => {
    const stageEl = stageRef.current
    const ds = dragStateRef.current
    if (!stageEl || !ds) return
    const rect = stageEl.getBoundingClientRect()
    const total = Math.max(1, rect.width)
    const dxPx = e.clientX - ds.startX
    // The two splitter tracks (14px each) are fixed; fr columns absorb the delta.
    const dxFr = (dxPx / total) * (ds.startLeft + ds.startMid + ds.startRight)

    if (ds.splitter === 0) {
      // Left | Mid splitter — adjust left vs mid, right unchanged
      let nextLeft = clampFr(ds.startLeft + dxFr)
      let nextMid = clampFr(ds.startMid - dxFr)
      const sumLM = nextLeft + nextMid
      const targetLM = ds.startLeft + ds.startMid
      const scaleLM = sumLM > 0 ? targetLM / sumLM : 1
      nextLeft = clampFr(nextLeft * scaleLM)
      nextMid = clampFr(nextMid * scaleLM)
      setLeftFr(nextLeft)
      setMidFr(nextMid)
    } else {
      // Mid | Right splitter — adjust mid vs right, left unchanged
      let nextMid = clampFr(ds.startMid + dxFr)
      let nextRight = clampFr(ds.startRight - dxFr)
      const sumMR = nextMid + nextRight
      const targetMR = ds.startMid + ds.startRight
      const scaleMR = sumMR > 0 ? targetMR / sumMR : 1
      nextMid = clampFr(nextMid * scaleMR)
      nextRight = clampFr(nextRight * scaleMR)
      setMidFr(nextMid)
      setRightFr(nextRight)
    }
  }, [])

  const handlePointerUp = React.useCallback(() => {
    setIsDraggingSplit(false)
    dragStateRef.current = null
    window.removeEventListener("pointermove", handlePointerMove as unknown as EventListener)
  }, [handlePointerMove])

  // Keyboard support: ArrowLeft/Right nudge the focused splitter.
  // We use document.activeElement to decide which splitter; if none, nudge L|M.
  const onSplitterKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.12 : 0.04
    const el = e.currentTarget as HTMLElement
    const which = el.getAttribute("data-splitter") === "1" ? 1 : 0

    if (e.key === "ArrowLeft") {
      if (which === 0) {
        const nextL = clampFr(leftFr - step)
        const nextM = clampFr(midFr + step)
        const s = (nextL + nextM) / (leftFr + midFr)
        setLeftFr(clampFr(nextL / s))
        setMidFr(clampFr(nextM / s))
      } else {
        const nextM = clampFr(midFr - step)
        const nextR = clampFr(rightFr + step)
        const s = (nextM + nextR) / (midFr + rightFr)
        setMidFr(clampFr(nextM / s))
        setRightFr(clampFr(nextR / s))
      }
      e.preventDefault()
    } else if (e.key === "ArrowRight") {
      if (which === 0) {
        const nextL = clampFr(leftFr + step)
        const nextM = clampFr(midFr - step)
        const s = (nextL + nextM) / (leftFr + midFr)
        setLeftFr(clampFr(nextL / s))
        setMidFr(clampFr(nextM / s))
      } else {
        const nextM = clampFr(midFr + step)
        const nextR = clampFr(rightFr - step)
        const s = (nextM + nextR) / (midFr + rightFr)
        setMidFr(clampFr(nextM / s))
        setRightFr(clampFr(nextR / s))
      }
      e.preventDefault()
    }
  }, [leftFr, midFr, rightFr])

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#000000] text-white flex flex-col">
      <CommandPalette actions={commandActions} disabled={!connected} />

      {/* Clean instrument toolbar */}
      <div className="toolbar relative">
        <div className="flex items-center gap-2 font-medium">
          <span className="font-sans tracking-[-0.2px]">Coda 2</span>
          <span
            className={`px-1.5 py-px rounded text-[10px] text-black font-mono tracking-[0.5px] ${connected ? "" : "opacity-60"}`}
            style={{ background: connected ? "var(--success)" : "#6b7280" }}
            title={connected ? "Connected to control plane" : "Not connected to control plane"}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>

        {/* READY centered when ready (instrument-first, minimal clutter) */}
        <div className="absolute left-1/2 -translate-x-1/2 text-[10px] font-mono tracking-[0.5px] text-success">
          {isReady ? "READY" : ""}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setCommandOpen(true)} className="rounded border hairline px-1.5 py-px hover:bg-white/5" title="⌘K">
            <CommandIcon className="h-3 w-3" />
          </button>
          <button
            onClick={() => {
              void checkConnection().then((ok) => {
                if (ok) {
                  void refreshDevice()
                  void refreshMetrics()
                }
              })
            }}
            className="rounded border hairline px-1.5 py-px hover:bg-white/5"
            title="Refresh"
          >
            refresh
          </button>
        </div>
      </div>

      {/* Content area: three-pane stage + bottom-third stage-blur + chat dock.
          Top ~2/3 panes stay sharp. Dock uses pointer-events:none; inner content gets auto. */}
      <div className="content-area">
        {/* Three-pane stage: param-drift landscape (left), 3D device (middle), static cryostat plate (right).
            Two iPadOS Split View–style splitters. Grid driven by leftFr/midFr/rightFr. */}
        <div
          ref={stageRef}
          className="stage stage-split"
          style={{ gridTemplateColumns: `${leftFr}fr 14px ${midFr}fr 14px ${rightFr}fr` }}
        >
          {backendDown && (
            <div className="absolute top-2 left-2 z-40 text-[9px] px-2 py-px rounded-full border border-white/10 bg-black/70 text-[#FF3B30] font-mono tracking-[0.3px]">
              OFFLINE — make run-api
            </div>
          )}

          {/* Left pane: param-drift landscape (WebGPU viz preserved) */}
          <div className="stage-pane stage-pane-left">
            <CalibrationSurfaceLazy
              detuning={detuning}
              applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
              fidelityHistory={surfaceHistory}
              readinessScore={device?.readiness_score ?? 0.7}
              readoutFidelity={device?.readout_fidelity ?? null}
              className="h-full w-full"
            />
          </div>

          {/* Splitter 0: between left and middle */}
          <div
            className={`stage-splitter ${isDraggingSplit ? "dragging" : ""}`}
            data-splitter="0"
            onPointerDown={handleSplitterPointerDown}
            onKeyDown={onSplitterKeyDown}
            tabIndex={0}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left and middle panes"
          >
            <div className="stage-splitter-rule" />
            <div className="stage-splitter-handle" />
          </div>

          {/* Middle pane: 3D cryo device (R3F preserved) */}
          <div className="stage-pane stage-pane-mid relative">
            <Device3DLazy
              device={device}
              detuning={detuning}
              applied={appliedParams || (activeTurn?.lastCalParams ?? null)}
              className="h-full w-full"
            />

            {/* Fidelity climb HUD — inside middle pane (over device) */}
            {activeTurn && activeTurn.fidelityHistory.length > 0 && (
              <div className="absolute bottom-[38%] right-3 w-[280px] hud rounded px-2 py-1 text-[10px]">
                <div className="flex items-baseline justify-between mb-0.5 px-1">
                  <div className="text-zinc-400">fidelity climb</div>
                  <div className="instrument-mono" style={{color: 'var(--success)'}}>
                    {latestFidelity?.toFixed(4)} / {threshold}
                  </div>
                </div>
                <div className="h-[64px] -mx-1">
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
          </div>

          {/* Splitter 1: between middle and right (cryostat) */}
          <div
            className={`stage-splitter ${isDraggingSplit ? "dragging" : ""}`}
            data-splitter="1"
            onPointerDown={handleSplitterPointerDown}
            onKeyDown={onSplitterKeyDown}
            tabIndex={0}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize middle and right panes"
          >
            <div className="stage-splitter-rule" />
            <div className="stage-splitter-handle" />
          </div>

          {/* Right pane: interactive cryostat plate with live HUD.
              Chips + spinners driven by real device/job state (same polls as toolbar/StageStateChip).
              Hover regions (flange/upper/still/mixing/package/cables/coil) show deeper frosted tooltip. */}
          <div className="stage-pane stage-pane-right">
            <CryostatPlate
              className="h-full w-full"
              device={device}
              detuning={detuning}
              stageMachine={stageMachine}
              hasActiveJob={hasActiveJob}
              activeJobStatus={activeJobStatus}
              lastTrace={
                activeTurn && activeTurn.traces && activeTurn.traces.length
                  ? activeTurn.traces[activeTurn.traces.length - 1]
                  : null
              }
            />
          </div>

          {/* StageStateChip just above the bottom-third dock/blur band */}
          <div className="absolute right-3 z-30" style={{ bottom: 'calc(33vh + 10px)' }}>
            <StageStateChip state={stageMachine} />
          </div>
        </div>

        {/* Bottom-third progressive frost (solid stacked bands — Safari-safe).
            Sibling of .stage/.dock; never put backdrop-filter on .dock (full-stage leak). */}
        <div className="stage-blur" aria-hidden="true" />

        {/* Bottom-third chat dock (~33vh). NO backdrop-filter.
            pointer-events:none on dock; inner chat re-enables auto.
            Transcript/chips/composer sit above .dock-tint (z-index:1). Top ~2/3 panes stay sharp. */}
        <div className="dock chat-dock">
          {/* Solid progressive tint behind chat (no blur). */}
          <div className="dock-tint" />
          <div className="constrained chat-constrained" style={{ pointerEvents: 'auto' }}>
            {/* Scrollable conversation transcript (top of dock, grows, scrolls) */}
            <div ref={transcriptRef} className="chat-transcript">
              {turns.length === 0 && (
                <div className="chat-empty">Golden path: Calibrate Q0 → check READY → Bell pair. Chips below follow that order.</div>
              )}
              {turns.map((t) => {
                const bell = t.status !== "running" ? bellMetricsFromResults(t.results) : null
                const bellShots = bell?.shots != null ? Math.round(bell.shots) : null
                return (
                  <div key={t.id} className="chat-turn">
                    {/* User bubble (right) */}
                    <div className="bubble user">
                      {t.userMessage || t.goal}
                    </div>
                    {/* Agent bubble (left) */}
                    <div className="bubble agent">
                      {t.status === "running" && "running…"}
                      {t.status === "failed" && (t.error || "failed")}
                      {t.status !== "running" && t.agentMessage && t.agentMessage}
                      {t.status !== "running" && !t.agentMessage && !t.error && "completed"}
                      {bell && (
                        <span className="bubble-meta">
                          F {bell.fidelity.toFixed(2)}{bellShots != null ? ` · ${bellShots} shots` : ""}
                        </span>
                      )}
                    </div>
                    {/* Tiny trace pills (non-primary) */}
                    {t.traces && t.traces.length > 0 && (
                      <div className="chat-traces">
                        {t.traces.slice(-3).map((tr, i) => (
                          <span key={i} className="chat-trace-pill">
                            {tr.tool}
                            {tr.tool === "run_bell_pair" && bell
                              ? ` · ${bell.fidelity.toFixed(2)}${bellShots != null ? ` · ${bellShots}` : ""}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Soft suggestion chips (above composer) */}
            <div className="chat-chips" role="list" aria-label="Golden path chips">
              {suggested.map((s, i) => {
                const gated = s.kind === "bell" && !q0Ready
                const next = s.label === nextChipLabel
                const cls = [
                  "preset-chip",
                  next ? "preset-chip-next" : "",
                  gated ? "preset-chip-gated" : "",
                ].filter(Boolean).join(" ")
                const title = gated
                  ? "Device not READY — calibrate Q0 first (or click to calibrate then Bell)"
                  : next
                    ? "Next step on the golden path"
                    : undefined
                return (
                  <button
                    key={i}
                    type="button"
                    role="listitem"
                    onClick={() => runSuggested(s.goal, { warnCalibrateFirst: gated })}
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
