// User request 2026-10-05: the selected title-menu item gets a visible marker.
// The "▶" takes the indent cell right before the text, so the label does not shift.
import { describe, expect, it } from "vitest"
import { markSelectedLabel, SELECTION_MARK } from "../../src/overlay/intro-view.ts"

const EM = " "

describe("markSelectedLabel", () => {
  it("replaces the indent cell right before the text with the mark", () => {
    expect(markSelectedLabel(`${EM.repeat(10)}여정을 계속하다`)).toBe(`${EM.repeat(9)}${SELECTION_MARK}여정을 계속하다`)
  })

  it("prefixes the mark when there is no indent", () => {
    expect(markSelectedLabel("설정")).toBe(`${SELECTION_MARK}설정`)
  })

  it("uses the pixel font's play glyph", () => {
    expect(SELECTION_MARK).toBe("▶")
  })
})
