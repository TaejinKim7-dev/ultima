// Todo 49 Phase A: the message-area overlay's pure view model.
//
// The overlay shares the dialogue panel's PanelState (src/dialogue/
// message-tokens.ts) but shows only the lines committed since play began,
// re-wraps them to the message area's fixed column budget (Hangul = 2 units,
// ASCII = 1 unit, matching Neo둥근모's 16x16 Hangul vs 8x16 Latin), and
// bottom-aligns the last 12 rows. The engine's web-only screen signals
// (Module.u4Screen) feed the typed input echo, the choice-key echo and the
// blinking cursor; long (paged) answers pause with a "▼" cue.
//
// Pure: no DOM, no engine. `src/shell.ts`/Phase B turns the resulting rows
// into DOM nodes.
import { describe, expect, it } from "vitest"
import {
  applyChoice,
  applyInput,
  applyPlay,
  applyPromptGlyph,
  cellUnits,
  clearEcho,
  clearPlay,
  computeView,
  countWrappedRows,
  createMessageAreaState,
  nextPage,
  setCursor,
  syncFromPanel,
  wrapRow
} from "../../src/overlay/message-area-view.ts"
import { MESSAGE_AREA_LINES } from "../../src/overlay/message-area-layout.ts"
import {
  applyTokens,
  beginPause,
  createPanelState,
  tokenizeMessage,
  type PanelCell,
  type PanelState
} from "../../src/dialogue/message-tokens.ts"

const PROMPT_GLYPH = "\x10" // CHARSET_PROMPT -- the idle prompt cursor byte

/** A PanelState whose history holds one committed line per string. */
function panelWithLines(history: readonly string[], current = ""): PanelState {
  let state = createPanelState()
  for (const line of history) {
    state = applyTokens(state, tokenizeMessage(line + "\n"))
  }
  if (current !== "") {
    state = applyTokens(state, tokenizeMessage(current))
  }
  return state
}

function cell(ch: string, kind: PanelCell["kind"] = "text"): PanelCell {
  return { char: ch, color: "default", kind }
}

function rowText(line: { cells: readonly PanelCell[] }): string {
  return line.cells.map((c) => c.char).join("")
}

describe("createMessageAreaState", () => {
  it("starts empty: no lines, no input, no cursor", () => {
    const s = createMessageAreaState()
    expect(s.lines).toEqual([])
    expect(s.consumed).toBe(0)
    expect(s.currentLine).toEqual([])
    expect(s.inputText).toBe("")
    expect(s.choiceEcho).toBeNull()
    expect(s.cursorVisible).toBe(false)
  })
})

describe("syncFromPanel (lines since play began)", () => {
  it("appends only the panel lines committed after play start", () => {
    const panel = panelWithLines(["첫 줄", "둘째 줄"])
    let s = createMessageAreaState()
    s = applyPlay(s, true, panel)
    s = syncFromPanel(s, panel)
    expect(s.lines).toHaveLength(0) // pre-play baseline skipped
    s = syncFromPanel(s, panelWithLines(["첫 줄", "둘째 줄", "셋째 줄"]))
    expect(s.lines).toHaveLength(1)
    expect(rowText(s.lines[0]!)).toBe("셋째 줄")
    expect(s.consumed).toBe(3)
  })

  it("snapshots the live current line, cursor, prompt and pause flags", () => {
    let panel = createPanelState()
    panel = applyTokens(panel, tokenizeMessage("ab"))
    const s = syncFromPanel(createMessageAreaState(), panel)
    expect(s.currentLine.map((c) => c.char)).toEqual(["a", "b"])
    expect(s.cursor).toBe(2)
    expect(s.awaitingPrompt).toBe(false)
    expect(s.paused).toBe(false)
  })

  it("copies paused from the shared panel (Hawkwind pause)", () => {
    let panel = panelWithLines(["긴 대답"])
    panel = beginPause(panel)
    const s = syncFromPanel(createMessageAreaState(), panel)
    expect(s.paused).toBe(true)
  })
})

