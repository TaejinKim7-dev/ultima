// DOM wiring for the static browser shell (Todo 5). This module only talks
// to the DOM and the bridge contract in `./bridge/types.ts` -- it does not
// implement any real engine, persistence, or i18n behavior (those are later
// Todos). It exists to prove the shell + bridge contract hold together.

import { BRIDGE_ABI_VERSION, isBridgeEvent, type BridgeEvent, type OverlayRow } from "./bridge/types.ts"
import {
  applyToken,
  applyTokens,
  beginPause,
  createPanelState,
  resumePanel,
  tokenizeMessage,
  toRuns,
  type PanelState
} from "./dialogue/message-tokens.ts"
import {
  DEFAULT_VIEW_RECTS,
  OverlayRegistry,
  computeContentRect,
  computeOverlayCellPx,
  computeOverlayFontPx,
  computeScale,
  toCssRect,
  type OverlayEntry,
  type OverlayRole
} from "./overlay/overlay-layout.ts"

/**
 * The intended integration seam for the future (Todo 6+) WASM engine: it
 * calls `dispatch` with events matching the C ABI version 1 contract. This
 * is not a cheat/state-control API -- it is the documented bridge entry
 * point itself, exposed so native glue code has something to call into.
 */
/** Real save export/import, bound to the running engine's FS once it starts -- see src/engine/startup.ts's SaveHandlers. */
export interface ShellSaveHandlers {
  export(): Promise<Uint8Array>
  import(archive: Uint8Array): Promise<void>
}

export interface UltimaBridgeApi {
  readonly abiVersion: typeof BRIDGE_ABI_VERSION
  dispatch(candidate: unknown): boolean
  /**
   * Switches the save-export/import buttons from Todo 5's placeholder
   * (a JSON stub, wired before any engine exists) to the real archive
   * format once Todo 21's engine has actually started. Call at most once
   * per engine start.
   */
  attachSaveHandlers(handlers: ShellSaveHandlers): void
}

declare global {
  interface Window {
    ultimaBridge?: UltimaBridgeApi
  }
}

export class MissingShellElementError extends Error {
  constructor(selector: string) {
    super(`The web shell is missing a required element: ${selector}`)
    this.name = "MissingShellElementError"
  }
}

function requireElement<T extends Element>(doc: Document, selector: string): T {
  const element = doc.querySelector(selector)
  if (element === null) {
    throw new MissingShellElementError(selector)
  }
  return element as T
}

