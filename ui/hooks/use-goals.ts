"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { api, type ClimbEvent, type JobRecord } from "@/lib/api"
import { extractFromResults, upsertFidelityPoint, type Turn } from "@/lib/turns"

export function useGoals(opts: {
  refreshDevice: () => Promise<void>
  setBackendDown: (down: boolean) => void
  connected?: boolean
}) {
  const { refreshDevice, setBackendDown, connected = false } = opts

  const [turns, setTurns] = useState<Turn[]>([])
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const [goalInput, setGoalInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [jobs, setJobs] = useState<Record<string, JobRecord>>({})
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const eventSourcesRef = useRef<Record<string, EventSource>>({})
  const climbSourceRef = useRef<EventSource | null>(null)
  const lastDevRefreshRef = useRef(0)

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
          if (data?.job_id) upsertJob({ job_id: data.job_id, status: data.status || "running", job_type: "circuit", result: data.result || null, metrics: data.metrics || null } as JobRecord)
        } catch {}
      }
      es.onerror = () => { es.close(); delete eventSourcesRef.current[jobId] }
    } catch {}
  }, [upsertJob])

  const applyClimbEvent = useCallback((ev: ClimbEvent) => {
    if (typeof ev.iter !== "number" || typeof ev.fidelity !== "number") return
    setTurns(prev => prev.map(t => {
      if (t.status !== "running") return t
      return {
        ...t,
        fidelityHistory: upsertFidelityPoint(t.fidelityHistory, { iter: ev.iter, fidelity: ev.fidelity }),
        calThreshold: typeof ev.threshold === "number" ? ev.threshold : t.calThreshold,
      }
    }))
    const now = Date.now()
    if (now - lastDevRefreshRef.current > 220) {
      lastDevRefreshRef.current = now
      void refreshDevice()
    }
  }, [refreshDevice])

  const startCalibrationSSE = useCallback(() => {
    const existing = climbSourceRef.current
    if (existing && existing.readyState !== EventSource.CLOSED) return existing
    try {
      const es = new EventSource(api.sseCalibrationUrl())
      climbSourceRef.current = es
      const onClimb = (raw: MessageEvent) => {
        try { applyClimbEvent(JSON.parse(raw.data) as ClimbEvent) } catch {}
      }
      es.addEventListener("climb", onClimb)
      es.onmessage = onClimb
      es.onerror = () => {
        // EventSource reconnects; only drop the handle if it fully closed.
        if (es.readyState === EventSource.CLOSED) {
          climbSourceRef.current = null
        }
      }
      return es
    } catch {
      return null
    }
  }, [applyClimbEvent])

  useEffect(() => {
    if (!connected) {
      const es = climbSourceRef.current
      if (es) { es.close(); climbSourceRef.current = null }
      return
    }
    startCalibrationSSE()
    return () => {
      const es = climbSourceRef.current
      if (es) { es.close(); climbSourceRef.current = null }
    }
  }, [connected, startCalibrationSSE])

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await api.postGoal(`cancel ${jobId}`).catch(() => {})
      await pollJobOnce(jobId)
      toast.message("Cancel requested")
    } catch (e: unknown) {
      const err = e as { message?: string }
      toast.error("Cancel failed", { description: String(err?.message || e) })
    }
  }, [pollJobOnce])

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
    startCalibrationSSE()
    const climbEs = climbSourceRef.current
    if (climbEs && climbEs.readyState === EventSource.CONNECTING) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 500)
        climbEs.addEventListener("open", () => { clearTimeout(t); resolve() }, { once: true })
      })
    }

    try {
      const resp = await api.postGoal(goal)
      const traces = resp.traces || []
      const { history, params, counts, threshold } = extractFromResults(resp.results || [])
      const agentMsg = resp.agent_message || (resp as { agentMessage?: string }).agentMessage || undefined

      setTurns(prev => prev.map(t => {
        if (t.id !== turnId) return t
        return {
          ...t,
          userMessage: resp.user_message || t.userMessage || goal,
          agentMessage: agentMsg,
          status: "succeeded",
          traces,
          results: resp.results || [],
          fidelityHistory: history.length ? history : t.fidelityHistory,
          calThreshold: threshold,
          lastCalParams: params,
          bellCounts: counts,
        }
      }))

      const maybe = (resp.results || []).find((r) => typeof r?.data?.job_id === "string")
      const jobId: string | undefined = maybe?.data?.job_id as string | undefined
      if (jobId) {
        setActiveJobId(jobId)
        startJobSSE(jobId)
      }

      await Promise.all([refreshDevice(), loadRecentJobs()])

      const lastF = history.length ? history[history.length - 1].fidelity : null
      if (lastF != null) {
        if (lastF >= threshold) toast.success("Reached threshold")
        else toast.message(`Completed • ${lastF.toFixed(4)}`)
      } else if (counts) {
        toast.success("Bell complete")
      } else {
        toast.success("Done")
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      const msg = err?.message || "failed"
      setTurns(prev => prev.map(t => t.id === turnId ? { ...t, status: "failed", error: msg } : t))
      setBackendDown(true)
      toast.error("Failed", { description: msg })
    } finally {
      setSubmitting(false)
    }
  }, [refreshDevice, loadRecentJobs, startJobSSE, startCalibrationSSE, setBackendDown])

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

  const activeTurn = useMemo(() => {
    if (selectedTurnId) return turns.find(t => t.id === selectedTurnId) || null
    return [...turns].reverse().find(t => t.fidelityHistory.length) || turns[turns.length - 1] || null
  }, [turns, selectedTurnId])

  return {
    turns,
    setTurns,
    selectedTurnId,
    setSelectedTurnId,
    goalInput,
    setGoalInput,
    submitting,
    jobs,
    activeJobId,
    setActiveJobId,
    submitGoal,
    runSuggested,
    stopActive,
    startJobSSE,
    hasRunning,
    activeTurn,
  }
}