describe("applyPlay / clearPlay", () => {
  it("applyPlay(false) clears the buffer", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = syncFromPanel(s, panelWithLines(["a", "b"]))
    s = clearPlay(s)
    expect(s.lines).toEqual([])
    expect(s.consumed).toBe(0)
  })

  it("applyPlay(true) restarts the baseline so pre-play lines stay hidden", () => {
    const panel = panelWithLines(["이전 줄", "새 플레이"])
    let s = createMessageAreaState()
    s = applyPlay(s, true, panel)
    s = syncFromPanel(s, panel)
    expect(s.lines).toHaveLength(0) // both lines predate this play session
  })
})

describe("cellUnits / wrapRow (fixed-width: Hangul 2 units, ASCII 1 unit)", () => {
  it("cellUnits: ASCII 1, Hangul 2", () => {
    expect(cellUnits("a")).toBe(1)
    expect(cellUnits("A")).toBe(1)
    expect(cellUnits("가")).toBe(2)
    expect(cellUnits("한")).toBe(2)
  })

  it("splits a row at the column budget without splitting a glyph", () => {
    // "A가B": A(1)+가(2)=3 fits, B(1) wraps to the next row.
    const line = { cells: [cell("A"), cell("가"), cell("B")] }
    const rows = wrapRow(line, 3)
    expect(rows).toHaveLength(2)
    expect(rowText(rows[0]!)).toBe("A가")
    expect(rowText(rows[1]!)).toBe("B")
  })

  it("keeps colours across the wrap", () => {
    const line = {
      cells: [
        { char: "가", color: "red" as const, kind: "text" as const },
        { char: "나", color: "red" as const, kind: "text" as const }
      ]
    }
    const rows = wrapRow(line, 2)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cells[0]!.color).toBe("red")
    expect(rows[1]!.cells[0]!.color).toBe("red")
  })

  it("wraps long ASCII runs", () => {
    const line = { cells: Array.from("abcdef", (ch) => cell(ch)) }
    const rows = wrapRow(line, 4)
    expect(rows.map((r) => rowText(r))).toEqual(["abcd", "ef"])
  })

  it("a glyph wider than the whole row still lands on its own row", () => {
    const line = { cells: [cell("한")] }
    const rows = wrapRow(line, 1)
    expect(rows).toHaveLength(1)
    expect(rowText(rows[0]!)).toBe("한")
  })
})

describe("computeView", () => {
  it("returns no rows when nothing has been shown", () => {
    const view = computeView(createMessageAreaState(), 20)
    expect(view.rows).toEqual([])
    expect(view.mode).toBe("scroll")
  })

  it("shows every row when everything fits", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = syncFromPanel(s, panelWithLines(["하나", "둘"]))
    const view = computeView(s, 20)
    expect(view.rows).toHaveLength(2)
    expect(view.clippedAbove).toBe(false)
    expect(view.clippedBelow).toBe(false)
  })

  it("bottom-aligns to the last 12 rows in scroll mode, marking older content clipped above", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = syncFromPanel(s, panelWithLines(Array.from({ length: 15 }, (_, i) => `줄 ${i + 1}`)))
    const view = computeView(s, 20)
    expect(view.mode).toBe("scroll")
    expect(view.rows).toHaveLength(MESSAGE_AREA_LINES)
    expect(view.clippedAbove).toBe(true)
    expect(view.clippedBelow).toBe(false)
    expect(rowText(view.rows[view.rows.length - 1]!)).toBe("줄 15")
  })

  it("wraps long lines to the fixed column budget before selecting the window", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = syncFromPanel(s, panelWithLines(["가나다라마바사아자차카타파하"])) // 14 Hangul = 28 units
    const view = computeView(s, 10) // 5 Hangul per row
    expect(view.rows).toHaveLength(3) // 5 + 5 + 4
    expect(rowText(view.rows[0]!)).toBe("가나다라마")
    expect(rowText(view.rows[2]!)).toBe("카타파하")
  })

  it("shows the first page with the ▼ cue when paused and overflowing", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    let panel = panelWithLines(Array.from({ length: 15 }, (_, i) => `줄 ${i + 1}`))
    panel = beginPause(panel)
    s = syncFromPanel(s, panel)
    const view = computeView(s, 20)
    expect(view.mode).toBe("page")
    expect(view.rows).toHaveLength(MESSAGE_AREA_LINES)
    expect(view.clippedBelow).toBe(true) // the "▼" page cue
    expect(view.clippedAbove).toBe(false)
    expect(rowText(view.rows[0]!)).toBe("줄 1")
  })
})

