import { describe, expect, it } from "vitest"
import {
  NO_TEXT_PROMPT_MESSAGE,
  STALE_TEXT_PROMPT_MESSAGE,
  createTextPromptGate
} from "../../src/i18n/text-prompt-gate.ts"

// Todo 18: stale-request boundary for src/shell.ts's #korean-keyword-input.
// The real engine reports every native ReadStringController (the one class
// behind readInt/readString/readStringView -- vendor/xu4/src/event.cpp) as
// opened(id)/closed(id). Text captured while prompt A was open must never be
// synthesized into the game once A has closed, whether nothing or a
// different prompt B is open by the time the player presses Enter.

describe("createTextPromptGate", () => {
  it("accepts a submission typed while the same native prompt is still open", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.noteInput()
    expect(gate.consumeSubmit()).toEqual({ ok: true })
  })

  it("rejects text captured during prompt A once A has closed and nothing is open", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.noteInput()
    gate.closed(1)
    expect(gate.consumeSubmit()).toEqual({ ok: false, message: STALE_TEXT_PROMPT_MESSAGE })
  })

  it("rejects text captured during prompt A when a different prompt B is open at submit time", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.noteInput()
    gate.closed(1)
    gate.opened(2)
    expect(gate.consumeSubmit()).toEqual({ ok: false, message: STALE_TEXT_PROMPT_MESSAGE })
  })

  it("accepts text typed just before a prompt opened (nothing to be stale against)", () => {
    const gate = createTextPromptGate()
    gate.noteInput()
    gate.opened(1)
    expect(gate.consumeSubmit()).toEqual({ ok: true })
  })

  it("rejects a submission when no native text prompt is open at all", () => {
    const gate = createTextPromptGate()
    gate.noteInput()
    expect(gate.consumeSubmit()).toEqual({ ok: false, message: NO_TEXT_PROMPT_MESSAGE })
  })

  it("forgets the captured prompt after each submission so the next prompt starts fresh", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.noteInput()
    gate.closed(1)
    expect(gate.consumeSubmit().ok).toBe(false)
    gate.opened(2)
    expect(gate.consumeSubmit()).toEqual({ ok: true })
  })

  it("re-editing the text while a newer prompt is open re-binds it to that prompt", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.noteInput()
    gate.closed(1)
    gate.opened(2)
    gate.noteInput()
    expect(gate.consumeSubmit()).toEqual({ ok: true })
  })

  it("tracks nested prompts: closing the inner one leaves the outer one current", () => {
    const gate = createTextPromptGate()
    gate.opened(1)
    gate.opened(2)
    gate.closed(2)
    expect(gate.currentPromptId()).toBe(1)
    gate.noteInput()
    expect(gate.consumeSubmit()).toEqual({ ok: true })
  })

  it("ignores a close for an id that is not open (ordering quirks cannot wedge the gate)", () => {
    const gate = createTextPromptGate()
    gate.opened(3)
    gate.closed(99)
    expect(gate.currentPromptId()).toBe(3)
    gate.closed(3)
    expect(gate.currentPromptId()).toBeNull()
  })

  it("keeps the stale message in the wording the failure-boundaries e2e asserts", () => {
    expect(STALE_TEXT_PROMPT_MESSAGE).toContain("입력 요청이 끝났습니다")
  })
})
