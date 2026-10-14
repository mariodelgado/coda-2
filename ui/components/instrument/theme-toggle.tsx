"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

/**
 * Toolbar theme toggle. next-themes persists to localStorage (`coda-theme`)
 * and `enableSystem` honors prefers-color-scheme until the user overrides.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = !mounted || resolvedTheme !== "light"

  return (
    <button
      type="button"
      className="toolbar-icon-btn"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={!isDark}
    >
      {isDark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
    </button>
  )
}
