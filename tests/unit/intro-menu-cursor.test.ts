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
    expect(intro).toMatch(/webViewShow\("menu", menuArea, 0, 5 \+ introMenuCursor, rows\)/)
  })

  it("shares one hotkey table with the mouse handler", () => {
    expect(intro).toMatch(/static const char introMenuKeys\[\] = "rjica";/)
    expect(intro).toMatch(/keyPressed\(\s*introMenuKeys\[cy - 5\]\s*\)/)
  })
})

// e2e finding 2026-10-05 (save-slots spec): the intro screens are skipped with
// Enter, so a second Enter arriving as the menu appears activated "Journey
// Onward" by accident (error banner = 3 s of dead input, the real 'i' was lost).
// Enter must only activate the cursor item once the menu has been on screen a moment.
describe("intro main menu Enter guard", () => {
  it("records when the menu appeared and ignores Enter right after", () => {
    expect(intro).toMatch(/extern uint32_t getTicks\(\);/)
    expect(intro).toMatch(/introMenuShownAt\s*=\s*getTicks\(\)/)
    const body = introMenuKeyCase()
    expect(body).toMatch(/getTicks\(\)\s*-\s*introMenuShownAt\s*<\s*INTRO_MENU_ENTER_GUARD_MS/)
  })
})
