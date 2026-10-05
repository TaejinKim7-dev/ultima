// Todo 50 follow-up (user report 2026-10-05): the in-game message-area overlay
// drew Korean about twice too large -- roughly 6 of its 12 rows fit and long
// lines were cut. The sizing rule (message-area-layout.ts) must be applied to
// the message-area BOX (TEXT_AREA, 128x96 of the 320x200 raster), never to the
// whole canvas content rect.
import { describe, expect, it } from "vitest"
import { messageAreaMetricsForContent } from "../../src/overlay/message-area-dom.ts"
import { MESSAGE_AREA_LINES, MESSAGE_AREA_RECT } from "../../src/overlay/message-area-layout.ts"
import { toCssRect } from "../../src/overlay/overlay-layout.ts"

describe("message-area overlay metrics use the message-area box", () => {
  it("at an exact 2x canvas (640x400), one Hangul fills one native cell: 16px font, 16px rows, 16 columns", () => {
    const metrics = messageAreaMetricsForContent({ left: 0, top: 0, width: 640, height: 400 }, 1)
    expect(metrics).toEqual({ fontCssPx: 16, lineHeightCssPx: 16, columns: 16, lines: MESSAGE_AREA_LINES })
  })

  it("all 12 rows fit inside the box at a large canvas, at dpr 1, 1.5 and 2", () => {
    for (const dpr of [1, 1.5, 2]) {
      const content = { left: 10, top: 20, width: 1440, height: 900 }
      const box = toCssRect(MESSAGE_AREA_RECT, content, dpr)
      const metrics = messageAreaMetricsForContent(content, dpr)
      expect(metrics.lineHeightCssPx * MESSAGE_AREA_LINES, `dpr ${dpr}`).toBeLessThanOrEqual(box.height + 1e-9)
      expect(metrics.fontCssPx, `dpr ${dpr}`).toBeLessThanOrEqual(metrics.lineHeightCssPx)
      expect(metrics.columns * metrics.fontCssPx, `dpr ${dpr}`).toBeLessThanOrEqual(box.width + 1e-9)
    }
  })
})
