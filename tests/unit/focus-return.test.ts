import { describe, expect, it } from "vitest"
import { FOCUS_RETURN_DELAY_MS, createFocusReturn } from "../../src/i18n/focus-return.ts"

// Todo 35: after the player uses #korean-keyword-input, the capture-phase
// keydown guard in src/shell.ts swallows every key while that input has DOM
// focus, so arrow/command keys never reach the game. The rule under test:
// when the native text prompt closes and no prompt reopens within the delay,
// leave the input. A talk conversation opens a fresh prompt per keyword, so a
// close that is followed by a reopen must NOT take focus away.

function harness(initialFocusInInput = true) {
  let focusInInput = initialFocusInInput
  let blurs = 0
  let now = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  let nextId = 1
  const focus = createFocusReturn({
    isFocusInInput: () => focusInInput,
    leaveInput: () => {
      blurs += 1
      focusInInput = false
    },
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimer: (id) => {
      timers.delete(id as number)
    }
  })
  return {
    focus,
    blurs: () => blurs,
    setFocusInInput: (value: boolean) => {
      focusInInput = value
    },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.fn()
        }
      }
    },
    pending: () => timers.size
  }
}

describe("createFocusReturn", () => {
  it("leaves the input when the prompt closes and nothing reopens within the delay", () => {
    const h = harness()
    h.focus.promptClosed()
    h.advance(FOCUS_RETURN_DELAY_MS - 1)
    expect(h.blurs()).toBe(0)
    h.advance(1)
    expect(h.blurs()).toBe(1)
  })

  it("keeps focus when a new prompt opens before the delay elapses (next keyword in the same talk)", () => {
    const h = harness()
    h.focus.promptClosed()
    h.advance(FOCUS_RETURN_DELAY_MS - 1)
    h.focus.promptOpened()
    h.advance(FOCUS_RETURN_DELAY_MS * 2)
    expect(h.blurs()).toBe(0)
    expect(h.pending()).toBe(0)
  })

  it("does nothing when the input does not have focus when the delay elapses", () => {
    const h = harness(false)
    h.focus.promptClosed()
    h.advance(FOCUS_RETURN_DELAY_MS)
    expect(h.blurs()).toBe(0)
  })

  it("restarts the delay on a second close instead of stacking timers", () => {
    const h = harness()
    h.focus.promptClosed()
    h.advance(FOCUS_RETURN_DELAY_MS - 10)
    h.focus.promptClosed()
    expect(h.pending()).toBe(1)
    h.advance(10)
    expect(h.blurs()).toBe(0)
    h.advance(FOCUS_RETURN_DELAY_MS)
    expect(h.blurs()).toBe(1)
  })

  it("Escape leaves the input immediately, only while it has focus", () => {
    const h = harness()
    expect(h.focus.escapePressed()).toBe(true)
    expect(h.blurs()).toBe(1)
    expect(h.focus.escapePressed()).toBe(false)
    expect(h.blurs()).toBe(1)
  })
})