/** Builds and wires the static shell against `doc`, returning the bridge API. */
export function createShell(doc: Document): UltimaBridgeApi {
  const dialogueHistory = requireElement<HTMLDivElement>(doc, "#dialogue-history")
  const dialoguePanel = requireElement<HTMLElement>(doc, "#dialogue-panel")
  const promptMarker = requireElement<HTMLElement>(doc, "#dialogue-prompt-marker")
  const gameViewport = requireElement<HTMLElement>(doc, "#game-viewport")
  const gameCanvas = requireElement<HTMLCanvasElement>(doc, "#game-canvas")
  const overlayLayer = requireElement<HTMLDivElement>(doc, "#overlay-layer")
  const romPicker = requireElement<HTMLInputElement>(doc, "#rom-picker")
  const saveExportButton = requireElement<HTMLButtonElement>(doc, "#save-export")
  const saveImportInput = requireElement<HTMLInputElement>(doc, "#save-import")
  const saveStatus = requireElement<HTMLElement>(doc, "#save-status")

  // Todo 11: the dialogue panel's full render state. It persists across
  // `dispatch` calls (not reset per event) because native message output
  // arrives as fragments of a shared current line, not whole lines -- e.g.
  // dungeon.cpp's `screenMessage("...\nWho drinks? ")` is later followed by
  // a *separate* `screenMessage("%c\n", key)` call that continues the same
  // line. See `src/dialogue/message-tokens.ts`'s module doc comment.
  let panelState: PanelState = createPanelState()

  // Renders `panelState` into `#dialogue-history` using `createElement` +
  // `textContent` only -- see `tests/unit/message-tokens.test.ts`'s
  // innerHTML safety guard, which greps this file's source for the banned
  // APIs.
  //
  // KNOWN LIMITATION (deferred, not fixed here): this rebuilds the *whole*
  // history on every fragment via `replaceChildren`, so a very long
  // session is O(n^2) in total history lines, and `#dialogue-panel`'s
  // `aria-live="polite"` re-announces the entire history to screen readers
  // on every call instead of just what changed. Acceptable for this
  // Todo's scope (a talk/intro-length history); revisit as an incremental
  // append-only render (append newly-committed lines, replace only the
  // last `<p>`) under Todo 18's memory-growth hardening if real sessions
  // turn out to need it.
  function renderLine(cells: PanelState["currentLine"]): HTMLParagraphElement {
    const line = doc.createElement("p")
    line.className = "dialogue-line"
    for (const run of toRuns({ cells })) {
      const span = doc.createElement("span")
      span.textContent = run.text // textContent only -- never innerHTML for game text.
      if (run.color !== "default") {
        span.classList.add(`dialogue-color-${run.color}`)
      }
      line.appendChild(span)
    }
    return line
  }

  function renderPanel(): void {
    const fragment = doc.createDocumentFragment()
    for (const historyLine of panelState.historyLines) {
      fragment.appendChild(renderLine(historyLine.cells))
    }
    fragment.appendChild(renderLine(panelState.currentLine))
    dialogueHistory.replaceChildren(fragment)
    dialoguePanel.scrollTop = dialoguePanel.scrollHeight
    dialoguePanel.dataset["awaitingPrompt"] = String(panelState.awaitingPrompt)
    dialoguePanel.dataset["paused"] = String(panelState.paused)
  }

  // Shown/focused while a `prompt` bridge event is outstanding (Todo 11's
  // "prompt focus" requirement); removed on the next `message`/`clear`.
  // Focusing this element never competes with real key delivery -- the
  // GLFW input port listens on `window` at the capture phase regardless of
  // which element has DOM focus (see index.html's comment on this marker).
  function showPromptMarker(kind: string, promptId: string): void {
    promptMarker.hidden = false
    promptMarker.setAttribute("data-prompt-kind", kind)
    promptMarker.setAttribute("data-prompt-id", promptId)
    promptMarker.scrollIntoView({ block: "nearest" })
    promptMarker.focus()
  }

  function hidePromptMarker(): void {
    if (promptMarker.hidden) {
      return
    }
    promptMarker.hidden = true
    promptMarker.removeAttribute("data-prompt-kind")
    promptMarker.removeAttribute("data-prompt-id")
  }

  // Todo 12: status/menu/short in-game text as DOM overlays. The registry
  // is the pure source of truth (src/overlay/overlay-layout.ts); this
  // module's only job is turning it into real DOM elements
  // (createElement/textContent only, per this file's own innerHTML ban)
  // positioned over the canvas's actual displayed box.
  const overlayRegistry = new OverlayRegistry()
  const overlayElements = new Map<OverlayRole, HTMLElement>()

  function ensureOverlayElement(role: OverlayRole): HTMLElement {
    const existing = overlayElements.get(role)
    if (existing !== undefined) {
      return existing
    }
    const element = doc.createElement("div")
    element.className = "overlay-role"
    element.dataset["role"] = role
    overlayLayer.appendChild(element)
    overlayElements.set(role, element)
    return element
  }

  function removeOverlayElement(role: OverlayRole): void {
    const element = overlayElements.get(role)
    if (element === undefined) {
      return
    }
    element.remove()
    overlayElements.delete(role)
  }

  // Structured rows (label + optional value) render as a CSS grid instead
  // of native fixed-space/monospace text -- see src/shell.css's
  // `.overlay-rows` comment for why. Falls back to plain, newline-split
  // text (no rows given) for any role.
  function renderOverlayContent(element: HTMLElement, entry: OverlayEntry): void {
    element.replaceChildren()
    const rows: readonly OverlayRow[] | undefined = entry.rows
    if (rows !== undefined && rows.length > 0) {
      const grid = doc.createElement("div")
      grid.className = "overlay-rows"
      rows.forEach((row, index) => {
        const label = doc.createElement("span")
        label.className = "overlay-row-label"
        label.textContent = row.label // textContent only -- never innerHTML for game text.
        const value = doc.createElement("span")
        value.className = "overlay-row-value"
        value.textContent = row.value ?? ""
        if (entry.selectedIndex === index) {
          label.classList.add("selected")
          value.classList.add("selected")
        }
        grid.appendChild(label)
        grid.appendChild(value)
      })
      element.appendChild(grid)
      return
    }
    for (const line of (entry.text ?? "").split("\n")) {
      const p = doc.createElement("p")
      p.className = "overlay-line"
      p.textContent = line
      element.appendChild(p)
    }
  }

  // Converts the canvas's actual displayed box into the coordinate space
  // overlay elements are positioned in (relative to #game-viewport's own
  // padding box -- see overlay-layout.ts's computeContentRect doc comment
  // for exactly why this isn't simply page-absolute coordinates).
  function currentContentRect() {
    return computeContentRect(gameCanvas.getBoundingClientRect(), gameViewport)
  }

  function layoutOverlayElement(element: HTMLElement, entry: OverlayEntry): void {
    const content = currentContentRect()
    const dpr = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
    const cssRect = toCssRect(entry.rect, content, dpr)
    const { scaleY } = computeScale(content)
    element.style.left = `${cssRect.left}px`
    element.style.top = `${cssRect.top}px`
    element.style.width = `${cssRect.width}px`
    element.style.height = `${cssRect.height}px`
    element.style.fontSize = `${computeOverlayFontPx(scaleY)}px`
    // Todo 12 advisor-review fix: every rendered row (see src/shell.css's
    // `.overlay-rows`/`.overlay-line`, both keyed off this custom property)
    // is exactly one native TextView row tall -- see
    // overlay-layout.ts's computeOverlayCellPx doc comment for why this is
    // what actually guarantees N rows fit an N-row box (an 8-row status
    // display previously overflowed its box; only 2-3 row test fixtures
    // existed at the time, which happened to fit by accident).
    element.style.setProperty("--overlay-cell-px", `${computeOverlayCellPx(scaleY)}px`)
  }

  // Repositions every currently-registered overlay -- called after any new
  // registration, and on canvas resize (the canvas's CSS box, hence the
  // scale factor, changes with the viewport/window size).
  function layoutAllOverlays(): void {
    for (const { role, entry } of overlayRegistry.list()) {
      const element = overlayElements.get(role)
      if (element !== undefined) {
        layoutOverlayElement(element, entry)
      }
    }
  }

  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => layoutAllOverlays()).observe(gameViewport)
  }
  if (typeof window !== "undefined") {
    window.addEventListener("resize", () => layoutAllOverlays())
  }

  function applyViewEvent(event: Extract<BridgeEvent, { type: "view" }>): void {
    const hasContent = event.text !== "" || (event.rows !== undefined && event.rows.length > 0)
    if (!hasContent) {
      overlayRegistry.clear(event.region)
      removeOverlayElement(event.region)
      return
    }
    const entry: OverlayEntry = {
      rect: DEFAULT_VIEW_RECTS[event.region],
      text: event.text,
      ...(event.rows !== undefined ? { rows: event.rows } : {}),
      ...(event.selectedIndex !== undefined ? { selectedIndex: event.selectedIndex } : {})
    }
    // "menu" and "textview" are mutually exclusive (their default rects
    // genuinely overlap -- see overlay-layout.ts's doc comment): registering
    // one may silently evict the other from the registry, and the evicted
    // role's DOM element must be removed too, or a stale, now-unregistered
    // overlay would keep rendering on screen.
    const evictedRole = overlayRegistry.register(event.region, entry)
    if (evictedRole !== null) {
      removeOverlayElement(evictedRole)
    }
    const element = ensureOverlayElement(event.region)
    renderOverlayContent(element, entry)
    layoutOverlayElement(element, entry)
  }

  // A full stage transition (native: intro screen change, or any hard
  // reset) -- removes every overlay role at once, not just the dialogue
  // panel's own history/current-line state.
  function clearAllOverlays(): void {
    overlayRegistry.resetStage()
    for (const role of [...overlayElements.keys()]) {
      removeOverlayElement(role)
    }
  }

  function setSaveStatusText(text: string): void {
    saveStatus.textContent = text
  }

  // For whole, UI-authored notices (e.g. a runtime-error's "[오류] ..."
  // prefix) that are never a fragment of the engine's own message stream:
  // breaks to a fresh line first if one is already in progress, appends
  // the text, then always ends on a fresh line so nothing else runs onto
  // it afterward.
  function appendWholeLine(text: string): void {
    if (panelState.currentLine.length > 0) {
      panelState = applyToken(panelState, { type: "newline" })
    }
    panelState = applyTokens(panelState, tokenizeMessage(text))
    panelState = applyToken(panelState, { type: "newline" })
  }

  function applyEvent(event: BridgeEvent): void {
    switch (event.type) {
      case "message": {
        hidePromptMarker()
        // A new message means the engine progressed past any outstanding
        // Hawkwind-style wait -- there is no separate "any key" bridge
        // event today, so the next real content is what actually clears a
        // pause (see message-tokens.ts's `resumePanel` doc comment).
        if (panelState.paused) {
          panelState = resumePanel(panelState)
        }
        panelState = applyTokens(panelState, tokenizeMessage(event.text))
        if (event.awaitKey === true) {
          panelState = beginPause(panelState)
        }
        renderPanel()
        return
      }
      case "clear":
        hidePromptMarker()
        panelState = createPanelState()
        renderPanel()
        clearAllOverlays()
        return
      case "prompt":
        if (panelState.paused) {
          panelState = resumePanel(panelState)
        }
        showPromptMarker(event.kind, event.promptId)
        return
      case "view":
        applyViewEvent(event)
        return
      case "save-state":
        if (event.status === "saving") {
          setSaveStatusText("저장 중...")
        } else if (event.status === "saved") {
          setSaveStatusText("저장 완료")
        } else {
          setSaveStatusText(`저장 실패: ${event.message ?? "알 수 없는 오류"}`)
        }
        return
      case "runtime-error":
        hidePromptMarker()
        appendWholeLine(`[오류] ${event.message}`)
        renderPanel()
        return
    }
  }

  function dispatch(candidate: unknown): boolean {
    if (!isBridgeEvent(candidate)) {
      // Never log the candidate itself: a malformed *translated* game
      // string is exactly the kind of value that must never reach the
      // console verbatim (see Todo 11's "Must not... dump complete text to
      // console").
      const type =
        typeof candidate === "object" && candidate !== null && "type" in candidate
          ? String((candidate as { type: unknown }).type)
          : typeof candidate
      console.error(`Rejected malformed or unknown bridge event (type: ${type}).`)
      return false
    }
    applyEvent(candidate)
    return true
  }

  // The user selects their own original ultima4.zip purely through the File
  // API. This handler never uploads the file anywhere -- it only reads the
  // File handle's name/size for a shell acknowledgement message. Actual ZIP
  // content validation is Todo 9.
  romPicker.addEventListener("change", () => {
    const file = romPicker.files?.[0]
    if (file === undefined) {
      return
    }
    dispatch({
      abiVersion: BRIDGE_ABI_VERSION,
      type: "message",
      // Trailing newline: this is a whole UI-authored notice, not a
      // fragment of the engine's own message stream (see PanelState's
      // fragment-joining comment above) -- without it, this line would
      // run onto whatever the panel renders next.
      text: `원본 데이터 선택됨: ${file.name} (${file.size} bytes)\n`
    })
  })

  let realSaveHandlers: ShellSaveHandlers | null = null

  // Save export: a local Blob download only, never uploaded. Before the
  // engine has started (or if it fails to), there is nothing real to
  // export yet, so this stays Todo 5's placeholder JSON; attachSaveHandlers
  // switches it to the real archive once Todo 21's engine is running.
  saveExportButton.addEventListener("click", () => {
    if (realSaveHandlers) {
      dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saving" })
      void realSaveHandlers
        .export()
        .then((archive) => {
          downloadBlob(doc, new Blob([archive], { type: "application/octet-stream" }), "ultima4-save.dat")
          dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saved" })
        })
        .catch((error: unknown) => {
          dispatch({
            abiVersion: BRIDGE_ABI_VERSION,
            type: "save-state",
            status: "error",
            message: error instanceof Error ? error.message : "세이브를 내보내는 중 오류가 발생했습니다."
          })
        })
      return
    }
    const placeholder = {
      note: "placeholder export -- engine not started yet",
      exportedAt: new Date().toISOString()
    }
    downloadBlob(
      doc,
      new Blob([JSON.stringify(placeholder, null, 2)], { type: "application/json" }),
      "ultima4-save-export.json"
    )
    dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saved" })
  })

  // Save import: a local File API read only, never uploaded anywhere.
  saveImportInput.addEventListener("change", () => {
    const file = saveImportInput.files?.[0]
    if (file === undefined) {
      return
    }
    if (realSaveHandlers) {
      // importSaveArchive reports its own "saving"/"saved"/"error"
      // save-state events through the same persistence coordinator that
      // real native writes go through -- no need to dispatch here too.
      void file.arrayBuffer().then((buffer) => realSaveHandlers!.import(new Uint8Array(buffer)))
      return
    }
    dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saving" })
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const contents = typeof reader.result === "string" ? reader.result : ""
      try {
        JSON.parse(contents)
        dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saved" })
      } catch {
        dispatch({
          abiVersion: BRIDGE_ABI_VERSION,
          type: "save-state",
          status: "error",
          message: "가져온 세이브 파일을 해석할 수 없습니다."
        })
      }
    })
    reader.addEventListener("error", () => {
      dispatch({
        abiVersion: BRIDGE_ABI_VERSION,
        type: "save-state",
        status: "error",
        message: "세이브 파일을 읽는 중 오류가 발생했습니다."
      })
    })
    reader.readAsText(file)
  })

  return {
    abiVersion: BRIDGE_ABI_VERSION,
    dispatch,
    attachSaveHandlers(handlers) {
      realSaveHandlers = handlers
    }
  }
}

function downloadBlob(doc: Document, blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = doc.createElement("a")
  anchor.href = url
  anchor.download = filename
  doc.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
