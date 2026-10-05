// Stage 3 Lane B Step 10: the in-game Korean message-area overlay DOM.
//
// The native message area (TEXT_AREA at {192,96,128,96} of the 320x200
// raster) still rasterizes English through the WebGL2 canvas. This module
// lays an always-on, opaque high-resolution DOM box over that rect and
// renders the same Korean lines the right-hand panel composes, wrapped to
// the message area's own fixed column budget (see message-area-layout.ts
// and message-area-view.ts). The position and font metrics are computed
// here from the canvas's actual displayed box -- this element is NOT a
// child of `#overlay-layer` (which the intro/status overlays share), so a
// top-menu modal can hide that whole layer and this box independently.
//
// Visibility rule (user decision 2026-10-04): the box is shown when the
// switch is on AND the engine is in play AND no top-menu modal (ESC /
// game browser) is open. A modal hides `#overlay-layer` entirely (the
// status/intro overlays too) and this box.
//
// The switch checkbox (`#toggle-screen-ko`) is keyboard-reachable but
// NEVER auto-focused (accessibility policy, Lane B decision): tabindex=0
// and no focus() call. The whole box is aria-hidden -- screen-reader users
// read the right-hand panel instead.
//
// Frame batching: all state transitions mutate an internal pure
// `MessageAreaState` (message-area-view.ts) and one requestAnimationFrame
// loop syncs it from the shared panel and re-renders, so any burst of
// engine signals costs at most one DOM update per frame.

import { MESSAGE_AREA_LINES, MESSAGE_AREA_RECT, computeMessageAreaMetrics, type MessageAreaMetrics } from "./message-area-layout.ts"
import {
  applyChoice,
  applyInput,
  applyPlay,
  applyPromptGlyph,
  clearEcho,
  computeView,
  nextPage,
  setCursor,
  syncFromPanel,
  type MessageAreaState,
  type MessageAreaView
} from "./message-area-view.ts"
import { toCssRect, type ContentRect } from "./overlay-layout.ts"
import type { PanelCell, PanelColor, PanelState } from "../dialogue/message-tokens.ts"

/** The session-scoped "게임 화면에 한국어 표시" toggle (default on; `?screen-ko=0` off). */
export interface ScreenToggle {
  enabled: boolean
}

export interface MessageAreaOverlayOptions {
  /** The overlay's own initial render state (usually `createMessageAreaState()`). */
  readonly state: MessageAreaState
  /** Live snapshot of the shared dialogue-panel state the overlay mirrors. */
  readonly panelState: () => PanelState
  /** The session toggle; the checkbox created here reads and writes it. */
  readonly switchToggle: ScreenToggle
  /** Where the overlay DOM is appended (`#game-viewport`, NOT `#overlay-layer`). */
  readonly host: HTMLElement
  /** `#overlay-layer` -- hidden while a top-menu modal is open. */
  readonly overlayLayer: HTMLElement
  /** The canvas's displayed box in the host's coordinate space (see shell.ts's currentContentRect). */
  readonly getContentRect: () => ContentRect
  /** Injected so tests can use a stub; defaults to the document of `host`. */
  readonly doc?: Document
}

export interface MessageAreaOverlayHandle {
  /** True while the opaque box is actually on screen (switch + play + no modal). */
  readonly active: boolean
  /** Step 11: whether a paused long answer is waiting with a "▼" page cue. */
  isPageMode(): boolean
  /** The full-width column budget currently wrapped to (for the shell's awaitKey decision). */
  columns(): number
  /** Step 11: advance the paused long answer one page. */
  nextPage(): void
  /** Engine `input(id, text)` echo. */
  applyInput(text: string): void
  /** Engine `choice(ch)` one-key echo. */
  applyChoice(ch: string): void
  /** Engine `cursor(on)`. */
  setCursor(on: boolean): void
  /** Engine `play(on)`. */
  applyPlay(on: boolean): void
  /** Engine `modal(on)` -- hides the box and `#overlay-layer` while open. */
  applyModal(on: boolean): void
  /** Engine `crlf()`. */
  applyCrlf(): void
  /** Step 8: the standalone control-only prompt glyph arrived. */
  applyPromptGlyph(): void
  /** A prompt closed with uncommitted typed text -- fold it into the buffer. */
  commitEcho(): void
}

const PROMPT_GLYPH_CHAR = "▶"
const CURSOR_CHAR = "▏"
const PAGE_CUE_CHAR = "▼"

