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
import { useControls } from "leva"
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
  const geo = React.useMemo(() => new THREE.PlaneGeometry(2.4, 2.4, 64, 64), [])

  const trueOffset = React.useMemo(() => {
    const fx = Number(detuning?.frequency_error ?? 0)
    const ay = Number(detuning?.amplitude_error ?? 0)
    // Map physical detuning into scene units (≈ ±0.9)
    return new THREE.Vector2(
      THREE.MathUtils.clamp(fx * 8, -0.95, 0.95),
      THREE.MathUtils.clamp(ay * 8, -0.95, 0.95),
    )
  }, [detuning])

  React.useLayoutEffect(() => {
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const color = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      // Landscape peaked at true target (trueOffset)
      const dx = x - trueOffset.x
      const dy = y - trueOffset.y
      const f = estimateFidelity(dx, dy, latestFidelity || 0.75)
      pos.setZ(i, (f - 0.5) * surfaceGain)
      // emerald → amber → red
      if (f >= 0.88) color.setRGB(0.06, 0.75, 0.45)
      else if (f >= 0.75) color.setRGB(0.96, 0.62, 0.04)
      else color.setRGB(0.86, 0.2, 0.27)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    pos.needsUpdate = true
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
  }, [geo, trueOffset, latestFidelity, surfaceGain])

  useFrame((_, dt) => {
    if (!meshRef.current) return
    // Slow breathe — transform only
    meshRef.current.rotation.z = Math.sin(performance.now() * 0.00015) * 0.02
    meshRef.current.rotation.x = -Math.PI / 2.35 + Math.sin(performance.now() * 0.0001) * 0.01
    void dt
  })

  return (
    <mesh ref={meshRef} geometry={geo} rotation={[-Math.PI / 2.35, 0, 0]} position={[0, -0.15, 0]}>
      <meshStandardMaterial vertexColors wireframe={wireframe} flatShading={false} metalness={0.15} roughness={0.55} />
    </mesh>
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
    if (trueRef.current) {
      trueRef.current.position.y = 0.55 + Math.sin(t) * 0.04
    }
    if (appliedRef.current) {
      appliedRef.current.position.y = 0.45 + Math.sin(t + 1.2) * 0.03
    }
  })

  return (
    <group>
      {/* Applied params sit at landscape origin (what we set) */}
      <mesh ref={appliedRef} position={[0, 0.45, 0]}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.55} />
      </mesh>
      {/* True target drifts with live detuning */}
      <mesh ref={trueRef} position={[trueX, 0.55, trueY]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[trueX, 0.02, trueY]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.14, 32]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.55} />
      </mesh>
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
  return (
    <>
      <color attach="background" args={["#09090b"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <directionalLight position={[-2, 2, -3]} intensity={0.35} color="#67e8f9" />
      <FidelitySurface detuning={detuning} latestFidelity={latestFidelity} wireframe={wireframe} surfaceGain={surfaceGain} />
      <Markers detuning={detuning} />
      <gridHelper args={[3, 12, "#27272a", "#18181b"]} position={[0, -0.35, 0]} />
      <OrbitControls enablePan={false} minDistance={2.2} maxDistance={5.5} maxPolarAngle={Math.PI / 2.1} />
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
  const { wireframe, surfaceGain } = useControls("Drift surface", {
    wireframe: false,
    surfaceGain: { value: 1.6, min: 0.8, max: 2.4, step: 0.1 },
  }, { collapsed: true })
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
    <div className={cn("relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-zinc-950", className)}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [1.6, 1.5, 2.2], fov: 42, near: 0.1, far: 40 }}
        gl={glFactory as unknown as React.ComponentProps<typeof Canvas>["gl"]}
      >
        <React.Suspense fallback={null}>
          <Scene detuning={detuning} latestFidelity={latestFidelity} wireframe={wireframe} surfaceGain={surfaceGain} />
        </React.Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2 text-[10px]">
        <div className="rounded bg-black/50 px-2 py-1 font-mono text-zinc-300 backdrop-blur">
          <span className="text-cyan-400">●</span> true target &nbsp;
          <span className="text-amber-400">●</span> applied &nbsp;
          drift={driftMag.toFixed(4)}
          {applied?.frequency != null && (
            <span className="text-zinc-500">
              {" "}
              · f={applied.frequency.toFixed(3)} a={Number(applied.amplitude ?? 0).toFixed(3)}
            </span>
          )}
        </div>
        <div
          className={cn(
            "rounded px-2 py-1 font-mono backdrop-blur",
            mode === "webgpu"
              ? "bg-emerald-950/70 text-emerald-300"
              : mode === "checking"
                ? "bg-zinc-900/70 text-zinc-400"
                : "bg-amber-950/70 text-amber-300",
          )}
        >
          {mode === "webgpu" && "WebGPU"}
          {mode === "webgl" && "WebGL fallback"}
          {mode === "checking" && "init…"}
          {mode === "unavailable" && "GPU unavailable"}
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
