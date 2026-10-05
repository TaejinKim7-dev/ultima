import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { applyTokens, createPanelState, eraseTrailingText, tokenizeMessage, type PanelState } from "../../src/dialogue/message-tokens.ts"
import { PROMPT_ERASE_HASHES, createUiMessageHandler, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder, hashText } from "../../src/i18n/coverage.ts"

// Todo 48 (5): gameGetDirection() (vendor/xu4/src/game.cpp:1469-1485)
// prints "Dir?" then erases it with screenMessage("\b\b\b\b") before
// printing the direction name. The panel shows "대화: 방향?북쪽" today
// because the erase hash (8c19a815) is control-only and dropped. When that
// erase arrives right after the Korean direction prompt (7ab7b051 ->
// ui:game:63 "방향?"), the handler must remove the Korean prompt text from
// the current line so it reads "대화: 북쪽".

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const gameSource = readFileSync(join(projectRoot, "vendor/xu4/src/game.cpp"), "utf8")

const DEPENDENCIES: UiMessageDeps = {
  templateId: (hash) => (hash === "7ab7b051" ? "ui:game:63" : hash === "aaaa0001" ? "ui:game:15" : undefined),
  resolve: (id, fallback) => (id === "ui:game:63" ? "방향?" : id === "ui:game:15" ? "패스\n" : fallback),
  moduleNameId: () => undefined
}

function applyLine(state: PanelState, text: string): PanelState {
  return applyTokens(state, tokenizeMessage(text))
}

describe("PROMPT_ERASE_HASHES", () => {
  it("maps the backspace-only erase hash to the direction-prompt hash, without any English literal in the source", () => {
    // "Dir?" is xu4 code, not game data, but the Todo rule is to keep the
    // hash in the source instead of the literal -- assert the map's shape.
    expect(PROMPT_ERASE_HASHES).toEqual({ [hashText("\b\b\b\b")]: "7ab7b051" })
    expect(Object.values(PROMPT_ERASE_HASHES)).toEqual(["7ab7b051"])
  })

  it("pins both hashes against game.cpp's own literals", () => {
    const dirPrompt = /screenMessage\("Dir\?"\)/.test(gameSource)
    const erase = /screenMessage\("\\b\\b\\b\\b"\)/.test(gameSource)
    expect(dirPrompt).toBe(true)
    expect(erase).toBe(true)
    // The unit test keeps the FNV values honest: recompute them from the C
    // escape sequences the engine actually feeds screenMessage.
    expect(hashText("Dir?")).toBe("7ab7b051")
    expect(hashText("\b\b\b\b")).toBe("8c19a815")
  })
})

describe("eraseTrailingText", () => {
  it("removes the trailing Korean prompt from the current line", () => {
    const state = applyLine(createPanelState(), "대화: 방향?")
    const next = eraseTrailingText(state, "방향?")
    expect(applyTokens(next, tokenizeMessage("북쪽\n")).historyLines.map((line) =>
      line.cells.map((cell) => cell.char).join("")
    )).toEqual(["대화: 북쪽"])
  })

  it("leaves the line unchanged when it does not end with the text", () => {
    const state = applyLine(createPanelState(), "대화: 북쪽")
    expect(eraseTrailingText(state, "방향?")).toBe(state)
  })

  it("counts by the Korean text, never the 4 English backspace bytes", () => {
    const state = applyLine(createPanelState(), "대화: 방향?")
    const next = eraseTrailingText(state, "방향?")
    expect(next.currentLine.map((cell) => cell.char).join("")).toBe("대화: ")
  })

  it("leaves a line unchanged when the erase text is longer than the line", () => {
    const state = applyLine(createPanelState(), "방향?")
    expect(eraseTrailingText(state, "대화: 방향?")).toBe(state)
  })
})

describe("createUiMessageHandler erase callback", () => {
  it("calls erase with the previous Korean prompt text when the erase follows the prompt hash", () => {
    const erased: string[] = []
    const emitted: string[] = []
    const handle = createUiMessageHandler(DEPENDENCIES, (text) => emitted.push(text), undefined, undefined, (text) => erased.push(text))
    handle("7ab7b051", []) // "Dir?" -> "방향?"
    handle("8c19a815", []) // "\b\b\b\b" -> control-only erase
    expect(erased).toEqual(["방향?"])
    // The erase call is still composed (unmapped), so the miss is recorded.
    expect(emitted).toEqual(["방향?"])
  })

  it("does not erase when the previous call was a different prompt", () => {
    const erased: string[] = []
    const handle = createUiMessageHandler(DEPENDENCIES, () => {}, undefined, undefined, (text) => erased.push(text))
    handle("aaaa0001", []) // some other line
    handle("8c19a815", [])
    expect(erased).toEqual([])
  })

  it("still records the Todo 45 ui-unmapped miss for the erase hash", () => {
    const recorder = createCoverageRecorder()
    const handle = createUiMessageHandler(
      { ...DEPENDENCIES, onMiss: (miss) => recorder.record(miss) },
      () => {}
    )
    handle("8c19a815", [])
    expect(recorder.snapshot()["ui-unmapped"]).toEqual([{ key: hashText("\b\b\b\b"), count: 1 }])
  })

  it("never lets an exception in the erase callback escape into the engine", () => {
    const failures: unknown[] = []
    const handle = createUiMessageHandler(
      DEPENDENCIES,
      () => {},
      (error) => failures.push(error),
      undefined,
      () => {
        throw new Error("boom")
      }
    )
    handle("7ab7b051", [])
    expect(() => handle("8c19a815", [])).not.toThrow()
    expect(failures).toHaveLength(1)
  })
})