const COLOR_CLASS: Readonly<Record<PanelColor, string>> = {
  default: "ma-color-default",
  grey: "ma-color-grey",
  blue: "ma-color-blue",
  purple: "ma-color-purple",
  green: "ma-color-green",
  red: "ma-color-red",
  yellow: "ma-color-yellow",
  white: "ma-color-white"
}

/**
 * The overlay's font/line metrics for the canvas content rect `content`.
 * Pure, so a unit test pins which box the sizing rule is applied to.
 */
export function messageAreaMetricsForContent(content: ContentRect, dpr: number): MessageAreaMetrics {
  return computeMessageAreaMetrics(toCssRect(MESSAGE_AREA_RECT, content, dpr), dpr)
}

function devicePixelRatio(win: Window | null): number {
  return win !== null && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1
}

export function createMessageAreaOverlay(options: MessageAreaOverlayOptions): MessageAreaOverlayHandle {
  const doc = options.doc ?? options.host.ownerDocument
  const win = doc.defaultView ?? null
  const host = options.host

  let state: MessageAreaState = options.state
  let modalOpen = false
  let lastSignature = ""
  let lastVisible: boolean | null = null
  let metrics: MessageAreaMetrics = computeMessageAreaMetrics({ width: 1, height: 1 }, 1)

  // --- DOM creation (createElement/textContent only -- never innerHTML). ---
  const box = doc.createElement("div")
  box.className = "messagearea ma-color-default ma-backed"
  box.dataset["role"] = "messagearea"
  box.setAttribute("aria-hidden", "true")
  box.hidden = true

  const rowsHost = doc.createElement("div")
  rowsHost.className = "messagearea-rows"
  box.appendChild(rowsHost)

  const pageCue = doc.createElement("div")
  pageCue.className = "messagearea-cue"
  pageCue.textContent = PAGE_CUE_CHAR
  pageCue.hidden = true
  box.appendChild(pageCue)

  const toggleLabel = doc.createElement("label")
  toggleLabel.className = "messagearea-toggle"
  toggleLabel.title = "게임 화면에 한국어 표시"
  const toggleInput = doc.createElement("input")
  toggleInput.type = "checkbox"
  toggleInput.id = "toggle-screen-ko"
  toggleInput.tabIndex = 0 // keyboard-reachable, never auto-focused
  toggleInput.checked = options.switchToggle.enabled
  const toggleSpan = doc.createElement("span")
  toggleSpan.textContent = "한국어"
  toggleLabel.appendChild(toggleInput)
  toggleLabel.appendChild(toggleSpan)

  host.appendChild(box)
  host.appendChild(toggleLabel)

  toggleInput.addEventListener("change", () => {
    options.switchToggle.enabled = toggleInput.checked
    // Session-scoped + URL-persisted (user decision: `?screen-ko=0` keeps a
    // refresh's toggle; no localStorage -- audit:dist forbids it).
    const url = new URL(win?.location.href ?? "about:blank")
    if (toggleInput.checked) {
      url.searchParams.delete("screen-ko")
    } else {
      url.searchParams.set("screen-ko", "0")
    }
    win?.history.replaceState(null, "", url.toString())
    renderNow()
  })

  function visible(): boolean {
    return options.switchToggle.enabled && state.playing && !modalOpen
  }

  function contentRect(): ContentRect {
    return options.getContentRect()
  }

  function currentMetrics(): MessageAreaMetrics {
    return messageAreaMetricsForContent(contentRect(), devicePixelRatio(win))
  }

  function renderRow(row: { cells: readonly PanelCell[]; cursorAt?: number }): HTMLDivElement {
    const rowEl = doc.createElement("div")
    rowEl.className = "messagearea-row"
    let insertedCaret = false
    for (let index = 0; index < row.cells.length; index += 1) {
      if (row.cursorAt !== undefined && index === row.cursorAt && !insertedCaret) {
        rowEl.appendChild(caretSpan())
        insertedCaret = true
      }
      const cell = row.cells[index]!
      const span = doc.createElement("span")
      span.className = `${COLOR_CLASS[cell.color] ?? COLOR_CLASS.default}${cell.kind === "input" ? " ma-input" : ""}`
      span.textContent = cell.kind === "prompt" ? PROMPT_GLYPH_CHAR : cell.char
      rowEl.appendChild(span)
    }
    if (row.cursorAt !== undefined && !insertedCaret) {
      rowEl.appendChild(caretSpan())
    }
    return rowEl
  }

  function caretSpan(): HTMLSpanElement {
    const caret = doc.createElement("span")
    caret.className = "ma-cursor"
    caret.textContent = CURSOR_CHAR
    return caret
  }

  function render(view: MessageAreaView, boxRect: { left: number; top: number; width: number; height: number }): void {
    const show = visible()
    box.hidden = !show
    toggleLabel.hidden = !(state.playing && !modalOpen)
    if (!show) {
      // Force a content rebuild next time the box comes back on screen.
      lastSignature = ""
      lastVisible = false
      return
    }

    // Positioning is always applied (cheap) so a canvas/viewport resize is
    // reflected even when the wrapped content signature is unchanged.
    box.style.left = `${boxRect.left}px`
    box.style.top = `${boxRect.top}px`
    box.style.width = `${boxRect.width}px`
    box.style.height = `${boxRect.height}px`
    box.style.fontSize = `${metrics.fontCssPx}px`
    box.style.lineHeight = `${metrics.lineHeightCssPx}px`

    // Position the toggle just below the box, left-aligned with it.
    toggleLabel.style.left = `${boxRect.left}px`
    toggleLabel.style.top = `${boxRect.top + boxRect.height + 4}px`

    const signature = JSON.stringify(view)
    if (signature === lastSignature && lastVisible === show) {
      return
    }
    lastSignature = signature
    lastVisible = show

    rowsHost.replaceChildren()
    const fragment = doc.createDocumentFragment()
    for (const row of view.rows) {
      fragment.appendChild(renderRow(row))
    }
    rowsHost.appendChild(fragment)
    pageCue.hidden = !view.clippedBelow
  }

  function renderNow(): void {
    metrics = currentMetrics()
    const rect = contentRect()
    const dpr = devicePixelRatio(win)
    const boxRect = toCssRect(MESSAGE_AREA_RECT, rect, dpr)
    const view = computeView(state, metrics.columns)
    render(view, boxRect)
  }

  // One frame-batched update loop: sync the shared panel's committed lines
  // into the overlay buffer, then re-render (skipped when nothing changed).
  function frame(): void {
    state = syncFromPanel(state, options.panelState())
    renderNow()
    requestFrame(frame)
  }
  function requestFrame(callback: () => void): number {
    if (win !== null && typeof win.requestAnimationFrame === "function") {
      return win.requestAnimationFrame(callback)
    }
    return win !== null && typeof win.setTimeout === "function" ? win.setTimeout(callback, 16) : 0
  }
  requestFrame(frame)

  function applyModal(on: boolean): void {
    modalOpen = on
    // User decision: a top-menu modal hides the WHOLE Korean overlay layer
    // (status/intro included), not just the message area.
    options.overlayLayer.hidden = on
    renderNow()
  }

  function commitEcho(): void {
    const echo = state.inputText !== "" ? state.inputText : state.choiceEcho
    if (echo !== null && echo !== "") {
      const cells: PanelCell[] = [...echo].map((ch) => ({ char: ch, color: state.activeColor, kind: "input" }))
      state = { ...state, lines: [...state.lines, { cells }] }
    }
    state = clearEcho(state)
    renderNow()
  }

  const handle: MessageAreaOverlayHandle = {
    get active(): boolean {
      return visible()
    },
    isPageMode() {
      state = syncFromPanel(state, options.panelState())
      metrics = currentMetrics()
      const view = computeView(state, metrics.columns)
      return view.mode === "page" && view.clippedBelow
    },
    columns() {
      return currentMetrics().columns
    },
    nextPage() {
      // Only page while a paused long answer is actually waiting.
      if (!handle.isPageMode()) {
        return
      }
      state = nextPage(state)
      renderNow()
    },
    applyInput(text) {
      state = applyInput(state, text)
    },
    applyChoice(ch) {
      state = applyChoice(state, ch)
    },
    setCursor(on) {
      state = setCursor(state, on)
    },
    applyPlay(on) {
      state = applyPlay(state, on, options.panelState())
      renderNow()
    },
    applyModal,
    applyCrlf() {
      // A direct message-area CR/LF: fold any lines the engine committed
      // since the last frame (the panel channel may not carry this break).
      state = syncFromPanel(state, options.panelState())
      renderNow()
    },
    applyPromptGlyph() {
      state = applyPromptGlyph(state)
    },
    commitEcho
  }

  return handle
}

// Re-export for callers that want the layout constants without importing two files.
export { MESSAGE_AREA_LINES }