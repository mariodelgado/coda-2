"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import type { ThemeMode } from "@/lib/qubit-color"

/**
 * Resolved light/dark after next-themes hydrates.
 * First paint matches the CSS :root (dark) so SSR and the blocking
 * next-themes script stay aligned.
 */
export function useInstrumentTheme(): ThemeMode {
  const { resolvedTheme } = useTheme()
  const [mode, setMode] = useState<ThemeMode>("dark")

  useEffect(() => {
    if (resolvedTheme === "light" || resolvedTheme === "dark") {
      setMode(resolvedTheme)
    }
  }, [resolvedTheme])

  return mode
}
