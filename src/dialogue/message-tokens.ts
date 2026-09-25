// Todo 11: converts screen message output into tokenized bridge events and
// a pure "dialogue panel" model, so `src/shell.ts` can render Korean/English
// text into the HTML dialogue panel below the canvas with history/scroll/
// prompt state instead of dumping raw strings.
//
// This module is intentionally DOM-free and side-effect-free (see
// `tests/unit/message-tokens.test.ts`); `src/shell.ts` is the only place
// that turns this state into DOM nodes, and it does so with
// `textContent`/`createElement` only -- never `innerHTML` (see this
// module's own safety-guard test, and the "Must not append raw HTML"
// requirement in `.omo/plans/ultima-web.md`'s Todo 11 entry).
//
// Byte model (verified against the real engine sources, not guessed):
// `MessageBridgeEvent.text` already carries every control byte the native
// engine's message buffer does -- `vendor/xu4/src/screen.cpp`'s
// `screenMessageN()` scans a printf-formatted C buffer for a handful of
// control bytes and treats everything else as a literal glyph to draw.
// A JS string can hold those exact same byte values as characters, so no
// bridge ABI change is needed: `text` IS the token stream, and
// `tokenizeMessage` just parses it the same way `screenMessageN`'s switch
// does. Recognized bytes (screen.cpp ~449-541):
//   0x08 '\b'  backspace      -- moves the cursor back; does NOT erase
//   0x0A '\n'  newline        -- commits the current line, starts a new one
//   0x0D '\r'  carriage return -- returns to column 0, no line advance
//   0x12       cursor-right (DC2) -- advances the cursor, draws nothing
//   0x13-0x19  FG_GREY..FG_WHITE (`vendor/xu4/src/textview.h`) -- color change
//   0x10       CHARSET_PROMPT (`vendor/xu4/src/u4.h`) -- the idle "ready for
//              input" cursor glyph `screenPrompt()` emits at column 0; it
//              falls through screenMessageN's switch to the default
//              printable-glyph case, so natively it's drawn text, not an
//              opcode -- we still tag it as its own token so the panel can
//              render a distinct cursor indicator instead of the raw byte.
// Two things NOT modeled as in-band bytes, both intentional:
//   - "clear": no evidence of an in-band clear-screen byte in
//     `screenMessageN` (`vendor/xu4/src/screen.cpp`) or elsewhere in
//     `vendor/xu4/src/`. The bridge ABI already has a dedicated
//     `ClearBridgeEvent` for this (see `src/bridge/types.ts`); `shell.ts`
//     resets `PanelState` via `createPanelState()` on that event instead of
//     inventing an unverified message-byte opcode here.
//   - Hawkwind-style "pause": `EventHandler::waitAnyKey()` (e.g.
//     `vendor/xu4/src/discourse_castle.cpp`'s `runTalkHawkwind`, called
//     right after printing the greeting) is a blocking *function call*, not
//     a byte inside the message buffer -- there is nothing for a tokenizer
//     to find. It rides `MessageBridgeEvent.awaitKey` instead (see
//     `src/bridge/types.ts`); `beginPause`/`resumePanel` below flip
//     `PanelState.paused` directly, independent of `tokenizeMessage`.
// Word wrap is deliberately NOT modeled here: the native engine's wrap
// logic exists only because it draws onto a fixed 40-column glyph grid.
// This port's dialogue panel is an unbounded scrolling HTML history, so
// wrapping is CSS's job (`overflow-wrap`/`word-break` in `src/shell.css`).

/** The seven native foreground text colors (`vendor/xu4/src/textview.h`'s `TextColor` enum), plus "default" for text before any color code has been seen. */
export const TEXT_COLOR_CODES = ["grey", "blue", "purple", "green", "red", "yellow", "white"] as const
export type TextColorCode = (typeof TEXT_COLOR_CODES)[number]
export type PanelColor = TextColorCode | "default"

/** Byte -> color name, matching `textview.h`'s `FG_GREY` (0x13) .. `FG_WHITE` (0x19). */
const COLOR_BYTES: Readonly<Record<string, TextColorCode>> = {
  "\x13": "grey",
  "\x14": "blue",
  "\x15": "purple",
  "\x16": "green",
  "\x17": "red",
  "\x18": "yellow",
  "\x19": "white"
}

const BACKSPACE = "\b"
const NEWLINE = "\n"
const CARRIAGE_RETURN = "\r"
const CURSOR_RIGHT = "\x12"
const CHARSET_PROMPT = "\x10"

/** The token kinds this module recognizes -- see the module doc comment for exactly which native bytes map to which kind, and which two kinds deliberately have no byte. */
export type MessageToken =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "newline" }
  | { readonly type: "carriage-return" }
  | { readonly type: "backspace" }
  | { readonly type: "right" }
  | { readonly type: "color"; readonly code: TextColorCode }
  | { readonly type: "prompt" }

/**
 * Parses a raw message string (a `MessageBridgeEvent.text` value) into a
 * flat token list, coalescing runs of plain characters into single `text`
 * tokens. Pure, total, and never throws -- any input, including hostile
 * `<script>`-like strings, is scanned byte-by-byte and either matches one
 * of the recognized control bytes above or becomes literal `text` content.
 * There is no code path here that interprets a string as markup.
 */
