/**
 * Coda 2 qubit color language — "fridge poles".
 *
 * Two thermodynamic poles, not IBM Quantum's blue/purple brand gradient:
 *   |0⟩ Cryo  — mixing-chamber argon (teal). Ground state. ~10–20 mK.
 *   |1⟩ Ember — copper thermal leak (warm copper). Excited state.
 *
 * Interpolation is RGB so the midpoint is olive/bronze. The short HSL arc
 * between teal and copper runs through blue→purple — that is IBM Compass
 * territory and is intentionally avoided.
 *
 * Phase (radians) is a small hue rotation (±16°) around the interpolated
 * color so identity stays fridge-poles. Entangled pairs share one linked
 * gradient rather than two independent swatches.
 */

export type RGB = { r: number; g: number; b: number }
export type ThemeMode = "dark" | "light"

/** Dark-stage fills — vivid on black. */
export const CRYO_DARK: RGB = { r: 31, g: 184, b: 160 } // #1FB8A0
export const EMBER_DARK: RGB = { r: 224, g: 112, b: 48 } // #E07030

/** Light-stage fills — darker so AA text-on-page still holds. */
export const CRYO_LIGHT: RGB = { r: 11, g: 107, b: 92 } // #0B6B5C
export const EMBER_LIGHT: RGB = { r: 176, g: 68, b: 18 } // #B04412

/** IBM Quantum Compass hue band we must not land in (blue → purple). */
export const IBM_HUE_MIN = 220
export const IBM_HUE_MAX = 300

const PHASE_HUE_SPAN = 16

export function poles(theme: ThemeMode = "dark"): { cryo: RGB; ember: RGB } {
  return theme === "light"
    ? { cryo: CRYO_LIGHT, ember: EMBER_LIGHT }
    : { cryo: CRYO_DARK, ember: EMBER_DARK }
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const u = clamp01(t)
  return {
    r: lerp(a.r, b.r, u),
    g: lerp(a.g, b.g, u),
    b: lerp(a.b, b.b, u),
  }
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

/** Hue in degrees [0, 360). */
export function rgbHue({ r, g, b }: RGB): number {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  if (d < 1e-6) return 0
  let h = 0
  if (max === R) h = ((G - B) / d) % 6
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  h *= 60
  if (h < 0) h += 360
  return h
}

export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-6) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  return { h: rgbHue({ r, g, b }), s, l }
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hh = ((h % 360) + 360) % 360
  const C = (1 - Math.abs(2 * l - 1)) * s
  const X = C * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = l - C / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) {
    rp = C
    gp = X
  } else if (hh < 120) {
    rp = X
    gp = C
  } else if (hh < 180) {
    gp = C
    bp = X
  } else if (hh < 240) {
    gp = X
    bp = C
  } else if (hh < 300) {
    rp = X
    bp = C
  } else {
    rp = C
    bp = X
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  }
}

/**
 * Shift hue by a small signed amount. Keeps the fridge-pole identity —
 * never used to walk the IBM blue/purple arc.
 */
export function shiftHue(rgb: RGB, deg: number): RGB {
  const { h, s, l } = rgbToHsl(rgb)
  return hslToRgb(h + deg, s, l)
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

/** Ink that meets WCAG AA (4.5:1) against a fill, preferring dark on bright fills. */
export function inkOn(fill: RGB): RGB {
  const dark: RGB = { r: 18, g: 16, b: 14 }
  const light: RGB = { r: 255, g: 252, b: 247 }
  return contrastRatio(fill, dark) >= 4.5 ? dark : light
}

export function isIbmHue(h: number): boolean {
  return h >= IBM_HUE_MIN && h <= IBM_HUE_MAX
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
  const { cryo, ember } = poles(theme)
  const mixed = mixRgb(cryo, ember, clamp01(p1))
  const wrap = Number.isFinite(phaseRad) ? phaseRad : 0
  const hueShift = Math.sin(wrap) * PHASE_HUE_SPAN
  return shiftHue(mixed, hueShift)
}

export function qubitHex(
  p1: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): string {
  return rgbToHex(qubitColor(p1, phaseRad, theme))
}

/** Linked gradient for an entangled pair — one stroke, two poles. */
export function pairGradient(
  p1a: number,
  p1b: number,
  phaseRad = 0,
  theme: ThemeMode = "dark",
): { from: string; to: string; css: string } {
  const from = qubitHex(p1a, phaseRad, theme)
  const to = qubitHex(p1b, phaseRad + Math.PI * 0.15, theme)
  return {
    from,
    to,
    css: `linear-gradient(90deg, ${from} 0%, ${to} 100%)`,
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
  const { cryo, ember } = poles(theme)
  const a = bitstring[0] === "1" ? ember : cryo
  const b = bitstring[1] === "1" ? ember : cryo
  if (bitstring === "00" || bitstring === "11") {
    const fill = rgbToHex(a)
    return { fill, css: fill }
  }
  const from = rgbToHex(a)
  const to = rgbToHex(b)
  return {
    fill: rgbToHex(mixRgb(a, b, 0.5)),
    css: `linear-gradient(180deg, ${from} 0%, ${to} 100%)`,
  }
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
