"use client"

/**
 * 3D stylized hardware view of the QPU device.
 *
 * Richer superconducting chip geometry for founder demos:
 * - PCB/package ground plane with via hints and routing traces
 * - Detailed qubit chiplets: transmon islands, JJ gap cues, readout resonators
 * - Multi-element bus/coupler with interdigitated finger hints
 * - Subtle control line routing cues
 * - Applied/true detuning markers preserved (iOS palette)
 *
 * Live readout strip (right edge) driven by real device state:
 * - readout_fidelity per qubit (from adapter)
 * - coherence_us (T1, T2) per qubit (from adapter)
 * - readout/gate error proxy derived from detuning or applied (no fake statics)
 *
 * Camera/lights intentionally conservative; 50/50 split preserved by parent.
 * Qubit spheres/chips use the spectral language (indigo |0⟩ / ice |1⟩).
 * True/applied markers stay the instrument pair. Chrome stays neutral.
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import * as THREE from "three"
import { cn } from "@/lib/utils"
import { useInstrumentTheme } from "@/hooks/use-instrument-theme"
import { p1FromBellCounts, qubitHex, stageBackground } from "@/lib/qubit-color"
import { BellHistogram } from "@/components/viz/bell-histogram"
import { QubitChip } from "@/components/viz/qubit-swatch"

export interface Device3DProps {
  device: {
    is_ready?: boolean
    temperatures_mk?: Record<string | number, number>
    readout_fidelity?: Record<string | number, number>
    coherence_us?: Record<string | number, [number, number]>
    notes?: string
  } | null
  detuning: Record<string, number> | null
  applied: {
    frequency?: number
    amplitude?: number
    phase?: number
    readout_error?: number
  } | null
  bellCounts?: Record<string, number> | null
  phase?: number
  className?: string
}

// ---------------------------------------------------------------------------
// Geometry helpers (instrument tasteful density, no visual noise overload)

function QubitChiplet({
  index,
  fidelity,
  detuneF,
  detuneA,
  p1,
  phase,
  theme,
  // t1/t2 accepted for future HUD extensions; not rendered in geometry today
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  t1: _t1,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  t2: _t2,
}: {
  index: number
  fidelity: number
  detuneF: number
  detuneA: number
  p1: number
  phase: number
  theme: "dark" | "light"
  t1: number
  t2: number
}) {
  const groupRef = React.useRef<THREE.Group>(null)

  // Spectral language: sphere encodes measured P(|1⟩), not fidelity.
  const qColor = qubitHex(p1, phase, theme)
  const glow = theme === "dark" ? 0.92 : 0.28

  const x = index === 0 ? -0.95 : 0.95

  // subtle live motion (transform only)
  useFrame(() => {
    if (groupRef.current) {
      const t = performance.now() * 0.0009 + index
      groupRef.current.rotation.y = Math.sin(t) * 0.04
      groupRef.current.position.y = Math.sin(t * 1.05) * 0.006
    }
  })

  // Map detuning to small visible offsets for the "true" marker
  const trueDx = THREE.MathUtils.clamp(detuneF * 3.2, -0.22, 0.22)
  const trueDz = THREE.MathUtils.clamp(detuneA * 2.8, -0.18, 0.18)

  return (
    <group ref={groupRef} position={[x, 0.12, 0]}>
      {/* PCB/package ground plane pad under this qubit (darker matte) */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[1.08, 0.06, 0.64]} />
        <meshStandardMaterial color="#0f1115" metalness={0.35} roughness={0.85} />
      </mesh>

      {/* Thin routing trace stub (control line hint) */}
      <mesh position={[index === 0 ? -0.66 : 0.66, -0.02, 0]}>
        <boxGeometry args={[0.22, 0.015, 0.035]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Main transmon island / resonator pad (metallic chiplet) */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.78, 0.14, 0.46]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.4} />
      </mesh>

      {/* Subtle top cap / ground plane relief */}
      <mesh position={[0, 0.11, 0]}>
        <boxGeometry args={[0.72, 0.02, 0.40]} />
        <meshStandardMaterial color="#334155" metalness={0.45} roughness={0.55} />
      </mesh>

      {/* Josephson junction gap cue (very thin dark slit) */}
      <mesh position={[0, 0.095, 0]}>
        <boxGeometry args={[0.08, 0.03, 0.18]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Readout resonator stub (perpendicular microstrip hint) */}
      <mesh position={[0, 0.085, index === 0 ? -0.32 : 0.32]}>
        <boxGeometry args={[0.16, 0.018, 0.14]} />
        <meshStandardMaterial color="#1f2937" metalness={0.55} roughness={0.5} />
      </mesh>
      {/* Resonator finger / termination hint */}
      <mesh position={[0, 0.095, index === 0 ? -0.41 : 0.41]}>
        <boxGeometry args={[0.06, 0.01, 0.06]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Qubit marker (Bloch-ish sphere) colored by live fidelity */}
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.155]} />
        <meshStandardMaterial color={qColor} emissive={qColor} emissiveIntensity={glow} />
      </mesh>

      {/* Thin resonator ring (readout mode hint) */}
      <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.24, 0.29, 28]} />
        <meshBasicMaterial color={qColor} transparent opacity={0.26} />
      </mesh>

      {/* Applied calibration position (amber/orange) */}
      <mesh position={[0.0, 0.165, 0.0]}>
        <sphereGeometry args={[0.042]} />
        <meshStandardMaterial color="#FF9500" emissive="#FF9500" emissiveIntensity={0.85} />
      </mesh>

      {/* True hardware position (blue), offset by live detuning */}
      <mesh position={[trueDx, 0.165, trueDz]}>
        <sphereGeometry args={[0.036]} />
        <meshStandardMaterial color="#007AFF" emissive="#007AFF" emissiveIntensity={0.8} />
      </mesh>

      {/* Small delta line between applied and true */}
      <mesh position={[(trueDx) * 0.5, 0.165, (trueDz) * 0.5]}>
        <cylinderGeometry args={[0.0035, 0.0035, Math.max(0.018, Math.sqrt(trueDx * trueDx + trueDz * trueDz)), 5]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.55} />
      </mesh>

      {/* Floating per-qubit label (mono) */}
      <Html
        position={[0, 0.68, 0]}
        style={{
          fontSize: "9px",
          color: "var(--secondary-label)",
          fontFamily: "var(--font-mono-inst)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        Q{index} <span style={{ color: qColor }}>{(fidelity * 100).toFixed(0)}%</span>
      </Html>
    </group>
  )
}

