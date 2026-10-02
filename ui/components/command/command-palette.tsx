"use client"

import * as React from "react"
import { Command } from "cmdk"
import { Target, Zap, RefreshCw, AlertTriangle, Clock, Activity } from "lucide-react"
import { useControlPlaneStore } from "@/lib/store"

export interface CommandAction {
  id: string
  label: string
  hint?: string
  group: string
  icon?: React.ReactNode
  run: () => void | Promise<void>
}

interface CommandPaletteProps {
  actions: CommandAction[]
  disabled?: boolean
}

export function CommandPalette({ actions, disabled }: CommandPaletteProps) {
  const open = useControlPlaneStore((s) => s.commandOpen)
  const setOpen = useControlPlaneStore((s) => s.setCommandOpen)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        if (!disabled) setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen, disabled])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Instant open — no fade (⌘K used hundreds of times/day) */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setOpen(false)}
      />
      <div className="absolute left-1/2 top-[18%] w-full max-w-lg -translate-x-1/2 px-3">
        <Command
          className="overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl"
          label="Command palette"
        >
          <div className="flex items-center border-b border-white/10 px-3">
            <Command.Input
              autoFocus
              placeholder="Run a goal or action…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
            />
            <kbd className="ml-2 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-xs text-zinc-500">
              No matching actions.
            </Command.Empty>
            {["Goals", "Quick", "Demo"].map((group) => {
              const items = actions.filter((a) => a.group === group)
              if (!items.length) return null
              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-zinc-500"
                >
                  {items.map((a) => (
                    <Command.Item
                      key={a.id}
                      value={`${a.label} ${a.hint || ""}`}
                      onSelect={() => {
                        setOpen(false)
                        void a.run()
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-200 aria-selected:bg-white/10"
                    >
                      <span className="text-zinc-400">{a.icon}</span>
                      <span className="flex-1">{a.label}</span>
                      {a.hint && (
                        <span className="font-mono text-[10px] text-zinc-500">{a.hint}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

export const defaultCommandIcons = {
  calibrate: <Target className="h-3.5 w-3.5" />,
  bell: <Zap className="h-3.5 w-3.5" />,
  refresh: <RefreshCw className="h-3.5 w-3.5" />,
  fail: <AlertTriangle className="h-3.5 w-3.5" />,
  long: <Clock className="h-3.5 w-3.5" />,
  metrics: <Activity className="h-3.5 w-3.5" />,
}
