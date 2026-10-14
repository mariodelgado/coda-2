/**
 * Coda 2 qubit color language — spectral poles.
 *
 * Luminous cool gradient in the spirit of IBM Quantum Compass, not their
 * brand path (blue → purple → magenta). Ours:
 *   |0⟩ Indigo  — deep electric ultramarine (OKLCH H ≈ 252°)
 *   mid  Cyan   — vivid spectral midpoint (H ≈ 216°)
 *   |1⟩ Ice     — pale ice-mint / cyan (H ≈ 180°)
 *
 * Interpolation is OKLCH so chroma stays high. RGB mixing of these poles
 * goes grey-teal; we never do that. Hue travels the short decreasing arc
 * (indigo → cyan → mint). Phase is a small OKLCH hue rotation (±8°).
 * Entangled pairs share one linked spectral gradient.
 */

export type RGB = { r: number; g: number; b: number }
export type OKLCH = { l: number; c: number; h: number }
export type ThemeMode = "dark" | "light"

/** Dark fills — luminous on black. */
export const INDIGO_DARK_OKLCH: OKLCH = { l: 0.6, c: 0.18, h: 252 }
export const ICE_DARK_OKLCH: OKLCH = { l: 0.84, c: 0.14, h: 180 }

/** Light fills — saturated jewels on near-white, not pastel. */
export const INDIGO_LIGHT_OKLCH: OKLCH = { l: 0.42, c: 0.18, h: 252 }
export const ICE_LIGHT_OKLCH: OKLCH = { l: 0.58, c: 0.16, h: 188 }

/** IBM Compass magenta/purple-pink band we must not enter. */
export const IBM_MAGENTA_MIN = 280
export const IBM_MAGENTA_MAX = 340

const PHASE_HUE_SPAN = 8

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Shortest-arc hue mix, result in [0, 360). */
export function mixHue(h0: number, h1: number, t: number): number {
  const d = ((h1 - h0 + 540) % 360) - 180
  return (h0 + d * t + 360) % 360
}

export function mixOklch(a: OKLCH, b: OKLCH, t: number): OKLCH {
  const u = clamp01(t)
  return {
    l: lerp(a.l, b.l, u),
    c: lerp(a.c, b.c, u),
    h: mixHue(a.h, b.h, u),
  }
}

export function polesOklch(theme: ThemeMode = "dark"): { indigo: OKLCH; ice: OKLCH } {
  return theme === "light"
    ? { indigo: INDIGO_LIGHT_OKLCH, ice: ICE_LIGHT_OKLCH }
    : { indigo: INDIGO_DARK_OKLCH, ice: ICE_DARK_OKLCH }
}

function srgbEncode(x: number): number {
  const y = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, y)) * 255)
}

function srgbDecode(u8: number): number {
  const x = u8 / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

function oklchToLinear(L: number, C: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function inGamut(lin: [number, number, number]): boolean {
  return lin.every((x) => x >= -0.002 && x <= 1.002)
}

/** OKLCH → sRGB with chroma reduction until in-gamut. */
export function oklchToRgb(ok: OKLCH): RGB {
  let lo = 0
  let hi = Math.max(0, ok.c)
  let best = oklchToLinear(ok.l, 0, ok.h)
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const lin = oklchToLinear(ok.l, mid, ok.h)
    if (inGamut(lin)) {
      lo = mid
      best = lin
    } else {
      hi = mid
    }
  }
  return { r: srgbEncode(best[0]), g: srgbEncode(best[1]), b: srgbEncode(best[2]) }
}

export function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const R = srgbDecode(r)
  const G = srgbDecode(g)
  const B = srgbDecode(b)
  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const C = Math.hypot(a, bb)
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: L, c: C, h }
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 0, g: 0, b: 0 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function oklchToHex(ok: OKLCH): string {
  return rgbToHex(oklchToRgb(ok))
}

export const INDIGO_DARK = oklchToRgb(INDIGO_DARK_OKLCH)
export const ICE_DARK = oklchToRgb(ICE_DARK_OKLCH)
export const INDIGO_LIGHT = oklchToRgb(INDIGO_LIGHT_OKLCH)
export const ICE_LIGHT = oklchToRgb(ICE_LIGHT_OKLCH)

export function poles(theme: ThemeMode = "dark"): { indigo: RGB; ice: RGB } {
  return theme === "light"
    ? { indigo: INDIGO_LIGHT, ice: ICE_LIGHT }
    : { indigo: INDIGO_DARK, ice: ICE_DARK }
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const u = clamp01(t)
  return { r: lerp(a.r, b.r, u), g: lerp(a.g, b.g, u), b: lerp(a.b, b.b, u) }
}

/** Hue in degrees [0, 360). */
export function rgbHue(rgb: RGB): number {
  return rgbToOklch(rgb).h
}

export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: RGB, b: RGB): number {
  const L1 = relativeLuminance(a)
  const L2 = relativeLuminance(b)
  const hi = Math.max(L1, L2)
  const lo = Math.min(L1, L2)
  return (hi + 0.05) / (lo + 0.05)
}

