import { describe, expect, it } from "vitest"
import { computeOverlayCellPx, computeOverlayFontPx } from "../../src/overlay/overlay-layout.ts"

describe("pixel font sizing", () => {
  it.each([
    { scaleY: 2, dpr: 1, expected: 16 },
    { scaleY: 2.9, dpr: 1, expected: 16 },
    { scaleY: 4, dpr: 1, expected: 32 },
    { scaleY: 2, dpr: 1.25, expected: 12.8 },
    { scaleY: 2, dpr: 1.5, expected: 16 / 1.5 },
    { scaleY: 2, dpr: 2, expected: 16 },
    { scaleY: 3, dpr: 2, expected: 24 }
  ])("fits the largest 16-device-pixel step at scale $scaleY and DPR $dpr", ({ scaleY, dpr, expected }) => {
    // Given a native eight-pixel row at the displayed scale and DPR.
    const rowHeight = computeOverlayCellPx(scaleY)
    // When choosing the overlay's font size in CSS pixels.
    const fontPx = computeOverlayFontPx(scaleY, dpr)
    // Then it is the largest crisp step that fits that row.
    expect(fontPx).toBeCloseTo(expected, 10)
    expect((fontPx * dpr) % 16).toBeCloseTo(0, 10)
    expect(fontPx).toBeLessThanOrEqual(rowHeight)
    expect(fontPx + 16 / dpr).toBeGreaterThan(rowHeight)
  })

  it("keeps text inside an undersized row when even one pixel-font step cannot fit", () => {
    // Given a scale below the viewport's normal minimum.
    const scaleY = 0.5
    // When computing the font size.
    const fontPx = computeOverlayFontPx(scaleY, 2)
    // Then no overflow is introduced to force a full font step.
    expect(fontPx).toBe(4)
  })
})
