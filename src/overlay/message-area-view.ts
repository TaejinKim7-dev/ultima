// Todo 49 Phase A: the message-area overlay's pure view model.
//
// The overlay shares the dialogue panel's PanelState (src/dialogue/
// message-tokens.ts) but shows only the lines committed since play began,
// re-wraps them to the message area's fixed column budget (Hangul = 2 units,
// ASCII = 1 unit, matching Neo둥근모's 16x16 Hangul vs 8x16 Latin glyphs),
// and bottom-aligns the last 12 rows so the newest line is always visible.
//
// The engine's web-only screen signals (Module.u4Screen, see
// tests/unit/message-area-engine-hooks.test.ts) feed the typed input echo
// (`input`), the accepted choice-key echo (`choice`) and the blinking cursor
// (`cursor`). Long answers pause with a "▼" page cue: while the shared panel
// is `paused` (a Hawkwind-style waitAnyKey) and the content overflows the
// box, the view shows the FIRST page instead of the last, with
// `clippedBelow` true so the shell can draw the "▼" cue.
//
// Pure and side-effect-free: no DOM, no engine. `src/shell.ts` (Phase B)
// turns the resulting rows into DOM nodes.
//
// Phase B (Step 11) adds the page offset: `pageIndex` picks which page of a
// paused (paged) long answer is shown, and `nextPage()` advances it. Each
// prompt-close or play-stop resets it through `clearEcho`/`applyPlay`, and
// leaving the paused state (`syncFromPanel` sees `paused` false) resets it
// too, so paging never lingers into ordinary scrolling.
import { MESSAGE_AREA_LINES } from "./message-area-layout.ts"
import { createPanelState, type PanelCell, type PanelColor, type PanelLine, type PanelState } from "../dialogue/message-tokens.ts"

/** One row of the message area as the shell should render it. */
export interface MessageAreaRow {
  readonly cells: readonly PanelCell[]
  /** The caret's cell index within this row, when the cursor sits here. */
  readonly cursorAt?: number
}

/** The computed view for one frame. */
export interface MessageAreaView {
  readonly rows: readonly MessageAreaRow[]
  /**
   * "scroll" bottom-aligns to the newest content (older rows clipped
   * above); "page" freezes on the first page while a long answer waits for
   * a key (more content below, the "▼" cue).
   */
  readonly mode: "scroll" | "page"
  /** Older wrapped rows were cut off above (scroll mode). */
  readonly clippedAbove: boolean
  /** More wrapped rows exist below the visible page (page mode: "▼"). */
  readonly clippedBelow: boolean
}

/**
 * The view's full render state. `lines` is the overlay's OWN buffer of
 * committed panel lines since play began; everything else is a live snapshot
 * of the shared PanelState plus the engine's input/cursor signals.
 */
export interface MessageAreaState {
  /** Whether the engine is in play (the `play(on)` signal). */
  readonly playing: boolean
  /** Committed lines since the last play start. */
  readonly lines: readonly PanelLine[]
  /** How many PanelState.historyLines have already been folded into `lines`. */
  readonly consumed: number
  /** Live snapshot of the shared panel's in-progress line. */
  readonly currentLine: readonly PanelCell[]
  /** Live panel cursor index within currentLine. */
  readonly cursor: number
  /** Live active colour (cells written after the last colour token). */
  readonly activeColor: PanelColor
  /** Live panel prompt flag (an idle prompt glyph is on the current line). */
  readonly awaitingPrompt: boolean
  /** Live panel pause flag (a Hawkwind-style waitAnyKey is outstanding). */
  readonly paused: boolean
  /** Engine `input(id, text)` echo -- the text typed at the current prompt. */
  readonly inputText: string
  /** Engine `choice(ch)` echo -- one accepted choice key, a temporary cell. */
  readonly choiceEcho: string | null
  /** Engine `cursor(on)` -- whether the blinking cursor is currently shown. */
  readonly cursorVisible: boolean
  /**
   * Phase B (Step 8): the standalone control-only prompt-glyph message
   * (`screenPrompt()`'s `"%c"` with CHARSET_PROMPT) reached the overlay
   * directly instead of through the shared panel. While true, the live line
   * starts with a "▶" cell, exactly where the panel would have put a prompt
   * cell had the format been translatable.
   */
  readonly promptGlyph: boolean
  /**
   * Phase B (Step 11): which page of a paused (paged) long answer is shown.
   * Zero means the first page; `computeView` clamps so the last page never
   * overruns the buffer. Reset by `clearEcho`, `applyPlay` and by leaving
   * the paused state (see `syncFromPanel`).
   */
  readonly pageIndex: number
}

