import { describe, expect, it } from "vitest"
import { shouldSuppressScrollKey } from "../../src/input/scroll-keys.ts"

// Todo 47: Emscripten's GLFW port only calls preventDefault() for Backspace
// and Tab (emsdk src/lib/libglfw.js onKeydown), so every arrow key the
// player presses ALSO runs the browser's default action: it scrolls the page
// (or the focused dialogue panel), and the Korean dialogue text slid in and
// out of view while walking. The shell suppresses only that default
// scrolling -- the game still receives the keydown -- and never inside an
// editable control, where arrows must keep moving the text caret.

const body = { tagName: "BODY", isContentEditable: false }
const promptMarker = { tagName: "DIV", isContentEditable: false }

describe("shouldSuppressScrollKey", () => {
  it("suppresses the four arrow keys outside editable controls", () => {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(shouldSuppressScrollKey(key, body)).toBe(true)
      expect(shouldSuppressScrollKey(key, promptMarker)).toBe(true)
    }
  })

  it("keeps arrows working inside text inputs, textareas, selects and contenteditable", () => {
    for (const target of [
      { tagName: "INPUT", isContentEditable: false },
      { tagName: "TEXTAREA", isContentEditable: false },
      { tagName: "SELECT", isContentEditable: false },
      { tagName: "DIV", isContentEditable: true }
    ]) {
      expect(shouldSuppressScrollKey("ArrowLeft", target)).toBe(false)
      expect(shouldSuppressScrollKey("ArrowDown", target)).toBe(false)
    }
  })

  it("leaves every other key alone (space, letters, Enter, Backspace, page keys)", () => {
    for (const key of [" ", "a", "Enter", "Backspace", "Tab", "PageDown", "Home", ""]) {
      expect(shouldSuppressScrollKey(key, body)).toBe(false)
    }
  })

  it("treats a missing target as the page itself", () => {
    expect(shouldSuppressScrollKey("ArrowDown", null)).toBe(true)
  })
})