describe("input echo, choice echo and cursor", () => {
  it("appends the engine input echo to the live line as input-kind cells with the cursor after them", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = setCursor(s, true)
    s = applyInput(s, "hej")
    const view = computeView(s, 20)
    const row = view.rows[view.rows.length - 1]!
    expect(row.cells.map((c) => c.char)).toEqual(["h", "e", "j"])
    expect(row.cells.every((c) => c.kind === "input")).toBe(true)
    expect(row.cursorAt).toBe(3)
  })

  it("keeps the prompt glyph cell before the input echo", () => {
    let panel = createPanelState()
    panel = applyTokens(panel, tokenizeMessage(PROMPT_GLYPH))
    let s = createMessageAreaState()
    s = applyPlay(s, true, panel)
    s = syncFromPanel(s, panel)
    s = setCursor(s, true)
    s = applyInput(s, "직업")
    const view = computeView(s, 20)
    const row = view.rows[view.rows.length - 1]!
    expect(row.cells[0]!.kind).toBe("prompt")
    expect(row.cells.slice(1).map((c) => c.char)).toEqual(["직", "업"])
    expect(row.cells.slice(1).every((c) => c.kind === "input")).toBe(true)
    expect(row.cursorAt).toBe(3) // 1 prompt cell + 2 input cells (cell index, not width units)
  })

  it("renders the choice-key echo as a temporary cell and clearEcho removes it", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = setCursor(s, true)
    s = applyChoice(s, "A")
    let view = computeView(s, 20)
    expect(view.rows[view.rows.length - 1]!.cells.map((c) => c.char)).toEqual(["A"])
    s = clearEcho(s)
    view = computeView(s, 20)
    expect(view.rows).toEqual([])
  })

  it("hides the cursor when cursor(on)=false even while input is present", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = setCursor(s, false)
    s = applyInput(s, "ab")
    const view = computeView(s, 20)
    const row = view.rows[view.rows.length - 1]!
    expect(row.cursorAt).toBeUndefined()
    expect(row.cells.map((c) => c.char)).toEqual(["a", "b"])
  })
})

describe("prompt glyph (Stage 3 Step 8)", () => {
  it("applyPromptGlyph prepends a ▶ prompt cell to the live line, cleared by clearEcho", () => {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    s = applyPromptGlyph(s)
    s = applyInput(s, "직업")
    const view = computeView(s, 20)
    const row = view.rows[view.rows.length - 1]!
    expect(row.cells[0]!.kind).toBe("prompt")
    expect(row.cells[0]!.char).toBe("▶")
    expect(row.cells.slice(1).map((c) => c.char)).toEqual(["직", "업"])
    s = clearEcho(s)
    expect(computeView(s, 20).rows).toEqual([])
    expect(s.promptGlyph).toBe(false)
  })

  it("never doubles the prompt cell when the panel line already carries one", () => {
    let panel = createPanelState()
    panel = applyTokens(panel, tokenizeMessage(PROMPT_GLYPH))
    let s = createMessageAreaState()
    s = applyPlay(s, true, panel)
    s = syncFromPanel(s, panel)
    s = applyPromptGlyph(s)
    const view = computeView(s, 20)
    const row = view.rows[view.rows.length - 1]!
    expect(row.cells.filter((c) => c.kind === "prompt")).toHaveLength(1)
  })
})

describe("countWrappedRows (Stage 3 Step 11: paged long-answer decision)", () => {
  it("counts literal \\n line breaks as committed rows, then wraps each line at the column budget", () => {
    // "그가 말한다:" (7 Hangul = 14 units) + a short line fit one 20-col row each.
    expect(countWrappedRows("그가 말한다:\n짧은 줄", 20)).toBe(2)
    // A single long run wraps like wrapRow (Hangul 2 units each).
    expect(countWrappedRows("가나다라마바사아", 10)).toBe(2) // 5+3
    // A paragraph-heavy long answer exceeds the 12-row screen.
    expect(countWrappedRows("한 줄\n".repeat(13) + "마지막", 20)).toBe(14)
  })
})