export function inkOn(fill: RGB): RGB {
  const dark: RGB = { r: 14, g: 18, b: 24 }
  const light: RGB = { r: 247, g: 249, b: 252 }
  return contrastRatio(fill, dark) >= 4.5 ? dark : light
}

export function isIbmMagenta(h: number): boolean {
  return h >= IBM_MAGENTA_MIN && h <= IBM_MAGENTA_MAX
}

/** @deprecated use isIbmMagenta — indigo lives near 250°, which is not IBM's magenta path. */
export function isIbmHue(h: number): boolean {
  return isIbmMagenta(h)
}

/**
 * Color for a single qubit from measured P(|1⟩) and Bloch phase (radians).
 * Unmeasured qubits should pass p1 = 0 (reset to |0⟩).
 */
export function qubitColor(
  p1: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): RGB {
  const { indigo, ice } = polesOklch(theme)
  const mixed = mixOklch(indigo, ice, clamp01(p1))
  const wrap = Number.isFinite(phaseRad) ? phaseRad : 0
  mixed.h = (mixed.h + Math.sin(wrap) * PHASE_HUE_SPAN + 360) % 360
  return oklchToRgb(mixed)
}

export function qubitHex(
  p1: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): string {
  return rgbToHex(qubitColor(p1, phaseRad, theme))
}

export function qubitOklch(
  p1: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): OKLCH {
  return rgbToOklch(qubitColor(p1, phaseRad, theme))
}

/** Three-stop spectral CSS gradient (OKLCH mid so it stays cyan, not grey). */
export function spectralCss(from: RGB, to: RGB, angle = "90deg"): string {
  const a = rgbToOklch(from)
  const b = rgbToOklch(to)
  const mid = oklchToHex(mixOklch(a, b, 0.5))
  const f = rgbToHex(from)
  const t = rgbToHex(to)
  return `linear-gradient(${angle} in oklch, ${f} 0%, ${mid} 50%, ${t} 100%)`
}

/** Linked gradient for an entangled pair — one stroke, two poles. */
export function pairGradient(
  p1a: number,
  p1b: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): { from: string; to: string; css: string } {
  const fromRgb = qubitColor(p1a, phaseRad, theme)
  const toRgb = qubitColor(p1b, phaseRad + Math.PI * 0.15, theme)
  return {
    from: rgbToHex(fromRgb),
    to: rgbToHex(toRgb),
    css: spectralCss(fromRgb, toRgb, "90deg"),
  }
}

/**
 * Bell bitstrings are q0q1 (see noisy_sim._simulate_bell_readout).
 * "10" = q0=1, q1=0.
 */
export function p1FromBellCounts(
  counts: Record<string, number> | null | undefined,
  qubit: 0 | 1,
): number {
  if (!counts) return 0
  let total = 0
  let ones = 0
  for (const [bitstring, n] of Object.entries(counts)) {
    const v = Number(n) || 0
    total += v
    const bit = bitstring[qubit]
    if (bit === "1") ones += v
  }
  if (total <= 0) return 0
  return ones / total
}

export function outcomeColor(
  bitstring: "00" | "01" | "10" | "11" | string,
  theme: ThemeMode = "dark",
): { fill: string; css: string } {
  const { indigo, ice } = poles(theme)
  const a = bitstring[0] === "1" ? ice : indigo
  const b = bitstring[1] === "1" ? ice : indigo
  if (bitstring === "00" || bitstring === "11") {
    const fill = rgbToHex(a)
    return { fill, css: fill }
  }
  return { fill: rgbToHex(oklchToRgb(mixOklch(rgbToOklch(a), rgbToOklch(b), 0.5))), css: spectralCss(a, b, "180deg") }
}

export type GoldenStation = "calibrate" | "ready" | "bell"

/** Compass angle (deg) the state needle should point. Calibrate=-52, READY=0, Bell=+52. */
export function needleAngle(next: GoldenStation): number {
  if (next === "calibrate") return -52
  if (next === "bell") return 52
  return 0
}

export function nextGoldenStation(input: {
  hasCalibrated: boolean
  isReady: boolean
  hasBell: boolean
}): GoldenStation {
  if (!input.hasCalibrated && !input.isReady) return "calibrate"
  if (!input.isReady) return "ready"
  if (!input.hasBell) return "bell"
  return "bell"
}

export type QubitVisual = {
  p1: number
  phase: number
  entangled: boolean
  hex: string
}

export function qubitVisual(
  p1: number,
  phaseRad: number,
  entangled: boolean,
  theme: ThemeMode = "dark",
): QubitVisual {
  return {
    p1: clamp01(p1),
    phase: phaseRad,
    entangled,
    hex: qubitHex(p1, phaseRad, theme),
  }
}

export function stageBackground(theme: ThemeMode): string {
  return theme === "light" ? "#EEF1F5" : "#000000"
}
