"use client"

import { useCallback, useEffect, useState } from "react"
import { api, getApiBase, setApiBase, type DeviceState } from "@/lib/api"

export type AppliedParams = {
  frequency: number
  amplitude: number
  phase: number
  readout_error: number
} | null

/**
 * Health + device/detuning poll. Metrics snapshot state was unused and is not polled here.
 */
export function useDevicePoll() {
  const [apiBase, setApiBaseState] = useState<string>(getApiBase())
  const [connected, setConnected] = useState(false)
  const [backendDown, setBackendDown] = useState(false)
  const [device, setDevice] = useState<DeviceState | null>(null)
  const [detuning, setDetuning] = useState<Record<string, number> | null>(null)
  const [appliedParams, setAppliedParams] = useState<AppliedParams>(null)

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
      }
    }, 6500)
    return () => clearInterval(id)
  }, [connected, refreshDevice])

  return {
    apiBase,
    connected,
    backendDown,
    setBackendDown,
    device,
    detuning,
    appliedParams,
    checkConnection,
    refreshDevice,
  }
}