describe("page mode paging (Stage 3 Step 11)", () => {
  function pausedOverflowingState(lineCount = 36): ReturnType<typeof createMessageAreaState> {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    let panel = panelWithLines(Array.from({ length: lineCount }, (_, i) => `줄 ${i + 1}`))
    panel = beginPause(panel)
    s = syncFromPanel(s, panel)
    return s
  }

  it("nextPage advances the visible page; the ▼ cue (clippedBelow) stays until the last page", () => {
    // 36 rows, 12 per page -> exactly three full pages.
    let s = pausedOverflowingState()
    let view = computeView(s, 20)
    expect(view.mode).toBe("page")
    expect(view.rows).toHaveLength(MESSAGE_AREA_LINES)
    expect(view.clippedBelow).toBe(true)
    expect(rowText(view.rows[0]!)).toBe("줄 1")

    s = nextPage(s)
    view = computeView(s, 20)
    expect(rowText(view.rows[0]!)).toBe("줄 13")
    expect(view.clippedBelow).toBe(true)

    s = nextPage(s)
    view = computeView(s, 20)
    expect(rowText(view.rows[0]!)).toBe("줄 25")
    expect(rowText(view.rows[view.rows.length - 1]!)).toBe("줄 36")
    expect(view.clippedBelow).toBe(false)
    expect(view.clippedAbove).toBe(true)
  })

  it("over-advancing clamps to the last page", () => {
    let s = pausedOverflowingState()
    for (let i = 0; i < 10; i++) s = nextPage(s)
    const view = computeView(s, 20)
    expect(view.mode).toBe("page")
    expect(rowText(view.rows[view.rows.length - 1]!)).toBe("줄 36")
    expect(view.clippedBelow).toBe(false)
  })

  it("leaving the paused state resets the page index to the first page", () => {
    let s = pausedOverflowingState()
    s = nextPage(s)
    expect(computeView(s, 20).rows[0]!.cells[0]!.char).toBe("줄")
    // The panel unpauses (the engine continued): the next sync resets paging.
    let panel = panelWithLines(Array.from({ length: 36 }, (_, i) => `줄 ${i + 1}`))
    panel = applyTokens(panel, tokenizeMessage("다음 내용\n"))
    s = syncFromPanel(s, panel)
    expect(s.paused).toBe(false)
    expect(s.pageIndex).toBe(0)
    const view = computeView(s, 20)
    expect(view.mode).toBe("scroll")
    expect(rowText(view.rows[view.rows.length - 1]!)).toBe("다음 내용")
  })

  it("clearEcho and applyPlay(false) reset the page index", () => {
    let s = pausedOverflowingState()
    s = nextPage(s)
    expect(s.pageIndex).toBe(1)
    expect(clearEcho(s).pageIndex).toBe(0)
    s = nextPage(s)
    expect(applyPlay(s, false, createPanelState()).pageIndex).toBe(0)
  })
})
// Observed 2026-10-06 (Lord British "심연", probe log): when a long answer paused
// the overlay, page mode showed page 0 of the WHOLE play buffer (old walking
// lines like "동쪽") instead of the answer, for the ~20 s the engine waited.
// A paused page starts where the paused answer starts.
describe("page mode starts at the paused answer", () => {
  function pausedAfterHistory(historyCount: number, answerLines: number) {
    let s = createMessageAreaState()
    s = applyPlay(s, true, createPanelState())
    const history = Array.from({ length: historyCount }, () => "동쪽")
    s = syncFromPanel(s, panelWithLines(history))
    const answer = Array.from({ length: answerLines }, (_, i) => `대답 ${i + 1}`)
    let panel = panelWithLines([...history, ...answer])
    panel = beginPause(panel)
    return syncFromPanel(s, panel)
  }

  it("shows the answer's first page, not the oldest history", () => {
    const view = computeView(pausedAfterHistory(30, 20), 20)
    expect(view.mode).toBe("page")
    expect(rowText(view.rows[0]!)).toBe("대답 1")
    expect(view.clippedBelow).toBe(true)
  })

  it("next page continues inside the answer", () => {
    const view = computeView(nextPage(pausedAfterHistory(30, 20)), 20)
    expect(rowText(view.rows[0]!)).toBe("대답 9")
  })

  it("an answer that fits one screen is just shown (scroll view, bottom-aligned)", () => {
    const view = computeView(pausedAfterHistory(30, 5), 20)
    expect(view.mode).toBe("scroll")
    expect(rowText(view.rows[view.rows.length - 1]!)).toBe("대답 5")
  })
})