export function tokenizeMessage(raw: string): MessageToken[] {
  const tokens: MessageToken[] = []
  let textRun = ""

  function flushTextRun(): void {
    if (textRun.length > 0) {
      tokens.push({ type: "text", value: textRun })
      textRun = ""
    }
  }

  for (const ch of raw) {
    const color = COLOR_BYTES[ch]
    if (ch === BACKSPACE) {
      flushTextRun()
      tokens.push({ type: "backspace" })
    } else if (ch === NEWLINE) {
      flushTextRun()
      tokens.push({ type: "newline" })
    } else if (ch === CARRIAGE_RETURN) {
      flushTextRun()
      tokens.push({ type: "carriage-return" })
    } else if (ch === CURSOR_RIGHT) {
      flushTextRun()
      tokens.push({ type: "right" })
    } else if (ch === CHARSET_PROMPT) {
      flushTextRun()
      tokens.push({ type: "prompt" })
    } else if (color !== undefined) {
      flushTextRun()
      tokens.push({ type: "color", code: color })
    } else {
      textRun += ch
    }
  }
  flushTextRun()

  return tokens
}

/** One fixed-position character cell in a panel line -- a column in the native message-area grid, minus the fixed width (see the module doc comment on word wrap). */
export interface PanelCell {
  readonly char: string
  readonly color: PanelColor
}

/** One committed (newline-terminated) line of the dialogue panel. */
export interface PanelLine {
  readonly cells: readonly PanelCell[]
}

/** One contiguous same-color run within a line, for DOM rendering as a single `<span>` (see `src/shell.ts`). */
export interface PanelRun {
  readonly text: string
  readonly color: PanelColor
}

/**
 * The dialogue panel's full render state: committed history lines, the
 * in-progress current line with its cursor, the active color, and the two
 * out-of-band UI flags (`awaitingPrompt`, `paused`) tokens alone can only
 * partly (`awaitingPrompt`) or never (`paused`) express.
 */
export interface PanelState {
  readonly historyLines: readonly PanelLine[]
  readonly currentLine: readonly PanelCell[]
  readonly cursor: number
  readonly activeColor: PanelColor
  readonly awaitingPrompt: boolean
  readonly paused: boolean
}

export function createPanelState(): PanelState {
  return {
    historyLines: [],
    currentLine: [],
    cursor: 0,
    activeColor: "default",
    awaitingPrompt: false,
    paused: false
  }
}

function writeCell(state: PanelState, cell: PanelCell): PanelState {
  const cells = state.currentLine.slice()
  if (state.cursor < cells.length) {
    cells[state.cursor] = cell
  } else {
    // Pad with blanks if the cursor was moved (via `right`) past the
    // current end of the line -- matches the native fixed-grid cursor,
    // which can be positioned anywhere before anything is drawn there.
    while (cells.length < state.cursor) {
      cells.push({ char: " ", color: state.activeColor })
    }
    cells.push(cell)
  }
  return { ...state, currentLine: cells, cursor: state.cursor + 1 }
}

/**
 * Folds one token into the panel state. Pure; never mutates its input.
 * See the module doc comment for exactly what each token kind means and
 * why "clear" and "pause" are handled elsewhere instead of here.
 */
export function applyToken(state: PanelState, token: MessageToken): PanelState {
  switch (token.type) {
    case "text": {
      let next = state
      for (const ch of token.value) {
        next = writeCell(next, { char: ch, color: next.activeColor })
      }
      return { ...next, awaitingPrompt: false }
    }
    case "newline": {
      const line: PanelLine = { cells: state.currentLine }
      return {
        ...state,
        historyLines: [...state.historyLines, line],
        currentLine: [],
        cursor: 0,
        awaitingPrompt: false
      }
    }
    case "carriage-return":
      return { ...state, cursor: 0 }
    case "backspace":
      return { ...state, cursor: Math.max(0, state.cursor - 1) }
    case "right":
      if (state.cursor < state.currentLine.length) {
        // An existing cell is already there -- move over it untouched,
        // matching `case 0x12: c->col++; continue;` in screen.cpp (draws
        // nothing).
        return { ...state, cursor: state.cursor + 1 }
      }
      return writeCell(state, { char: " ", color: state.activeColor }) // pads past the end
    case "color":
      return { ...state, activeColor: token.code }
    case "prompt":
      return { ...writeCell(state, { char: "▮", color: state.activeColor }), awaitingPrompt: true }
  }
}

/** Folds a whole token list onto a state in order. */
export function applyTokens(state: PanelState, tokens: readonly MessageToken[]): PanelState {
  return tokens.reduce(applyToken, state)
}

/** Marks a Hawkwind-style pause (native `EventHandler::waitAnyKey()`) -- called from `awaitKey` on a `message` bridge event, never derived from `text` (see the module doc comment). */
export function beginPause(state: PanelState): PanelState {
  return { ...state, paused: true }
}

/** Clears a pending pause. `src/shell.ts` calls this when the next `message`/`prompt`/`clear` bridge event arrives -- there is no separate "any key" bridge event today, so the next real content is treated as having satisfied the wait. */
export function resumePanel(state: PanelState): PanelState {
  return { ...state, paused: false }
}

/** Plain text of a line/current-line snapshot, discarding color -- used by tests and anywhere only the characters matter. */
export function lineText(line: PanelLine): string {
  return line.cells.map((cell) => cell.char).join("")
}

/** Groups a line's cells into contiguous same-color runs, for rendering as one `<span>` per run (see `src/shell.ts`). */
export function toRuns(line: PanelLine): PanelRun[] {
  const runs: PanelRun[] = []
  for (const cell of line.cells) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.color === cell.color) {
      runs[runs.length - 1] = { text: last.text + cell.char, color: last.color }
    } else {
      runs.push({ text: cell.char, color: cell.color })
    }
  }
  return runs
}
