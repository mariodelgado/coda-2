import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  CRYO_DARK,
  CRYO_LIGHT,
  EMBER_DARK,
  EMBER_LIGHT,
  contrastRatio,
  inkOn,
  isIbmHue,
  needleAngle,
  nextGoldenStation,
  outcomeColor,
  p1FromBellCounts,
  pairGradient,
  qubitColor,
  rgbHue,
  rgbToHex,
} from "./qubit-color.ts"

const PAPER: { r: number; g: number; b: number } = { r: 242, g: 237, b: 228 }
const VOID: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
const INK: { r: number; g: number; b: number } = { r: 26, g: 22, b: 19 }
const SNOW: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }

describe("fridge poles", () => {
  it("p1=0 is cryo, p1=1 is ember (both themes)", () => {
    assert.equal(rgbToHex(qubitColor(0, 0, "dark")), rgbToHex(CRYO_DARK))
    assert.equal(rgbToHex(qubitColor(1, 0, "dark")), rgbToHex(EMBER_DARK))
    assert.equal(rgbToHex(qubitColor(0, 0, "light")), rgbToHex(CRYO_LIGHT))
    assert.equal(rgbToHex(qubitColor(1, 0, "light")), rgbToHex(EMBER_LIGHT))
  })

  it("superposition midpoint is olive/bronze, not IBM blue/purple", () => {
    for (const theme of ["dark", "light"] as const) {
      const mid = qubitColor(0.5, 0, theme)
      const h = rgbHue(mid)
      assert.equal(isIbmHue(h), false, `mid hue ${h} in IBM band`)
      // RGB mix of teal+copper lands in yellow-green / olive (~70–110°)
      assert.ok(h > 40 && h < 160, `unexpected mid hue ${h}`)
    }
  })

  it("phase hue-shift stays outside the IBM blue/purple band", () => {
    const phases = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0.3, 2.2]
    const p1s = [0, 0.25, 0.5, 0.75, 1]
    for (const theme of ["dark", "light"] as const) {
      for (const p1 of p1s) {
        for (const ph of phases) {
          const h = rgbHue(qubitColor(p1, ph, theme))
          assert.equal(isIbmHue(h), false, `p1=${p1} φ=${ph} hue=${h}`)
        }
      }
    }
  })

  it("entangled pair gradient endpoints encode each qubit", () => {
    const g = pairGradient(0, 1, 0, "dark")
    assert.equal(g.from, rgbToHex(CRYO_DARK))
    assert.match(g.css, /linear-gradient/)
    assert.notEqual(g.from, g.to)
  })

  it("Bell counts: bitstring is q0q1", () => {
    const counts = { "00": 400, "01": 50, "10": 60, "11": 490 }
    assert.ok(Math.abs(p1FromBellCounts(counts, 0) - 550 / 1000) < 1e-9)
    assert.ok(Math.abs(p1FromBellCounts(counts, 1) - 540 / 1000) < 1e-9)
    assert.equal(p1FromBellCounts(null, 0), 0)
  })

  it("histogram outcomes: |00> cryo, |11> ember, mixed are blends", () => {
    assert.equal(outcomeColor("00", "dark").fill, rgbToHex(CRYO_DARK))
    assert.equal(outcomeColor("11", "dark").fill, rgbToHex(EMBER_DARK))
    assert.match(outcomeColor("01", "dark").css, /linear-gradient/)
    assert.match(outcomeColor("10", "dark").css, /linear-gradient/)
  })
})

describe("golden-path needle", () => {
  it("points Calibrate → READY → Bell", () => {
    assert.equal(nextGoldenStation({ hasCalibrated: false, isReady: false, hasBell: false }), "calibrate")
    assert.equal(nextGoldenStation({ hasCalibrated: true, isReady: false, hasBell: false }), "ready")
    assert.equal(nextGoldenStation({ hasCalibrated: true, isReady: true, hasBell: false }), "bell")
    assert.equal(nextGoldenStation({ hasCalibrated: true, isReady: true, hasBell: true }), "bell")
    assert.ok(needleAngle("calibrate") < needleAngle("ready"))
    assert.ok(needleAngle("ready") < needleAngle("bell"))
  })
})

describe("WCAG AA contrast", () => {
  it("page text meets 4.5:1 in both themes", () => {
    assert.ok(contrastRatio(SNOW, VOID) >= 4.5)
    assert.ok(contrastRatio(INK, PAPER) >= 4.5)
  })

  it("ink on cryo/ember fills meets 4.5:1", () => {
    for (const fill of [CRYO_DARK, EMBER_DARK, CRYO_LIGHT, EMBER_LIGHT]) {
      assert.ok(contrastRatio(fill, inkOn(fill)) >= 4.5, rgbToHex(fill))
    }
  })

  it("pole-as-text on page backgrounds meets 4.5:1", () => {
    assert.ok(contrastRatio(CRYO_LIGHT, PAPER) >= 4.5)
    assert.ok(contrastRatio(EMBER_LIGHT, PAPER) >= 4.5)
    assert.ok(contrastRatio(CRYO_DARK, VOID) >= 4.5)
    assert.ok(contrastRatio(EMBER_DARK, VOID) >= 4.5)
  })
})
