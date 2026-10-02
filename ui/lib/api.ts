/**
 * Thin HTTP client for the Conductor QPU FastAPI control plane.
 * Base URL is configurable at runtime (UI header) via setApiBase.
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export interface DeviceState {
  is_ready: boolean
  readiness_score: number
  qubits: number[]
  temperatures_mk: Record<string, number>
  coherence_us: Record<string, [number, number]>
  readout_fidelity: Record<string, number>
  notes: string
  timestamp: string
  readiness_predicate?: {
    name: string
    readout_fidelity_threshold: number
    description: string
  }
}

export interface JobRecord {
  job_id: string
  status: JobStatus
  job_type: string
  created_at?: string | null
  completed_at?: string | null
  result: Record<string, unknown> | null
  metrics: Record<string, unknown> | null
  error?: string | null
}

export interface ToolResult {
  ok: boolean
  data?: Record<string, unknown> | null
  latency_s: number
  error?: string | null
}

export interface ToolTrace {
  ts: number
  tool: string
  args: Record<string, unknown>
  latency_s: number
  ok: boolean
  summary: string
}

export interface MetricsSnapshot {
  orchestrator?: {
    calibration?: Record<string, number>
    [key: string]: unknown
  }
  calibration?: Record<string, number>
  aggregator?: Record<string, unknown>
  [key: string]: unknown
}

export interface GoalResponse {
  goal: string
  user_message?: string | null
  agent_message?: string | null
  results: ToolResult[]
  traces: ToolTrace[]
  metrics: MetricsSnapshot
}

export interface DetuningResponse {
  qubit_id: number
  detuning: Record<string, number>
  applied: {
    frequency: number
    amplitude: number
    phase: number
    readout_error: number
  }
}

// Default to a same-origin prefix so the Next dev server can proxy to the control plane.
// In dev, next.config rewrites /qpu/* → http://127.0.0.1:8000/*.
// If you run the UI against a remote or differently-port API, set NEXT_PUBLIC_API_BASE explicitly
// (e.g. NEXT_PUBLIC_API_BASE=http://localhost:8000 or a full origin).
let _base = process.env.NEXT_PUBLIC_API_BASE || "/qpu"

export function setApiBase(base: string) {
  _base = base.replace(/\/$/, "")
}

export function getApiBase() {
  return _base
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${_base}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${res.status} ${res.statusText}${text ? `: ${text.slice(0, 180)}` : ""}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => req<{ status: string }>("/health"),
  deviceState: () => req<DeviceState>("/device/state"),
  getDetuning: (qubitId: number) => req<DetuningResponse>(`/device/detuning/${qubitId}`),
  getMetrics: () => req<MetricsSnapshot>("/metrics"),
  getTraces: () => req<{ traces: ToolTrace[] }>("/traces"),
  listJobs: (limit = 50) => req<{ jobs: JobRecord[]; count: number }>(`/jobs?limit=${limit}`),
  getJob: (jobId: string) => req<JobRecord>(`/jobs/${jobId}`),
  postGoal: (goal: string) =>
    req<GoalResponse>("/goals", { method: "POST", body: JSON.stringify({ goal }) }),
  postCalibrate: (qubit_id = 0, target_fidelity?: number) =>
    req<{
      success: boolean
      fidelity: number
      iterations: number
      duration_s: number
      params: Record<string, number>
      history: Array<[number, number]>
    }>("/calibrate", {
      method: "POST",
      body: JSON.stringify({ qubit_id, target_fidelity }),
    }),
  postBell: (shots = 1024, qubits: number[] = [0, 1]) =>
    req<{ job_id: string; counts?: Record<string, number>; metrics?: Record<string, unknown>; error?: string }>(
      "/circuit/bell",
      { method: "POST", body: JSON.stringify({ shots, qubits }) },
    ),
  demoForceFailNextCal: () =>
    req<{ ok: boolean; fid_cap: number; note: string }>("/demo/fail_next_cal", { method: "POST" }),
  demoStartLongJob: () =>
    req<{ job_id: string }>("/demo/start_long_job", { method: "POST" }),
  sseJobUrl: (jobId: string) => `${_base}/sse/jobs/${jobId}`,
  readinessPredicate: () =>
    req<{ name: string; readout_fidelity_threshold: number; description: string }>(
      "/readiness_predicate",
    ),
}
