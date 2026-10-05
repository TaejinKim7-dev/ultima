// Stage 3 Lane B Step 8: the control-only format table (src/dialogue/
// control-formats.ts) wired into the screenMessage() handler.
//
// The engine sends every screenMessage() as a format hash plus its printf
// arguments (src/dialogue/ui-message-compose.ts). Five formats carry NO
// translatable text -- pure line breaks, the idle prompt glyph, or a one-key
// player echo -- and must NOT reach the dialogue panel as text. The handler's
// new `onControl` callback receives them as ControlFormat descriptors
// instead (see src/dialogue/control-formats.ts for the guards that keep a
// mis-argued format from being mistaken for control):
//   0f0c6cdd  "\n"        newline
//   878f5675  "\n\n"      newline
//   8897ac8d  "    \n"    newline (direction-cancel line)
//   36b9b7f9  "%c"        prompt-glyph (0x10 CHARSET_PROMPT only)
//   195c9389  "%c\n"      echo (one ASCII letter/digit only)
// These are disjoint from Todo 48's PROMPT_ERASE_HASHES (8c19a815 ->
// 7ab7b051), so the erase check can run first without interference.
import { describe, expect, it } from "vitest"
import { CHARSET_PROMPT, type ControlFormat } from "../../src/dialogue/control-formats.ts"
import { createUiMessageHandler, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder } from "../../src/i18n/coverage.ts"

const DEPENDENCIES: UiMessageDeps = {
  templateId: (hash) => (hash === "7ab7b051" ? "ui:game:63" : undefined),
  resolve: (id, fallback) => (id === "ui:game:63" ? "방향?" : fallback),
  moduleNameId: () => undefined
}

describe("createUiMessageHandler onControl (Stage 3 Step 8)", () => {
  it("routes the '\\n' control-only format to onControl as a newline, and never to the panel text emit", () => {
    const emitted: string[] = []
    const controls: ControlFormat[] = []
    const handle = createUiMessageHandler(DEPENDENCIES, (text) => emitted.push(text), undefined, (event) => controls.push(event))
    handle("0f0c6cdd", []) // screenMessage("\n")
    handle("878f5675", []) // screenMessage("\n\n")
    handle("8897ac8d", []) // screenMessage("    \n")
    expect(controls).toEqual([{ kind: "newline" }, { kind: "newline" }, { kind: "newline" }])
    expect(emitted, "a control-only format must never be emitted as panel text").toEqual([])
  })

  it("routes '%c' to onControl as a prompt-glyph only when the argument is the 0x10 CHARSET_PROMPT byte", () => {
    const controls: ControlFormat[] = []
    const handle = createUiMessageHandler(DEPENDENCIES, () => {}, undefined, (event) => controls.push(event))
    handle("36b9b7f9", [String.fromCharCode(CHARSET_PROMPT)]) // screenPrompt()'s idle glyph
    expect(controls).toEqual([{ kind: "prompt-glyph" }])
  })

  it("routes '%c\\n' to onControl as the one-key echo, carrying the echoed char", () => {
    const controls: ControlFormat[] = []
    const handle = createUiMessageHandler(DEPENDENCIES, () => {}, undefined, (event) => controls.push(event))
    handle("195c9389", ["j"]) // AlphaActionController menu-letter echo
    expect(controls).toEqual([{ kind: "echo", text: "j" }])
  })

  it("an unknown hash skips onControl entirely and still records the ordinary ui-unmapped miss", () => {
    const controls: ControlFormat[] = []
    const recorder = createCoverageRecorder()
    const handle = createUiMessageHandler(
      { ...DEPENDENCIES, onMiss: (miss) => recorder.record(miss) },
      () => {},
      undefined,
      (event) => controls.push(event)
    )
    handle("ffffffff", [])
    expect(controls).toEqual([])
    expect(recorder.snapshot()["ui-unmapped"]).toEqual([{ key: "ffffffff", count: 1 }])
  })
})