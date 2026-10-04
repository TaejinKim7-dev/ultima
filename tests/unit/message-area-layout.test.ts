// Todo 49 Phase A: the message area's fixed logical rect and the device-pixel
// font-size math for the Korean in-game overlay.
//
// The native message area is TEXT_AREA, a 16x12 grid of 8x8 character cells:
//   vendor/xu4/src/u4.h:62-65 -- TEXT_AREA_X=24, TEXT_AREA_Y=12,
//   TEXT_AREA_W=16, TEXT_AREA_H=12  ->  (24*8, 12*8, 16*8, 12*8) =
//   (192, 96, 128, 96) in the 320x200 world raster.
//
// The plan's sizing rule (docs/plans/2026-10-04-in-game-korean.md Stage 2):
//   k = floor(boxHeight / (12*16)), font = 16k device px, 12 lines,
//   line spacing = floor(height / lineCount).
// Hangul is 16x16 native px, so at exactly 2x display one Hangul fills one
// original 8x8 cell: 16 columns x 12 lines. The documented capacity examples
// pin the math: 2x -> 16 chars, a 1280x720-class box -> 20 chars, a
// 1366-class box -> 22 chars.
import { describe, expect, it } from "vitest"
import {
  computeMessageAreaMetrics,
  MESSAGE_AREA_FONT_UNIT,
  MESSAGE_AREA_LINES,
  MESSAGE_AREA_RECT
} from "../../src/overlay/message-area-layout.ts"
import { toCssRect } from "../../src/overlay/overlay-layout.ts"

describe("message-area rect (TEXT_AREA)", () => {
  it("matches the native TEXT_AREA_* macros: (24*8, 12*8, 16*8, 12*8)", () => {
    expect(MESSAGE_AREA_RECT).toEqual({ x: 192, y: 96, width: 128, height: 96 })
  })

  it("lands exactly over the 2x message area box (128x96 logical * 2)", () => {
    const css = toCssRect(MESSAGE_AREA_RECT, { left: 0, top: 0, width: 640, height: 400 }, 1)
    expect(css).toEqual({ left: 384, top: 192, width: 256, height: 192 })
  })
})

describe("computeMessageAreaMetrics (device-pixel multiples of 16)", () => {
  it("at 2x: 16 columns x 12 lines, 16px font, 16px line height (one Hangul per native cell)", () => {
    expect(computeMessageAreaMetrics({ width: 256, height: 192 }, 1)).toEqual({
      fontCssPx: 16,
      lineHeightCssPx: 16,
      columns: 16,
      lines: 12
    })
  })

  it("at a 1280x720-class box: 20 columns", () => {
    const m = computeMessageAreaMetrics({ width: 328, height: 246 }, 1)
    expect(m.columns).toBe(20)
    expect(m.fontCssPx).toBe(16)
    expect(m.lines).toBe(12)
  })

  it("at a 1366-class box: 22 columns", () => {
    const m = computeMessageAreaMetrics({ width: 362, height: 272 }, 1)
    expect(m.columns).toBe(22)
  })

  it("k = floor(height / (12*16)): a 4x box doubles the font to 32px and keeps 16 columns", () => {
    expect(computeMessageAreaMetrics({ width: 512, height: 384 }, 1)).toEqual({
      fontCssPx: 32,
      lineHeightCssPx: 32,
      columns: 16,
      lines: 12
    })
  })

  it("line height is floor(height / 12), not the font size", () => {
    // 250px tall box: k=1 so the font stays 16px; the 12 rows split the
    // leftover height, floor(250/12)=20.
    const m = computeMessageAreaMetrics({ width: 300, height: 250 }, 1)
    expect(m.fontCssPx).toBe(16)
    expect(m.lineHeightCssPx).toBe(20)
    expect(m.columns).toBe(18)
  })

  it("sizes in device pixels and converts back to CSS: dpr=2 on a 2x box keeps a crisp 32-device-px font", () => {
    const m = computeMessageAreaMetrics({ width: 256, height: 192 }, 2)
    expect(m.fontCssPx).toBe(16) // 32 device px / dpr 2
    expect(m.lineHeightCssPx).toBe(16)
    expect(m.columns).toBe(16) // 512 device px / 32
  })

  it("never collapses below one 16-device-px font step", () => {
    const m = computeMessageAreaMetrics({ width: 64, height: 48 }, 1)
    expect(m.fontCssPx).toBe(16)
    expect(m.columns).toBe(4)
  })

  it("exposes the 12-line and 16-unit constants", () => {
    expect(MESSAGE_AREA_LINES).toBe(12)
    expect(MESSAGE_AREA_FONT_UNIT).toBe(16)
  })
})