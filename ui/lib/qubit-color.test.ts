import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ICE_DARK,
  ICE_LIGHT,
  INDIGO_DARK,
  INDIGO_LIGHT,
  contrastRatio,
  inkOn,
  isIbmMagenta,
  mixRgb,
  needleAngle,
  nextGoldenStation,
  outcomeColor,
  p1FromBellCounts,
  pairGradient,
  qubitColor,
  rgbHue,
  rgbToHex,
  rgbToOklch,
} from "./qubit-color.ts"

const PAPER: { r: number; g: number; b: number } = { r: 244, g: 246, b: 248 }
const VOID: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
const INK: { r: number; g: number; b: number } = { r: 14, g: 18, b: 24 }
const SNOW: { r: number; g: number; b: number } = { r: 255, g: 255, b: 255 }

describe("spectral poles", () => {
  it("p1=0 is indigo, p1=1 is ice (both themes)", () => {
    assert.equal(rgbToHex(qubitColor(0, 0, "dark")), rgbToHex(INDIGO_DARK))
    assert.equal(rgbToHex(qubitColor(1, 0, "dark")), rgbToHex(ICE_DARK))
    assert.equal(rgbToHex(qubitColor(0, 0, "light")), rgbToHex(INDIGO_LIGHT))
    assert.equal(rgbToHex(qubitColor(1, 0, "light")), rgbToHex(ICE_LIGHT))
  })

  it("superposition midpoint is vivid cyan, not muddy grey and not IBM magenta", () => {
    for (const theme of ["dark", "light"] as const) {
      const mid = qubitColor(0.5, 0, theme)
      const ok = rgbToOklch(mid)
      assert.equal(isIbmMagenta(ok.h), false, `mid hue ${ok.h} in IBM magenta`)
      assert.ok(ok.h > 200 && ok.h < 235, `mid should be cyan, got H=${ok.h}`)
      assert.ok(ok.c >= 0.08, `mid chroma too low (muddy): C=${ok.c}`)
      const rgbMid = mixRgb(qubitColor(0, 0, theme), qubitColor(1, 0, theme), 0.5)
      assert.notEqual(rgbToHex(mid), rgbToHex(rgbMid), "OKLCH mix must differ from an RGB mix")
    }
  })

  it("hue travels indigo → cyan → ice (decreasing), never magenta", () => {
    for (const theme of ["dark", "light"] as const) {
      const hues = [0, 0.25, 0.5, 0.75, 1].map((p) => rgbHue(qubitColor(p, 0, theme)))
      for (let i = 1; i < hues.length; i++) {
        const d = ((hues[i] - hues[i - 1] + 540) % 360) - 180
        assert.ok(d < 0, `hue should decrease along the spectrum: ${hues}`)
      }
      assert.ok(hues[0] > 240 && hues[0] < 270, `indigo start ${hues[0]}`)
      assert.ok(hues[4] > 165 && hues[4] < 200, `ice end ${hues[4]}`)
    }
  })

  it("phase hue-shift stays out of IBM magenta", () => {
    const phases = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 0.3, 2.2]
    const p1s = [0, 0.25, 0.5, 0.75, 1]
    for (const theme of ["dark", "light"] as const) {
      for (const p1 of p1s) {
        for (const ph of phases) {
          const h = rgbHue(qubitColor(p1, ph, theme))
          assert.equal(isIbmMagenta(h), false, `p1=${p1} φ=${ph} hue=${h}`)
        }
      }
    }
  })

  it("entangled pair gradient endpoints encode each qubit", () => {
    const g = pairGradient(0, 1, 0, "dark")
    assert.equal(g.from, rgbToHex(INDIGO_DARK))
    assert.match(g.css, /linear-gradient/)
    assert.match(g.css, /oklch/)
    assert.notEqual(g.from, g.to)
  })

  it("Bell counts: bitstring is q0q1", () => {
    const counts = { "00": 400, "01": 50, "10": 60, "11": 490 }
    assert.ok(Math.abs(p1FromBellCounts(counts, 0) - 550 / 1000) < 1e-9)
    assert.ok(Math.abs(p1FromBellCounts(counts, 1) - 540 / 1000) < 1e-9)
    assert.equal(p1FromBellCounts(null, 0), 0)
  })

  it("histogram outcomes: |00> indigo, |11> ice, mixed are spectral blends", () => {
    assert.equal(outcomeColor("00", "dark").fill, rgbToHex(INDIGO_DARK))
    assert.equal(outcomeColor("11", "dark").fill, rgbToHex(ICE_DARK))
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
    assert.equal(nextGoldenStation({ hasCalibrated: false, isReady: true, hasBell: false }), "bell")
  })
})

describe("WCAG AA contrast", () => {
  it("page text meets 4.5:1 in both themes", () => {
    assert.ok(contrastRatio(SNOW, VOID) >= 4.5)
    assert.ok(contrastRatio(INK, PAPER) >= 4.5)
  })

  it("ink on indigo/ice fills meets 4.5:1", () => {
    for (const fill of [INDIGO_DARK, ICE_DARK, INDIGO_LIGHT, ICE_LIGHT]) {
      assert.ok(contrastRatio(fill, inkOn(fill)) >= 4.5, rgbToHex(fill))
    }
  })

  it("pole-as-text on page backgrounds meets 4.5:1 where used as ink", () => {
    assert.ok(contrastRatio(INDIGO_LIGHT, PAPER) >= 4.5)
    assert.ok(contrastRatio(INDIGO_DARK, VOID) >= 4.5)
    assert.ok(contrastRatio(ICE_DARK, VOID) >= 4.5)
    // Light ice is a jewel fill (luminous, not body text). Darker ice ink:
    const iceInk = { r: 0, g: 90, b: 82 }
    assert.ok(contrastRatio(iceInk, PAPER) >= 4.5)
  })
})
