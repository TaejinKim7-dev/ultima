// Todo 47: keeps arrow keys from scrolling the page while the game has them.
//
// Emscripten's GLFW port calls preventDefault() only for Backspace and Tab
// (emsdk src/lib/libglfw.js onKeydown), so every arrow key the player presses
// also runs the browser's default action: it scrolls the page, or the
// dialogue panel when focus is inside it, and the Korean dialogue text slid
// in and out of view while walking. The shell suppresses only that default
// action -- the keydown still propagates to the game -- and never inside an
// editable control, where arrows must keep moving the text caret.
// Pure (no DOM) so the rule is unit-testable.

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

/** The parts of a keydown target this rule reads. */
export interface KeyTarget {
  readonly tagName?: string
  readonly isContentEditable?: boolean
}

/** True when `key`'s default (scrolling) action should be prevented for a keydown on `target`. */
export function shouldSuppressScrollKey(key: string, target: KeyTarget | null): boolean {
  if (!SCROLL_KEYS.has(key)) {
    return false
  }
  if (target === null) {
    return true
  }
  if (target.isContentEditable === true) {
    return false
  }
  return !EDITABLE_TAGS.has((target.tagName ?? "").toUpperCase())
}
