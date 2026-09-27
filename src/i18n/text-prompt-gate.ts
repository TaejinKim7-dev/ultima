// Todo 18: stale-request boundary for src/shell.ts's #korean-keyword-input.
//
// The real engine reports every native ReadStringController -- the one class
// behind EventHandler::readInt/readString/readStringView in
// vendor/xu4/src/event.cpp, so both the intro avatar-name prompt and NPC talk
// -- as opened(id) when constructed and closed(id) when destroyed (EM_JS
// hooks reaching `Module.u4TextPrompt`, attached by src/engine/startup.ts).
//
// Rule: a submission is only synthesized into the game while a native text
// prompt is open, and never when the text was last edited while a
// *different* prompt (now closed) was open. Text typed while no prompt was
// open is not stale against anything, so it is accepted once one opens.
// This module is pure (no DOM, no engine) so the rule is unit-testable.

export const STALE_TEXT_PROMPT_MESSAGE = "입력 요청이 끝났습니다. 새 입력 요청이 열리면 다시 입력해 주세요."
export const NO_TEXT_PROMPT_MESSAGE = "지금은 열린 입력 요청이 없습니다."

export type TextPromptSubmitDecision = { ok: true } | { ok: false; message: string }

export interface TextPromptGate {
  opened(id: number): void
  closed(id: number): void
  currentPromptId(): number | null
  /** Call on every edit of the Korean field: binds its text to the prompt open right now (or none). */
  noteInput(): void
  /** Decides one submission and forgets the captured prompt, so the next entry starts fresh. */
  consumeSubmit(): TextPromptSubmitDecision
}

export function createTextPromptGate(): TextPromptGate {
  // A stack, not a single slot: a nested ReadStringController (if any code
  // path ever opens one inside another) closes back to the outer prompt.
  const openIds: number[] = []
  let capturedId: number | null = null

  function currentPromptId(): number | null {
    return openIds.length > 0 ? openIds[openIds.length - 1]! : null
  }

  return {
    opened(id) {
      openIds.push(id)
    },
    closed(id) {
      const index = openIds.lastIndexOf(id)
      if (index !== -1) {
        openIds.splice(index, 1)
      }
    },
    currentPromptId,
    noteInput() {
      capturedId = currentPromptId()
    },
    consumeSubmit() {
      const captured = capturedId
      capturedId = null
      const current = currentPromptId()
      if (captured !== null && captured !== current) {
        return { ok: false, message: STALE_TEXT_PROMPT_MESSAGE }
      }
      if (current === null) {
        return { ok: false, message: NO_TEXT_PROMPT_MESSAGE }
      }
      return { ok: true }
    }
  }
}
