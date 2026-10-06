import type { ToolTrace } from "@/lib/api"

export interface FidelityPoint {
  iter: number
  fidelity: number
}

export interface Turn {
  id: string
  goal: string
  userMessage?: string
  agentMessage?: string
  status: "running" | "succeeded" | "failed"
  traces: ToolTrace[]
  results: unknown[]
  fidelityHistory: FidelityPoint[]
  calThreshold: number
  lastCalParams?: Record<string, number> | null
  bellCounts?: Record<string, number> | null
  error?: string
  createdAt: number
}

/** Live / result math: fidelity, shots, Δf, temp/mK, readiness — only keys that are present. */
export type MathReadout = {
  fidelity?: number
  shots?: number
  deltaF?: number
  tempMk?: number
  readiness?: number
}

export function asFinite(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

export function pickQubit0(rec: unknown): number | undefined {
  if (!rec || typeof rec !== "object") return undefined
  const o = rec as Record<string, unknown>
  return asFinite(o["0"] ?? (o as Record<number, unknown>)[0])
}

/** Numbers from one tool result (device state, calibrate, Bell job metrics). */
export function mathFromData(data: unknown): MathReadout {
  const out: MathReadout = {}
  if (!data || typeof data !== "object") return out
  const d = data as Record<string, unknown>
  const m = (d.metrics && typeof d.metrics === "object" ? d.metrics : {}) as Record<string, unknown>

  // Bell F from #34 (estimated_fidelity), else calibrate fidelity, else Q0 readout.
  const fid =
    asFinite(m.estimated_fidelity) ??
    asFinite(d.fidelity) ??
    pickQubit0(d.readout_fidelity)
  if (fid != null) out.fidelity = fid

  if (out.fidelity == null && d.counts && typeof d.counts === "object") {
    const counts = d.counts as Record<string, number>
    const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0) || 1
    const corr = (Number(counts["00"] || 0) + Number(counts["11"] || 0)) / Number(total)
    if (Number.isFinite(corr)) out.fidelity = corr
  }

  const shots = asFinite(m.shots) ?? asFinite(d.shots)
  if (shots != null) out.shots = shots

  const readiness = asFinite(d.readiness_score)
  if (readiness != null) out.readiness = readiness

  const temp = pickQubit0(d.temperatures_mk)
  if (temp != null) out.tempMk = temp

  const det = (d.detuning && typeof d.detuning === "object" ? d.detuning : d) as Record<string, unknown>
  const df = asFinite(det.frequency_error)
  if (df != null) out.deltaF = df

  return out
}

export function mathFromResults(results: unknown[]): MathReadout {
  const out: MathReadout = {}
  for (const raw of results || []) {
    const piece = mathFromData((raw as { data?: unknown } | null)?.data)
    if (piece.fidelity != null) out.fidelity = piece.fidelity
    if (piece.shots != null) out.shots = piece.shots
    if (piece.deltaF != null) out.deltaF = piece.deltaF
    if (piece.tempMk != null) out.tempMk = piece.tempMk
    if (piece.readiness != null) out.readiness = piece.readiness
  }
  return out
}

export function formatMathParts(m: MathReadout, shotsBare = false): string[] {
  const parts: string[] = []
  if (m.fidelity != null) parts.push(`F ${m.fidelity.toFixed(2)}`)
  if (m.shots != null) parts.push(shotsBare ? `${Math.round(m.shots)}` : `${Math.round(m.shots)} shots`)
  if (m.deltaF != null) parts.push(`Δf ${m.deltaF.toFixed(3)}`)
  if (m.tempMk != null) parts.push(`${m.tempMk.toFixed(1)} mK`)
  if (m.readiness != null) parts.push(`R ${m.readiness.toFixed(3)}`)
  return parts
}

export function formatBubbleMeta(m: MathReadout): string {
  return formatMathParts(m).join(" · ")
}

export function formatPillMath(m: MathReadout): string {
  const parts = formatMathParts(m, true)
  return parts.length ? ` · ${parts.join(" · ")}` : ""
}

export function hasMath(m: MathReadout): boolean {
  return m.fidelity != null || m.shots != null || m.deltaF != null || m.tempMk != null || m.readiness != null
}

export function extractFromResults(results: unknown[]): {
  history: FidelityPoint[]
  params: Record<string, number> | null
  counts: Record<string, number> | null
  threshold: number
} {
  let history: FidelityPoint[] = []
  let params: Record<string, number> | null = null
  let counts: Record<string, number> | null = null
  let threshold = 0.88
  for (const r of results || []) {
    const d = ((r as { data?: unknown } | null)?.data || {}) as Record<string, unknown>
    if (Array.isArray(d.history)) {
      history = (d.history as [number, number][]).map(([it, f]) => ({ iter: it, fidelity: f }))
      if (typeof d.threshold === "number") threshold = d.threshold
      if (d.params && typeof d.params === "object") params = d.params as Record<string, number>
    }
    if (d && typeof d === "object" && d.counts) counts = d.counts as Record<string, number>
  }
  return { history, params, counts, threshold }
}

export function upsertFidelityPoint(history: FidelityPoint[], point: FidelityPoint): FidelityPoint[] {
  const next = history.filter(p => p.iter !== point.iter)
  next.push(point)
  next.sort((a, b) => a.iter - b.iter)
  return next
}
