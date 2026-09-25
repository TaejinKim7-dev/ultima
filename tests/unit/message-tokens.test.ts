import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import {
  applyToken,
  applyTokens,
  beginPause,
  createPanelState,
  lineText,
  resumePanel,
  toRuns,
  tokenizeMessage,
  type MessageToken,
  type PanelState
} from "../../src/dialogue/message-tokens.ts"

// Byte values match vendor/xu4/src/screen.cpp's screenMessageN() switch and
// vendor/xu4/src/textview.h's TextColor enum exactly -- see this module's
// own doc comments for the source citations. Spelled out here (rather than
// imported) so a typo in the implementation's own constants can't hide a
// mismatch from the native source.
const BACKSPACE = "\b" // 0x08
const NEWLINE = "\n" // 0x0A
const CARRIAGE_RETURN = "\r" // 0x0D
const CURSOR_RIGHT = "\x12" // 0x12 (DC2)
const CHARSET_PROMPT = "\x10" // 0x10

describe("tokenizeMessage (Todo 11: message -> control tokens)", () => {
  it("returns no tokens for an empty string", () => {
    expect(tokenizeMessage("")).toEqual([])
  })

  it("coalesces a run of plain characters into a single text token", () => {
    expect(tokenizeMessage("hello")).toEqual([{ type: "text", value: "hello" }])
  })

  it("tokenizes a newline between two text runs", () => {
    expect(tokenizeMessage(`a${NEWLINE}b`)).toEqual([
      { type: "text", value: "a" },
      { type: "newline" },
      { type: "text", value: "b" }
    ])
  })

  it("tokenizes backspace (0x08) without altering surrounding text runs", () => {
    expect(tokenizeMessage(`a${BACKSPACE}b`)).toEqual([
      { type: "text", value: "a" },
      { type: "backspace" },
      { type: "text", value: "b" }
    ])
  })

  it("tokenizes carriage return (0x0D) distinctly from newline", () => {
    expect(tokenizeMessage(`a${CARRIAGE_RETURN}b`)).toEqual([
      { type: "text", value: "a" },
      { type: "carriage-return" },
      { type: "text", value: "b" }
    ])
  })

  it("tokenizes cursor-right (0x12 / DC2)", () => {
    expect(tokenizeMessage(`a${CURSOR_RIGHT}b`)).toEqual([
      { type: "text", value: "a" },
      { type: "right" },
      { type: "text", value: "b" }
    ])
  })

  it("tokenizes the prompt glyph (0x10 CHARSET_PROMPT, screenPrompt()'s idle cursor)", () => {
    expect(tokenizeMessage(`a${CHARSET_PROMPT}`)).toEqual([
      { type: "text", value: "a" },
      { type: "prompt" }
    ])
  })

  it("tokenizes each of the seven FG_* color bytes (0x13-0x19)", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["\x13", "grey"],
      ["\x14", "blue"],
      ["\x15", "purple"],
      ["\x16", "green"],
      ["\x17", "red"],
      ["\x18", "yellow"],
      ["\x19", "white"]
    ]
    for (const [byte, code] of cases) {
      expect(tokenizeMessage(`x${byte}y`)).toEqual([
        { type: "text", value: "x" },
        { type: "color", code },
        { type: "text", value: "y" }
      ])
    }
  })

  it("tokenizes a realistic multi-control fragment (dungeon.cpp-style prompt text)", () => {
    // Structurally modeled on vendor/xu4/src/dungeon.cpp:163's
    // `screenMessage("You find a Fountain.\nWho drinks? ")` -- text
    // authored for this test, not extracted from original game data.
    const tokens = tokenizeMessage("You find a Fountain.\nWho drinks? ")
    expect(tokens).toEqual([
      { type: "text", value: "You find a Fountain." },
      { type: "newline" },
      { type: "text", value: "Who drinks? " }
    ])
  })

  it("never interprets an injected script-like string as markup -- it is one literal text token", () => {
    const hostile = "<script>window.__xss=1</script><img src=x onerror=\"window.__xss=1\">"
    expect(tokenizeMessage(hostile)).toEqual([{ type: "text", value: hostile }])
  })
})

function applyAll(tokens: readonly MessageToken[]): PanelState {
  return applyTokens(createPanelState(), tokens)
}

