// User request 2026-10-05: the title-screen main menu ("Return to the view" ..
// "About") must be selectable with the arrow keys + Enter. Its hotkeys are the
// English first letters (r/j/i/c/a), which the Korean overlay no longer shows.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const intro = readFileSync(new URL("../../vendor/xu4/src/intro.cpp", import.meta.url), "utf8")

function introMenuKeyCase(): string {
  const start = intro.indexOf("    case INTRO_MENU:\n        switch (key) {")
  expect(start, "INTRO_MENU key switch").toBeGreaterThan(-1)
  return intro.slice(start, intro.indexOf("        default:\n            valid = false;", start))
}

describe("intro main menu cursor", () => {
  it("moves with U4_UP / U4_DOWN and activates the hotkey under the cursor on Enter", () => {
    const body = introMenuKeyCase()
    expect(body).toMatch(/case U4_UP:/)
    expect(body).toMatch(/case U4_DOWN:/)
    expect(body).toMatch(/case U4_ENTER:/)
    expect(body).toMatch(/case U4_KEYPAD_ENTER:/)
    expect(body).toMatch(/keyPressed\(\s*introMenuKeys\[introMenuCursor\]\s*\)/)
  })

  it("tells the Korean overlay which row is selected (row 5 + cursor)", () => {
    expect(intro).toMatch(/webViewShow\("menu", menuArea, 0, introMenuCursor >= 0 \? 5 \+ introMenuCursor : -1, rows\)/)
  })

  it("shares one hotkey table with the mouse handler", () => {
    expect(intro).toMatch(/static const char introMenuKeys\[\] = "rjica";/)
    expect(intro).toMatch(/keyPressed\(\s*introMenuKeys\[cy - 5\]\s*\)/)
  })
})

// e2e finding 2026-10-05 (save-slots spec, then a probe): the intro screens are
// skipped with Enter, and scripted/habitual double Enters reached the freshly
// shown menu and activated "Journey Onward" (3 s error banner swallowing the
// next keys). No item is selected until an arrow key is pressed; Enter does
// nothing until then, so the old Enter-spam flow and the letter hotkeys work.
describe("intro main menu cursor starts unselected", () => {
  it("starts with no selected item, and the overlay then gets selected=-1", () => {
    expect(intro).toMatch(/static int introMenuCursor = -1;/)
    expect(intro).toMatch(/introMenuCursor >= 0 \? 5 \+ introMenuCursor : -1/)
  })

  it("Enter does nothing while no item is selected", () => {
    const body = introMenuKeyCase()
    expect(body).toMatch(/if \(introMenuCursor < 0\)\s*break;/)
  })

  it("the first arrow press selects an item (Down: first, Up: last)", () => {
    const body = introMenuKeyCase()
    expect(body).toMatch(/introMenuCursor = \(introMenuCursor < 0\) \? 0 : \(introMenuCursor \+ 1\) % 5;/)
    expect(body).toMatch(/introMenuCursor = \(introMenuCursor <= 0\) \? 4 : introMenuCursor - 1;/)
  })
})