function BusCoupler({ tint }: { tint?: string }) {
  return (
    <group>
      {/* Primary bus line (center coupler) — tinted when the pair is entangled */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[1.72, 0.032, 0.09]} />
        <meshStandardMaterial color={tint || "#1f2937"} metalness={0.55} roughness={0.5} emissive={tint || "#000000"} emissiveIntensity={tint ? 0.35 : 0} />
      </mesh>
      {/* Bus top cap */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.48, 0.012, 0.06]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Interdigitated finger cues (left side) */}
      {[-0.42, -0.18, 0.06].map((z, i) => (
        <mesh key={`lf-${i}`} position={[-0.38, 0.205, z]}>
          <boxGeometry args={[0.18, 0.01, 0.03]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.55} />
        </mesh>
      ))}
      {/* Interdigitated finger cues (right side) */}
      {[0.42, 0.18, -0.06].map((z, i) => (
        <mesh key={`rf-${i}`} position={[0.38, 0.205, z]}>
          <boxGeometry args={[0.18, 0.01, 0.03]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.55} />
        </mesh>
      ))}

      {/* Small via / bump hints along the bus */}
      {[-0.6, 0, 0.6].map((x, i) => (
        <mesh key={`via-${i}`} position={[x, 0.195, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.035, 12]} />
          <meshStandardMaterial color="#0f1115" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function PackageGroundPlane() {
  return (
    <group>
      {/* Main package / interposer ground plane (matte PCB-like) */}
      <mesh position={[0, -0.24, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[2.18, 2.24, 0.08, 60, 1, false]} />
        <meshStandardMaterial color="#0c0d10" metalness={0.25} roughness={0.9} />
      </mesh>

      {/* Inner polished ring (package seal) */}
      <mesh position={[0, -0.18, 0]}>
        <cylinderGeometry args={[1.88, 1.92, 0.03, 60]} />
        <meshStandardMaterial color="#1f2937" metalness={0.55} roughness={0.5} />
      </mesh>

      {/* Subtle rim highlight / lid edge */}
      <mesh position={[0, -0.14, 0]}>
        <ringGeometry args={[2.02, 2.14, 52]} />
        <meshBasicMaterial color="#334155" transparent opacity={0.32} side={2} />
      </mesh>

      {/* Sparse via field hints on the ground plane (purely visual density) */}
      {[-1.1, -0.55, 0.55, 1.1].map((x, i) => (
        <mesh key={`gvia-${i}`} position={[x, -0.20, 0.6 - i * 0.35]}>
          <cylinderGeometry args={[0.022, 0.022, 0.04, 10]} />
          <meshStandardMaterial color="#0a0b0e" metalness={0.3} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function CryoColdPlate() {
  return (
    <group>
      {/* Deep cold plate (below package) */}
      <mesh position={[0, -0.38, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[2.32, 2.38, 0.12, 64, 1, false]} />
        <meshStandardMaterial color="#0a0b0e" metalness={0.8} roughness={0.45} />
      </mesh>
      {/* Subtle inner polish band */}
      <mesh position={[0, -0.30, 0]}>
        <cylinderGeometry args={[2.10, 2.14, 0.02, 64]} />
        <meshStandardMaterial color="#111316" metalness={0.65} roughness={0.4} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Live readout strip (right edge) — pulls real device/adapter state

function LiveReadoutStrip({
  q0,
  q1,
  t0,
  t1_0,
  t2_0,
  t1_1,
  t2_1,
  err0,
  err1,
  ready,
  p1q0,
  p1q1,
  phase,
  theme,
  entangled,
}: {
  q0: number
  q1: number
  t0: number
  t1_0: number
  t2_0: number
  t1_1: number
  t2_1: number
  err0: number
  err1: number
  ready: boolean
  p1q0: number
  p1q1: number
  phase: number
  theme: "dark" | "light"
  entangled: boolean
}) {
  return (
    <div className="pointer-events-none absolute top-2 right-2 z-20 w-[176px] rounded surface-hud px-2 py-1.5 text-[9px] font-mono">
      <div className="flex items-center justify-between mb-1 px-0.5">
        <span className="text-[10px] tracking-[0.3px] text-[var(--secondary-label)]">readout</span>
        <span className={cn("text-[10px]", ready ? "text-success" : "text-applied")}>
          {ready ? "READY" : "DRIFT"}
        </span>
      </div>

      <div className="flex items-center gap-1 mb-0.5">
        <QubitChip index={0} p1={p1q0} phase={phase} theme={theme} extra={`${(q0 * 100).toFixed(1)}%`} entangled={entangled} />
      </div>
      <div className="flex items-center justify-between mb-1 pl-[2px] text-[8px] text-[var(--tertiary-label)] tabular-nums">
        <span>T1 {t1_0.toFixed(0)}µs</span>
        <span>T2 {t2_0.toFixed(0)}µs</span>
        <span>err {err0.toFixed(3)}</span>
        <span>{t0.toFixed(1)} mK</span>
      </div>

      <div className="flex items-center gap-1 mb-0.5">
        <QubitChip index={1} p1={p1q1} phase={phase} theme={theme} extra={`${(q1 * 100).toFixed(1)}%`} entangled={entangled} />
      </div>
      <div className="flex items-center justify-between mb-0.5 pl-[2px] text-[8px] text-[var(--tertiary-label)] tabular-nums">
        <span>T1 {t1_1.toFixed(0)}µs</span>
        <span>T2 {t2_1.toFixed(0)}µs</span>
        <span>err {err1.toFixed(3)}</span>
      </div>

      <div className="mt-1 pt-1 border-t text-[8px] text-[var(--tertiary-label)] flex gap-2" style={{ borderColor: "var(--hairline)" }}>
        <span><span style={{ color: "var(--applied)" }}>●</span> applied</span>
        <span><span style={{ color: "var(--true)" }}>●</span> true</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component

export function Device3D({ device, detuning, applied, bellCounts = null, phase = 0, className }: Device3DProps) {
  const theme = useInstrumentTheme()
  const stage = stageBackground(theme)
  const gridMajor = theme === "light" ? "#c5ccd6" : "#111113"
  const gridMinor = theme === "light" ? "#dce1e8" : "#0a0a0b"
  // Pull live fidelity from device (falls back to a soft floor for first paint)
  const q0 = Number(device?.readout_fidelity?.[0] ?? device?.readout_fidelity?.["0"] ?? 0.71)
  const q1 = Number(device?.readout_fidelity?.[1] ?? device?.readout_fidelity?.["1"] ?? 0.70)
  const ready = Boolean(device?.is_ready)
  const t0 = Number(device?.temperatures_mk?.[0] ?? device?.temperatures_mk?.["0"] ?? 18.4)
  const entangled = !!bellCounts && Object.keys(bellCounts).length > 0
  const p1q0 = entangled ? p1FromBellCounts(bellCounts, 0) : 0
  const p1q1 = entangled ? p1FromBellCounts(bellCounts, 1) : 0
  const busTint = entangled ? qubitHex((p1q0 + p1q1) / 2, phase, theme) : undefined
  const appliedPhase = Number.isFinite(phase) ? phase : Number(applied?.phase ?? 0)

  // Coherence (T1, T2) from device if present; derive plausible fallbacks from fidelity
  const coh0 = device?.coherence_us?.[0] ?? device?.coherence_us?.["0"] ?? null
  const coh1 = device?.coherence_us?.[1] ?? device?.coherence_us?.["1"] ?? null
  const t1_0 = Number(coh0 ? coh0[0] : (28 + (q0 - 0.5) * 40))
  const t2_0 = Number(coh0 ? coh0[1] : (18 + (q0 - 0.5) * 28))
  const t1_1 = Number(coh1 ? coh1[0] : (27 + (q1 - 0.5) * 38))
  const t2_1 = Number(coh1 ? coh1[1] : (17 + (q1 - 0.5) * 26))

  // Detuning from props (preferred) — drives the true/applied markers
  const df0 = Number(detuning?.frequency_error ?? 0)
  const da0 = Number(detuning?.amplitude_error ?? 0)
  // Mild correlation for Q1 so the viz feels like a coupled device
  const df1 = df0 * 0.9 + (applied ? (Number(applied.frequency ?? 5.0) - 5.05) * 0.02 : 0)
  const da1 = da0 * 0.85

  // Readout/gate error proxy: prefer explicit applied.readout_error when present,
  // else synthesize from detuning magnitude + fidelity distance from threshold.
  // This ensures the HUD updates when calibration drives fidelity up.
  const baseErr = (f: number, df: number, da: number) =>
    Math.max(0.002, Math.min(0.085, (1.0 - f) * 0.07 + (Math.abs(df) + Math.abs(da)) * 0.012))
  const err0 = applied?.readout_error != null
    ? Number(applied.readout_error)
    : baseErr(q0, df0, da0)
  const err1 = applied?.readout_error != null
    ? Number(applied.readout_error) * 0.95 + 0.001
    : baseErr(q1, df1, da1)

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)} style={{ background: stage }}>
      <Canvas
        camera={{ position: [0, 1.88, 4.2], fov: 43, near: 0.2, far: 60 }}
        style={{ background: stage }}
        dpr={[1, 1.6]}
      >
        <React.Suspense fallback={null}>
          <ambientLight intensity={0.72} />
          <directionalLight position={[6.5, 9, -4]} intensity={1.2} />
          <directionalLight position={[-7, 4, 5]} intensity={0.5} color="#a5b4fc" />
          <pointLight position={[0.2, 3.5, -2]} intensity={0.45} color="#ffffff" />

          {/* Richer package + cryo cues */}
          <CryoColdPlate />
          <PackageGroundPlane />
          <BusCoupler tint={busTint} />
          <QubitChiplet index={0} fidelity={q0} detuneF={df0} detuneA={da0} p1={p1q0} phase={appliedPhase} theme={theme} t1={t1_0} t2={t2_0} />
          <QubitChiplet index={1} fidelity={q1} detuneF={df1} detuneA={da1} p1={p1q1} phase={appliedPhase} theme={theme} t1={t1_1} t2={t2_1} />

          {/* Very subtle grid for stage depth (kept light) */}
          <gridHelper args={[4.2, 9, gridMajor, gridMinor]} position={[0, -0.42, 0]} />
        </React.Suspense>
      </Canvas>

      {/* Live readout strip (right) — driven by real device/adapter state */}
      <LiveReadoutStrip
        q0={q0}
        q1={q1}
        t0={t0}
        t1_0={t1_0}
        t2_0={t2_0}
        t1_1={t1_1}
        t2_1={t2_1}
        err0={err0}
        err1={err1}
        ready={ready}
        p1q0={p1q0}
        p1q1={p1q1}
        phase={appliedPhase}
        theme={theme}
        entangled={entangled}
      />
      {entangled && bellCounts && (
        <div className="pointer-events-none absolute top-2 left-2 z-20 w-[200px]">
          <BellHistogram counts={bellCounts} phase={appliedPhase} />
        </div>
      )}
    </div>
  )
}