export function createMessageAreaState(): MessageAreaState {
  return {
    playing: false,
    lines: [],
    consumed: 0,
    currentLine: [],
    cursor: 0,
    activeColor: "default",
    awaitingPrompt: false,
    paused: false,
    inputText: "",
    choiceEcho: null,
    cursorVisible: false,
    promptGlyph: false,
    pageIndex: 0
  }
}

/**
 * The engine's `play(on)` signal. On, the overlay starts a fresh buffer whose
 * baseline skips every line already committed to the shared panel (the intro
 * and menu output predating play); off, the buffer is cleared and `playing`
 * becomes false so no further lines accumulate.
 */
export function applyPlay(state: MessageAreaState, on: boolean, panel: PanelState): MessageAreaState {
  if (!on) {
    return { ...state, playing: false, lines: [], consumed: 0, pageIndex: 0 }
  }
  return { ...state, playing: true, lines: [], consumed: panel.historyLines.length, pageIndex: 0 }
}

/** Alias for `applyPlay(state, false, panel)`; see its doc comment. */
export function clearPlay(state: MessageAreaState): MessageAreaState {
  return applyPlay(state, false, createPanelState())
}

/**
 * Folds newly committed panel history into the overlay's buffer and
 * snapshots the live current line/cursor/prompt/pause flags. Lines committed
 * before play began are never accumulated (applyPlay sets the baseline).
 */
export function syncFromPanel(state: MessageAreaState, panel: PanelState): MessageAreaState {
  const next: MessageAreaState = {
    ...state,
    currentLine: panel.currentLine,
    cursor: panel.cursor,
    activeColor: panel.activeColor,
    awaitingPrompt: panel.awaitingPrompt,
    paused: panel.paused,
    consumed: panel.historyLines.length,
    // Leaving the paused state ends any page-mode paging (Step 11): the
    // next ordinary scroll render starts from the first page again.
    pageIndex: panel.paused ? state.pageIndex : 0
  }
  if (!state.playing) {
    return next
  }
  const fresh = panel.historyLines.slice(state.consumed)
  if (fresh.length === 0) {
    return next
  }
  return { ...next, lines: [...state.lines, ...fresh] }
}

/** Engine `input(id, text)` -- replace the typed input echo (the engine sends the whole current value on every change, ESC included). */
export function applyInput(state: MessageAreaState, text: string): MessageAreaState {
  return { ...state, inputText: text }
}

/** Engine `choice(ch)` -- set the one-key echo shown at the current prompt. */
export function applyChoice(state: MessageAreaState, ch: string): MessageAreaState {
  return { ...state, choiceEcho: ch }
}

/** Clears the typed/choice echo and the cursor (a prompt closed, or a new message arrived). */
export function clearEcho(state: MessageAreaState): MessageAreaState {
  return { ...state, inputText: "", choiceEcho: null, cursorVisible: false, promptGlyph: false, pageIndex: 0 }
}

/** Engine `cursor(on)` -- blinking cursor visibility. */
export function setCursor(state: MessageAreaState, on: boolean): MessageAreaState {
  return { ...state, cursorVisible: on }
}

/**
 * Phase B (Step 8): the standalone control-only prompt glyph arrived
 * (`onControl` with `{ kind: "prompt-glyph" }`). The live line will start
 * with a "▶" cell until the prompt closes (`clearEcho`).
 */
export function applyPromptGlyph(state: MessageAreaState): MessageAreaState {
  return { ...state, promptGlyph: true, awaitingPrompt: true }
}

/**
 * Phase B (Step 11): advance to the next page of a paused (paged) long
 * answer. `computeView` clamps to the last page, so over-advancing is safe.
 */
export function nextPage(state: MessageAreaState): MessageAreaState {
  return { ...state, pageIndex: state.pageIndex + 1 }
}

/**
 * The message area's column budget counts a Hangul glyph as 2 units and an
 * ASCII glyph as 1 -- Neo둥근모's Hangul is 16x16 while Latin is 8x16, so a
 * full-width glyph occupies two native 8px cells. Any non-ASCII glyph is
 * treated as full-width.
 */
export function cellUnits(ch: string): number {
  return ch.charCodeAt(0) > 0x7f ? 2 : 1
}

/** Splits one committed line into fixed-width rows of at most `columns` units, never splitting a glyph. */
export function wrapRow(line: PanelLine, columns: number): readonly PanelLine[] {
  return wrapCells(line.cells, columns)
}

/**
 * Phase B (Step 11): the number of wrapped rows `text` would occupy on a
 * `columns`-wide box. Mirrors how the panel commits the text: each literal
 * "\n" is its own committed line (message-tokens.ts's newline token), and
 * each committed line then wraps at the column budget exactly like
 * `wrapRow` (Hangul 2 units, ASCII 1). The shell uses this to decide whether
 * a long castle answer needs the "▼" page mode.
 */
