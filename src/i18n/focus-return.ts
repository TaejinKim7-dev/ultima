// Todo 35: gives keyboard control back to the game after Korean input.
//
// src/shell.ts's capture-phase keydown guard swallows every key while
// #korean-keyword-input has DOM focus (GLFW listens on `window` regardless of
// focus, so the guard is what keeps typed Korean out of the game). The cost:
// once a conversation ends, focus is still in the input and arrow/command
// keys never reach the game.
//
// Rule: when the native text prompt closes and no prompt reopens within
// FOCUS_RETURN_DELAY_MS, leave the input. A talk conversation opens a fresh
// prompt per keyword, so a close followed quickly by an open is the same
// conversation and must keep focus. Escape leaves the input immediately.
// Pure (no DOM, no engine, injected timers) so the rule is unit-testable.

/** Longer than the engine's close->reopen gap between keywords in one talk. */
export const FOCUS_RETURN_DELAY_MS = 400

export interface FocusReturnDeps {
  isFocusInInput(): boolean
  /** Moves DOM focus out of the Korean input (e.g. `input.blur()`). */
  leaveInput(): void
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(id: unknown): void
}

export interface FocusReturn {
  promptClosed(): void
  promptOpened(): void
  /** Returns true when it took focus out of the input. */
  escapePressed(): boolean
}

export function createFocusReturn(deps: FocusReturnDeps): FocusReturn {
  let timer: unknown = null

  function cancel(): void {
    if (timer !== null) {
      deps.clearTimer(timer)
      timer = null
    }
  }

  return {
    promptClosed() {
      cancel()
      timer = deps.setTimer(() => {
        timer = null
        if (deps.isFocusInInput()) {
          deps.leaveInput()
        }
      }, FOCUS_RETURN_DELAY_MS)
    },
    promptOpened() {
      cancel()
    },
    escapePressed() {
      if (!deps.isFocusInInput()) {
        return false
      }
      cancel()
      deps.leaveInput()
      return true
    }
  }
}
