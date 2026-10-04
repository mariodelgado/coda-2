"use client"

/**
 * Calibration / param-drift visualization.
 *
 * Shows a fidelity landscape over (Δfreq, Δamp) with:
 * - surface height = estimated readout/circuit fidelity given detuning
 * - amber marker = applied calibration params (origin of applied frame)
 * - cyan marker = hidden "true" target implied by live detuning
 *
 * Uses R3F Canvas + async WebGPURenderer (three/webgpu) when navigator.gpu
 * is available; otherwise WebGLRenderer with an explicit fallback banner.
 */

import * as React from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { cn } from "@/lib/utils"

export interface CalibrationSurfaceProps {
  detuning: Record<string, number> | null
  applied: {
    frequency?: number
    amplitude?: number
    phase?: number
    readout_error?: number
  } | null
  fidelityHistory: Array<{ iter: number; fidelity: number }>
  readinessScore: number
  readoutFidelity: Record<string, number> | null
  className?: string
}

type GpuMode = "checking" | "webgpu" | "webgl" | "unavailable"

function estimateFidelity(dx: number, dy: number, base: number): number {
  // Deterministic landscape: fidelity falls off with param error distance.
  const r2 = dx * dx + dy * dy
  const peak = Math.min(0.995, Math.max(0.55, base))
  return Math.max(0.45, peak * Math.exp(-r2 * 18) + 0.45 * Math.exp(-r2 * 2))
}

