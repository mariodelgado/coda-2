"use client"

import { useMemo } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useControlPlaneStore } from "@/lib/store"
import { CommandPalette, defaultCommandIcons, type CommandAction } from "@/components/command/command-palette"
import { getStageMachineState } from "@/components/stage/stage-state-chip"
import { InstrumentToolbar } from "@/components/instrument/toolbar"
import { StageSplit } from "@/components/stage/stage-split"
import { ChatDock, SUGGESTED_CHIPS } from "@/components/chat/chat-dock"
import { useDevicePoll } from "@/hooks/use-device-poll"
import { useGoals } from "@/hooks/use-goals"
import { useStageSplit } from "@/hooks/use-stage-split"
import { asFinite, type Turn } from "@/lib/turns"

export default function QuantumChatInstrument() {
  const setCommandOpen = useControlPlaneStore((s) => s.setCommandOpen)
  const {
    connected,
    backendDown,
    setBackendDown,
    device,
    detuning,
    appliedParams,
    checkConnection,
    refreshDevice,
  } = useDevicePoll()
  const {
    turns,
    setTurns,
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
  } = useGoals({ refreshDevice, setBackendDown })
  const {
    leftFr,
    midFr,
    rightFr,
    isDraggingSplit,
    stageRef,
    handleSplitterPointerDown,
    onSplitterKeyDown,
  } = useStageSplit()

  const q0Fid = device?.readout_fidelity?.["0"] ?? device?.readout_fidelity?.[0 as unknown as "0"] ?? null
  const q0Temp = asFinite(device?.temperatures_mk?.["0"] ?? device?.temperatures_mk?.[0 as unknown as "0"])
  const isReady = !!device?.is_ready
  const q0Ready = isReady || (q0Fid != null && Number(q0Fid) >= 0.82)
  const readiness = device ? device.readiness_score.toFixed(3) : null
  const q0DeltaF = asFinite(detuning?.frequency_error)

  const latestFidelity = activeTurn?.fidelityHistory?.length
    ? activeTurn.fidelityHistory[activeTurn.fidelityHistory.length - 1].fidelity
    : (q0Fid != null ? q0Fid : null)

  const threshold = activeTurn?.calThreshold ?? 0.88
  const surfaceHistory = activeTurn?.fidelityHistory ?? []

  const commandActions: CommandAction[] = useMemo(() => [
    { id: "g1", label: "Bring qubit 0 to ready", hint: "calibrate", group: "Goals", icon: defaultCommandIcons.calibrate, run: () => submitGoal("Bring qubit 0 to ready") },
    { id: "g2", label: "Run a Bell pair and report fidelity", hint: q0Ready ? "circuit" : "calibrate first", group: "Goals", icon: defaultCommandIcons.bell, run: () => runSuggested("Run a Bell pair and report fidelity", { warnCalibrateFirst: !q0Ready }) },
    { id: "q1", label: "Refresh device", group: "Quick", icon: defaultCommandIcons.refresh, run: async () => { await refreshDevice() } },
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
  ], [submitGoal, runSuggested, q0Ready, refreshDevice, startJobSSE, setTurns, setSelectedTurnId, setActiveJobId])

  const hasActiveJob = !!activeJobId && ["queued", "running"].includes(jobs[activeJobId]?.status || "")
  const activeJobStatus = activeJobId ? (jobs[activeJobId]?.status || null) : null
  const activeTurnRunning = !!activeTurn && activeTurn.status === "running"
  const activeTurnGoal = activeTurn?.goal
  const lastJobFailedRecently = Object.values(jobs).some(j => j.status === "failed")
  const lastTurnFailedRecently = turns.some(t => t.status === "failed")
  const transitionedHint = useMemo(() => {
    if (activeTurn && activeTurn.status === "succeeded" && activeTurn.fidelityHistory.length) {
      const f = activeTurn.fidelityHistory[activeTurn.fidelityHistory.length - 1].fidelity
      if (f >= (activeTurn.calThreshold ?? 0.88)) return "→ ready"
    }
    return undefined
  }, [activeTurn])

  const stageMachine = useMemo(
    () =>
      getStageMachineState({
        connected,
        isReady,
        hasActiveJob,
        activeJobStatus,
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#000000] text-white flex flex-col">
      <CommandPalette actions={commandActions} disabled={!connected} />

      <InstrumentToolbar
        connected={connected}
        isReady={isReady}
        q0Temp={q0Temp}
        readiness={readiness}
        q0DeltaF={q0DeltaF}
        onOpenCommand={() => setCommandOpen(true)}
        onRefresh={() => {
          void checkConnection().then((ok) => {
            if (ok) void refreshDevice()
          })
        }}
      />

      {/* Content area: three-pane stage + bottom-third stage-blur + chat dock.
          Top ~2/3 panes stay sharp. Dock uses pointer-events:none; inner content gets auto. */}
      <div className="content-area">
        {/* Three-pane stage: param-drift landscape (left), 3D device (middle), static cryostat plate (right).
            Two iPadOS Split View–style splitters. Grid driven by leftFr/midFr/rightFr. */}
        <StageSplit
          backendDown={backendDown}
          leftFr={leftFr}
          midFr={midFr}
          rightFr={rightFr}
          isDraggingSplit={isDraggingSplit}
          stageRef={stageRef}
          onSplitterPointerDown={handleSplitterPointerDown}
          onSplitterKeyDown={onSplitterKeyDown}
          device={device}
          detuning={detuning}
          appliedParams={appliedParams}
          activeTurn={activeTurn}
          surfaceHistory={surfaceHistory}
          latestFidelity={latestFidelity}
          threshold={threshold}
          stageMachine={stageMachine}
          hasActiveJob={hasActiveJob}
          activeJobStatus={activeJobStatus}
        />

        {/* Bottom-third progressive frost (solid stacked bands — Safari-safe).
            Sibling of .stage/.dock; never put backdrop-filter on .dock (full-stage leak). */}
        <div className="stage-blur" aria-hidden="true" />

        <ChatDock
          turns={turns}
          suggested={SUGGESTED_CHIPS}
          q0Ready={q0Ready}
          connected={connected}
          submitting={submitting}
          goalInput={goalInput}
          onGoalInputChange={setGoalInput}
          hasRunning={hasRunning}
          onRunSuggested={runSuggested}
          onSubmitGoal={submitGoal}
          onStop={stopActive}
          onOpenCommand={() => setCommandOpen(true)}
        />
      </div>
    </div>
  )
}