export function countWrappedRows(text: string, columns: number): number {
  let used = 0
  let rows = 1
  for (const ch of text) {
    if (ch === "\n") {
      rows += 1
      used = 0
      continue
    }
    const units = cellUnits(ch)
    if (used + units > columns) {
      rows += 1
      used = 0
    }
    used += units
  }
  return rows
}

function wrapCells(cells: readonly PanelCell[], columns: number): PanelLine[] {
  if (cells.length === 0) {
    return []
  }
  const rows: PanelLine[] = []
  let row: PanelCell[] = []
  let used = 0
  for (const cell of cells) {
    const units = cellUnits(cell.char)
    if (row.length > 0 && used + units > columns) {
      rows.push({ cells: row })
      row = []
      used = 0
    }
    row.push(cell)
    used += units
  }
  rows.push({ cells: row })
  return rows
}

/** The live line the overlay actually draws: the panel's current line plus the engine's choice/input echo and the caret. */
function mergedLiveLine(state: MessageAreaState): { cells: PanelCell[]; cursorIndex: number | null } {
  const cells = state.currentLine.slice()
  // The panel's own prompt cell (a synthetic dispatch) OR the standalone
  // control-only prompt glyph (real engine) -- never both.
  if (state.promptGlyph && !cells.some((cell) => cell.kind === "prompt")) {
    cells.push({ char: "▶", color: state.activeColor, kind: "prompt" })
  }
  if (state.choiceEcho !== null && state.choiceEcho !== "") {
    cells.push({ char: state.choiceEcho, color: state.activeColor, kind: "input" })
  }
  for (const ch of state.inputText) {
    cells.push({ char: ch, color: state.activeColor, kind: "input" })
  }
  let cursorIndex: number | null = null
  if (state.cursorVisible) {
    cursorIndex =
      state.inputText !== "" || state.choiceEcho !== null ? cells.length : Math.min(state.cursor, cells.length)
  }
  return { cells, cursorIndex }
}

/** Finds which wrapped row a cursor cell index lands in (row = index into the wrapped rows, col = cell offset). */
function locateCursor(rows: readonly PanelLine[], cursorIndex: number | null): { row: number; col: number } | null {
  if (cursorIndex === null) {
    return null
  }
  let offset = 0
  for (let r = 0; r < rows.length; r += 1) {
    const rowLength = rows[r]!.cells.length
    if (cursorIndex <= offset + rowLength) {
      return { row: r, col: cursorIndex - offset }
    }
    offset += rowLength
  }
  return null
}

/**
 * Computes the rows to display for one frame. Committed lines are wrapped
 * and then the live (input-merged) current line is appended. In scroll mode
 * the last `MESSAGE_AREA_LINES` rows are shown bottom-aligned; in page mode
 * (paused and overflowing) the FIRST page is shown with the "▼" cue
 * (`clippedBelow`). The cursor is placed on whichever wrapped row the live
 * caret sits in.
 */
export function computeView(state: MessageAreaState, columns: number): MessageAreaView {
  const allRows: MessageAreaRow[] = []
  for (const line of state.lines) {
    for (const row of wrapRow(line, columns)) {
      allRows.push({ cells: row.cells })
    }
  }

  const live = mergedLiveLine(state)
  const liveRows = wrapCells(live.cells, columns)
  const liveStart = allRows.length
  for (const row of liveRows) {
    allRows.push({ cells: row.cells })
  }

  const totalRows = allRows.length
  const maxRows = MESSAGE_AREA_LINES
  const pageMode = state.paused && totalRows > maxRows

  if (pageMode) {
    // Phase B (Step 11): `pageIndex` picks the visible page of the paused
    // long answer. The last page clamps to the buffer end so over-advancing
    // simply stops on the final page (clippedBelow false -> the cue hides).
    let start = state.pageIndex * maxRows
    if (start + maxRows > totalRows) {
      start = Math.max(0, totalRows - maxRows)
    }
    return {
      rows: allRows.slice(start, start + maxRows),
      mode: "page",
      clippedAbove: start > 0,
      clippedBelow: start + maxRows < totalRows
    }
  }

  const start = Math.max(0, totalRows - maxRows)
  const liveCursor = locateCursor(liveRows, live.cursorIndex)
  if (liveCursor !== null) {
    const absolute = liveStart + liveCursor.row
    if (absolute >= start && absolute < totalRows) {
      const row = allRows[absolute]!
      allRows[absolute] = { ...row, cursorAt: liveCursor.col }
    }
  }

  return {
    rows: allRows.slice(start),
    mode: "scroll",
    clippedAbove: start > 0,
    clippedBelow: false
  }
}