function FidelitySurface({
  detuning,
  latestFidelity,
  wireframe,
  surfaceGain,
}: {
  detuning: Record<string, number> | null
  latestFidelity: number
  wireframe: boolean
  surfaceGain: number
}) {
  const meshRef = React.useRef<THREE.Mesh>(null)

  const trueOffset = React.useMemo(() => {
    const fx = Number(detuning?.frequency_error ?? 0)
    const ay = Number(detuning?.amplitude_error ?? 0)
    // Map physical detuning into scene units (≈ ±0.9)
    return new THREE.Vector2(
      THREE.MathUtils.clamp(fx * 8, -0.95, 0.95),
      THREE.MathUtils.clamp(ay * 8, -0.95, 0.95),
    )
  }, [detuning])

  // Derive a fresh geometry whenever the drift/target or fidelity changes.
  // This is cheap (64×64 grid) and avoids mutating previous buffer state.
  const geo = React.useMemo(() => {
    const g = new THREE.PlaneGeometry(2.4, 2.4, 64, 64)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const color = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const dx = x - trueOffset.x
      const dy = y - trueOffset.y
      const f = estimateFidelity(dx, dy, latestFidelity || 0.75)
      pos.setZ(i, (f - 0.5) * surfaceGain)
      // iOS system palette (no purple): system blue for high/true, system orange for mid/applied, tertiary gray for low
      if (f >= 0.88) color.setHex(0x007AFF)
      else if (f >= 0.75) color.setHex(0xFF9500)
      else color.setHex(0x8E8E93)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    pos.needsUpdate = true
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [trueOffset, latestFidelity, surfaceGain])

  useFrame((_, dt) => {
    if (!meshRef.current) return
    // Slow breathe — small deltas only. Base tilt lives on the parent group so the
    // gridHelper shares the exact same plane (no skew, no vertical offset).
    meshRef.current.rotation.z = Math.sin(performance.now() * 0.00015) * 0.02
    meshRef.current.rotation.x = Math.sin(performance.now() * 0.0001) * 0.01
    void dt
  })

  return (
    <>
      <mesh ref={meshRef} geometry={geo}>
        <meshStandardMaterial vertexColors wireframe={wireframe} flatShading={false} metalness={0.15} roughness={0.55} />
      </mesh>
      {/* Projection ring on the exact shared local plane (Z small to sit above grid, no extra rotation). */}
      <mesh position={[trueOffset.x, trueOffset.y, 0.003]}>
        <ringGeometry args={[0.095, 0.135, 32]} />
        <meshBasicMaterial color="#007AFF" transparent opacity={0.45} />
      </mesh>
    </>
  )
}

function Markers({
  detuning,
}: {
  detuning: Record<string, number> | null
}) {
  const trueX = THREE.MathUtils.clamp(Number(detuning?.frequency_error ?? 0) * 8, -0.95, 0.95)
  const trueY = THREE.MathUtils.clamp(Number(detuning?.amplitude_error ?? 0) * 8, -0.95, 0.95)
  const appliedRef = React.useRef<THREE.Mesh>(null)
  const trueRef = React.useRef<THREE.Mesh>(null)

  useFrame(() => {
    const t = performance.now() * 0.003
    // Animate along local +Z (normal to the shared tilted plane) so markers
    // "float" above the surface without breaking grid/surface coplanarity.
    if (trueRef.current) {
      trueRef.current.position.z = 0.03 + Math.sin(t) * 0.025
    }
    if (appliedRef.current) {
      appliedRef.current.position.z = 0.025 + Math.sin(t + 1.2) * 0.02
    }
  })

  return (
    <group>
      {/* Applied params sit at landscape origin (local XY on the shared plane) — system orange.
          Small +Z keeps it above the grid/surface without a separate rotation. */}
      <mesh ref={appliedRef} position={[0, 0, 0.025]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial color="#FF9500" emissive="#FF9500" emissiveIntensity={0.65} />
      </mesh>
      {/* True target drifts with live detuning (local XY on the shared plane) — system blue. */}
      <mesh ref={trueRef} position={[trueX, trueY, 0.03]}>
        <sphereGeometry args={[0.072, 16, 16]} />
        <meshStandardMaterial color="#007AFF" emissive="#007AFF" emissiveIntensity={0.85} />
      </mesh>
      {/* Projection ring lives in FidelitySurface on the exact same local plane (Z≈0). */}
    </group>
  )
}

function Scene({
  detuning,
  latestFidelity,
  wireframe,
  surfaceGain,
}: {
  detuning: Record<string, number> | null
  latestFidelity: number
  wireframe: boolean
  surfaceGain: number
}) {
  // Framing lift + zoom-out for layout polish: camera farther back + higher subject bias
  // so the peak/grid/HUD fit the pane without crowding the dock or overflowing splitters.
  const subjectLiftY = 0.52
  const orbitTarget: [number, number, number] = [0, 0.02, 0]

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4.5, 7.5, 3.5]} intensity={1.55} />
      <directionalLight position={[-5, 2.5, -6]} intensity={0.55} color="#a5b4fc" />
      <pointLight position={[0.5, 4.2, 1.5]} intensity={0.7} color="#ffffff" />
      {/* Shared tilted plane for surface + grid + ring projection.
          Rotation applied once here so gridHelper, FidelitySurface (Z=0 local),
          and ring share an identical plane (no skew, no vertical float).
          subjectLiftY + orbitTarget framing intentionally preserved. */}
      <group position={[0, subjectLiftY, 0]} rotation={[-Math.PI / 2.35, 0, 0]}>
        <FidelitySurface detuning={detuning} latestFidelity={latestFidelity} wireframe={wireframe} surfaceGain={surfaceGain} />
        <Markers detuning={detuning} />
        {/* Grid sits on the same local plane as the surface (tiny depth offset for draw order).
            Raised contrast vs pure black stage / fidelity surface; iOS-muted neutral grays (no neon/purple). */}
        <gridHelper args={[3, 12, "#3a3a3e", "#2b2b2f"]} position={[0, 0, -0.003]} />
      </group>
      <OrbitControls
        enablePan={false}
        target={orbitTarget}
        minDistance={2.1}
        maxDistance={6.4}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

async function createGl(
  props: { canvas: HTMLCanvasElement; context?: WebGLRenderingContext; defaultProps?: Record<string, unknown> },
  onMode: (m: GpuMode) => void,
  // R3F accepts WebGPURenderer via the async gl factory; widen return for TS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { canvas } = props
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator

  if (hasGpu) {
    try {
      // Dynamic import keeps three/webgpu out of the SSR graph and allows clean fallback.
      const webgpu = await import("three/webgpu")
      // WebGPURenderer is structurally different from WebGLRenderer; cast via unknown.
      const RendererCtor = webgpu.WebGPURenderer as unknown as new (params: {
        canvas: HTMLCanvasElement
        antialias?: boolean
        alpha?: boolean
      }) => { init: () => Promise<void>; setClearColor?: (c: number, a: number) => void }

      const renderer = new RendererCtor({
        canvas,
        antialias: true,
        alpha: true,
      })
      await renderer.init()
      onMode("webgpu")
      return renderer
    } catch {
      // fall through
    }
  }

  onMode("webgl")
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  })
  renderer.setClearColor(0x09090b, 1)
  return renderer
}

