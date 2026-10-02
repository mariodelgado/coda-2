"use client"

/**
 * 3D stylized hardware view of the QPU device.
 *
 * Shows a cryo-stage with two qubit chips/resonators.
 * Fidelity colors the qubit markers (iOS blue = good, orange = drifting, gray = poor).
 * Small applied (orange) / true (blue) dots visualize detuning per qubit.
 * Temperatures and readiness are overlaid live.
 *
 * Pure R3F / three, no Leva. Uses the same iOS palette as the rest of the instrument.
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import * as THREE from "three"
import { cn } from "@/lib/utils"

export interface Device3DProps {
  device: {
    is_ready?: boolean
    temperatures_mk?: Record<string | number, number>
    readout_fidelity?: Record<string | number, number>
    notes?: string
  } | null
  detuning: Record<string, number> | null
  applied: {
    frequency?: number
    amplitude?: number
    phase?: number
    readout_error?: number
  } | null
  className?: string
}

function Qubit({
  index,
  fidelity,
  detuneF,
  detuneA,
  isReady,
}: {
  index: number
  fidelity: number
  detuneF: number
  detuneA: number
  isReady: boolean
}) {
  const groupRef = React.useRef<THREE.Group>(null)

  const good = fidelity >= 0.88
  const mid = fidelity >= 0.75
  // iOS palette only (no purple)
  const qColor = good ? "#007AFF" : mid ? "#FF9500" : "#8E8E93"

  const x = index === 0 ? -0.95 : 0.95

  // small live wobble so it feels "alive" but only transform
  useFrame(() => {
    if (groupRef.current) {
      const t = performance.now() * 0.0009 + index
      groupRef.current.rotation.y = Math.sin(t) * 0.06
      groupRef.current.position.y = Math.sin(t * 1.1) * 0.008
    }
  })

  // Map detuning magnitude into a small visible offset for the "true" marker
  const trueDx = THREE.MathUtils.clamp(detuneF * 3.2, -0.22, 0.22)
  const trueDz = THREE.MathUtils.clamp(detuneA * 2.8, -0.18, 0.18)

  return (
    <group ref={groupRef} position={[x, 0.08, 0]}>
      {/* Resonator / chip body — dark metallic */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.82, 0.16, 0.48]} />
        <meshStandardMaterial color="#1f2937" metalness={0.65} roughness={0.45} />
      </mesh>

      {/* Subtle top face */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.78, 0.02, 0.44]} />
        <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Qubit marker (Bloch-ish) colored by live fidelity */}
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.165]} />
        <meshStandardMaterial color={qColor} emissive={qColor} emissiveIntensity={0.7} />
      </mesh>

      {/* Thin resonator ring */}
      <mesh position={[0, 0.09, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.26, 0.31, 28]} />
        <meshBasicMaterial color={qColor} transparent opacity={0.28} />
      </mesh>

      {/* Applied calibration position (amber/orange) */}
      <mesh position={[0.0, 0.18, 0.0]}>
        <sphereGeometry args={[0.045]} />
        <meshStandardMaterial color="#FF9500" emissive="#FF9500" emissiveIntensity={0.9} />
      </mesh>

      {/* True hardware position (blue), offset by live detuning */}
      <mesh position={[trueDx, 0.18, trueDz]}>
        <sphereGeometry args={[0.038]} />
        <meshStandardMaterial color="#007AFF" emissive="#007AFF" emissiveIntensity={0.85} />
      </mesh>

      {/* Small delta line between applied and true */}
      <mesh position={[(trueDx) * 0.5, 0.18, (trueDz) * 0.5]}>
        <cylinderGeometry args={[0.004, 0.004, Math.max(0.02, Math.sqrt(trueDx * trueDx + trueDz * trueDz)), 5]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.6} />
      </mesh>

      {/* Floating label */}
      <Html
        position={[0, 0.72, 0]}
        style={{
          fontSize: "9px",
          color: "#a1a1aa",
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

function CouplingResonator() {
  return (
    <group>
      {/* Bus / coupling element between qubits */}
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[1.6, 0.04, 0.08]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.35, 0.015, 0.05]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
    </group>
  )
}

function CryoStage() {
  return (
    <group>
      {/* Main cold plate */}
      <mesh position={[0, -0.22, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[2.05, 2.12, 0.09, 56, 1, false]} />
        <meshStandardMaterial color="#0f1115" metalness={0.75} roughness={0.55} />
      </mesh>
      {/* Inner polished ring */}
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[1.82, 1.82, 0.025, 56]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Subtle rim highlight */}
      <mesh position={[0, -0.12, 0]}>
        <ringGeometry args={[1.95, 2.08, 48]} />
        <meshBasicMaterial color="#334155" transparent opacity={0.35} side={2} />
      </mesh>
    </group>
  )
}

export function Device3D({ device, detuning, applied, className }: Device3DProps) {
  const q0 = Number(device?.readout_fidelity?.[0] ?? device?.readout_fidelity?.["0"] ?? 0.71)
  const q1 = Number(device?.readout_fidelity?.[1] ?? device?.readout_fidelity?.["1"] ?? 0.70)
  const ready = Boolean(device?.is_ready)
  const t0 = Number(device?.temperatures_mk?.[0] ?? device?.temperatures_mk?.["0"] ?? 18.4)

  const df0 = Number(detuning?.frequency_error ?? 0)
  const da0 = Number(detuning?.amplitude_error ?? 0)
  // For Q1 we synthesize a mild correlated detuning for viz (real adapter would return per-qubit)
  const df1 = df0 * 0.9 + (applied ? (Number(applied.frequency ?? 5.0) - 5.05) * 0.02 : 0)
  const da1 = da0 * 0.85

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-[#000000]", className)}>
      <Canvas
        camera={{ position: [0, 1.9, 3.9], fov: 44, near: 0.2, far: 40 }}
        style={{ background: "#000000" }}
        dpr={[1, 1.6]}
      >
        <React.Suspense fallback={null}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[6.5, 9, -4]} intensity={1.25} />
          <directionalLight position={[-7, 4, 5]} intensity={0.55} color="#a5b4fc" />
          <pointLight position={[0.2, 3.5, -2]} intensity={0.5} color="#ffffff" />

          <CryoStage />
          <CouplingResonator />
          <Qubit index={0} fidelity={q0} detuneF={df0} detuneA={da0} isReady={ready} />
          <Qubit index={1} fidelity={q1} detuneF={df1} detuneA={da1} isReady={ready} />

          {/* Very subtle grid for stage depth */}
          <gridHelper args={[4.2, 9, "#111113", "#0a0a0b"]} position={[0, -0.28, 0]} />
        </React.Suspense>
      </Canvas>

      {/* Live overlay badge — right side only (iOS mono). Left "cryo stage" removed to avoid collision with page-level stage label on device tab. */}
      <div className="pointer-events-none absolute top-1.5 right-1.5 text-[9px]">
        <div
          className={cn(
            "rounded px-1.5 py-px font-mono border border-white/10 flex items-center gap-1.5",
            ready ? "bg-[#052e16]/70 text-[#34C759]" : "bg-black/70 text-[#FF9500]"
          )}
        >
          <span>{ready ? "READY" : "DRIFT"}</span>
          <span className="text-zinc-500">·</span>
          <span>{t0.toFixed(1)} mK</span>
        </div>
      </div>

      {/* Small legend for applied vs true markers */}
      <div className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-px text-[9px] font-mono border border-white/10 text-zinc-400">
        <span style={{ color: "#FF9500" }}>●</span> applied
        <span className="mx-1 text-zinc-600">·</span>
        <span style={{ color: "#007AFF" }}>●</span> true
      </div>
    </div>
  )
}