describe("createPanelState / applyToken (Todo 11: panel reducer)", () => {
  it("starts empty: no history, no current line, default color, no prompt/pause", () => {
    const state = createPanelState()
    expect(state.historyLines).toEqual([])
    expect(state.currentLine).toEqual([])
    expect(state.cursor).toBe(0)
    expect(state.activeColor).toBe("default")
    expect(state.awaitingPrompt).toBe(false)
    expect(state.paused).toBe(false)
  })

  it("writes text into the current line and advances the cursor", () => {
    const state = applyAll(tokenizeMessage("AB"))
    expect(lineText({ cells: state.currentLine })).toBe("AB")
    expect(state.cursor).toBe(2)
    expect(state.historyLines).toEqual([])
  })

  it("newline commits the current line to history and starts a fresh one", () => {
    const state = applyAll(tokenizeMessage("hi\n"))
    expect(state.historyLines).toHaveLength(1)
    expect(lineText(state.historyLines[0]!)).toBe("hi")
    expect(state.currentLine).toEqual([])
    expect(state.cursor).toBe(0)
  })

  it("backspace moves the cursor back without deleting the cell (native screenMessageN does not erase)", () => {
    let state = applyAll(tokenizeMessage("AB"))
    state = applyToken(state, { type: "backspace" })
    expect(state.cursor).toBe(1)
    // The 'B' cell is still physically present -- backspace only moved
    // the cursor, matching `case '\b': c->col--; continue;` in screen.cpp.
    expect(lineText({ cells: state.currentLine })).toBe("AB")
  })

  it("a character written after backspace overwrites in place, matching the native fixed-cursor buffer", () => {
    let state = applyAll(tokenizeMessage("AB"))
    state = applyToken(state, { type: "backspace" })
    state = applyAll2(state, tokenizeMessage("C"))
    expect(lineText({ cells: state.currentLine })).toBe("AC")
    expect(state.cursor).toBe(2)
  })

  it("right (0x12) skips over an existing cell without altering it", () => {
    let state = applyAll(tokenizeMessage("AB"))
    state = applyToken(state, { type: "backspace" })
    state = applyToken(state, { type: "backspace" })
    expect(state.cursor).toBe(0)
    state = applyToken(state, { type: "right" })
    expect(state.cursor).toBe(1)
    expect(lineText({ cells: state.currentLine })).toBe("AB")
  })

  it("right past the end of the line pads with a blank cell", () => {
    const state = applyToken(createPanelState(), { type: "right" })
    expect(state.cursor).toBe(1)
    expect(lineText({ cells: state.currentLine })).toBe(" ")
  })

  it("color changes the active color for subsequent text and persists across a newline", () => {
    let state = applyAll(tokenizeMessage("\x17x\ny"))
    const history = state.historyLines[0]!
    expect(toRuns(history)).toEqual([{ text: "x", color: "red" }])
    expect(toRuns({ cells: state.currentLine })).toEqual([{ text: "y", color: "red" }])
  })

  it("fragments across two separate dispatches join onto the same line (dungeon.cpp's 'Who drinks? ' + echoed letter)", () => {
    // Models two *separate* screenMessage() calls landing as two separate
    // bridge `message` events, exactly as dungeon.cpp:163's
    // `screenMessage("...\nWho drinks? ")` is later followed by
    // event.cpp:787's `screenMessage("%c\n", key)` once the player answers.
    let state = applyAll(tokenizeMessage("You find a Fountain.\nWho drinks? "))
    state = applyTokens(state, tokenizeMessage("A\n"))
    expect(state.historyLines).toHaveLength(2)
    expect(lineText(state.historyLines[0]!)).toBe("You find a Fountain.")
    expect(lineText(state.historyLines[1]!)).toBe("Who drinks? A")
  })

  it("prompt writes a visible cursor glyph and sets awaitingPrompt, which a later text token clears", () => {
    let state = applyToken(createPanelState(), { type: "prompt" })
    expect(state.awaitingPrompt).toBe(true)
    expect(state.cursor).toBe(1)
    state = applyAll2(state, tokenizeMessage("x"))
    expect(state.awaitingPrompt).toBe(false)
  })

  it("beginPause/resumePanel toggle the Hawkwind-style pause flag independently of tokens", () => {
    let state = createPanelState()
    expect(state.paused).toBe(false)
    state = beginPause(state)
    expect(state.paused).toBe(true)
    state = applyAll2(state, tokenizeMessage("still paused"))
    expect(state.paused).toBe(true) // tokens alone never clear a pause
    state = resumePanel(state)
    expect(state.paused).toBe(false)
  })
})

function applyAll2(state: PanelState, tokens: readonly MessageToken[]): PanelState {
  return applyTokens(state, tokens)
}

describe("Todo 11 safety guard: dialogue rendering must never use innerHTML", () => {
  it("shell.ts and message-tokens.ts source never mention innerHTML/outerHTML/insertAdjacentHTML/document.write", () => {
    const shellSrc = readFileSync(fileURLToPath(new URL("../../src/shell.ts", import.meta.url)), "utf8")
    const tokensSrc = readFileSync(
      fileURLToPath(new URL("../../src/dialogue/message-tokens.ts", import.meta.url)),
      "utf8"
    )
    // Matches actual usage (an assignment or a call), not the word
    // appearing inside an explanatory code comment such as "textContent
    // only -- never innerHTML for game text".
    const banned = /\.innerHTML\s*=|\.outerHTML\s*=|\.insertAdjacentHTML\s*\(|document\.write\s*\(/
    expect(banned.test(shellSrc)).toBe(false)
    expect(banned.test(tokensSrc)).toBe(false)
  })
})