export function CalibrationSurface({
  detuning,
  applied,
  fidelityHistory,
  readinessScore,
  readoutFidelity,
  className,
}: CalibrationSurfaceProps) {
  const [mode, setMode] = React.useState<GpuMode>("checking")
  // No Leva debug panel in production/demo. Fixed sane defaults for the drift surface.
  const wireframe = false
  const surfaceGain = 1.6
  const latestFidelity = React.useMemo(() => {
    if (fidelityHistory.length) return fidelityHistory[fidelityHistory.length - 1].fidelity
    if (readoutFidelity) {
      const vals = Object.values(readoutFidelity)
      if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length
    }
    return readinessScore || 0.7
  }, [fidelityHistory, readoutFidelity, readinessScore])

  const glFactory = React.useCallback(
    (props: { canvas: HTMLCanvasElement }) => createGl(props, setMode),
    [],
  )

  const driftMag = React.useMemo(() => {
    if (!detuning) return 0
    const a = Number(detuning.frequency_error ?? 0)
    const b = Number(detuning.amplitude_error ?? 0)
    return Math.sqrt(a * a + b * b)
  }, [detuning])

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 2.85, 5.6], fov: 46, near: 0.1, far: 60 }}
        gl={glFactory as unknown as React.ComponentProps<typeof Canvas>["gl"]}
      >
        <React.Suspense fallback={null}>
          <Scene detuning={detuning} latestFidelity={latestFidelity} wireframe={wireframe} surfaceGain={surfaceGain} />
        </React.Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2 text-[10px]">
        <div className="rounded bg-black/60 px-2 py-1 font-mono text-zinc-300 backdrop-blur border border-white/10">
          <span style={{color: '#007AFF'}}>●</span> true &nbsp;
          <span style={{color: '#FF9500'}}>●</span> applied &nbsp;
          drift={driftMag.toFixed(4)}
          {applied?.frequency != null && (
            <span className="text-zinc-500">
              {" "}· f={applied.frequency.toFixed(3)} a={Number(applied.amplitude ?? 0).toFixed(3)}
            </span>
          )}
        </div>
        <div
          className={cn(
            "rounded px-2 py-1 font-mono backdrop-blur border border-white/10",
            mode === "webgpu"
              ? "bg-[#0a0a0f] text-[#007AFF]"
              : mode === "checking"
                ? "bg-[#0a0a0f] text-zinc-400"
                : "bg-[#0a0a0f] text-[#FF9500]",
          )}
        >
          {mode === "webgpu" && "WebGPU"}
          {mode === "webgl" && "WebGL"}
          {mode === "checking" && "init…"}
          {mode === "unavailable" && "no GPU"}
        </div>
      </div>

      {mode === "webgl" && typeof navigator !== "undefined" && !("gpu" in navigator) && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded border border-amber-900/40 bg-amber-950/50 px-2 py-1 text-[10px] text-amber-200/90">
          navigator.gpu missing — rendering via WebGL. Chrome/Edge with WebGPU enabled gets the WebGPU path.
        </div>
      )}
    </div>
  )
}
