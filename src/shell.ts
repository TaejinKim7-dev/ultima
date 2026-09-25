// DOM wiring for the static browser shell (Todo 5). This module only talks
// to the DOM and the bridge contract in `./bridge/types.ts` -- it does not
// implement any real engine, persistence, or i18n behavior (those are later
// Todos). It exists to prove the shell + bridge contract hold together.

import { BRIDGE_ABI_VERSION, isBridgeEvent, type BridgeEvent } from "./bridge/types.ts"
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

/**
 * The intended integration seam for the future (Todo 6+) WASM engine: it
 * calls `dispatch` with events matching the C ABI version 1 contract. This
 * is not a cheat/state-control API -- it is the documented bridge entry
 * point itself, exposed so native glue code has something to call into.
 */
export interface UltimaBridgeApi {
  readonly abiVersion: typeof BRIDGE_ABI_VERSION
  dispatch(candidate: unknown): boolean
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
  const statusOverlay = requireElement<HTMLDivElement>(doc, "#status-overlay")
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

  function setStatusText(text: string): void {
    statusOverlay.textContent = text
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
        return
      case "prompt":
        if (panelState.paused) {
          panelState = resumePanel(panelState)
        }
        showPromptMarker(event.kind, event.promptId)
        return
      case "view":
        setStatusText(event.text)
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

  // Save export: a local Blob download only, never uploaded. The exported
  // payload is a placeholder until the persistence engine lands in Todo 10
  // -- this Todo only wires the download affordance and the save-state
  // bridge event it produces.
  saveExportButton.addEventListener("click", () => {
    const placeholder = {
      note: "placeholder export -- no persistence engine yet (Todo 10)",
      exportedAt: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(placeholder, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = doc.createElement("a")
    anchor.href = url
    anchor.download = "ultima4-save-export.json"
    doc.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status: "saved" })
  })

  // Save import: a local File API read only, never uploaded anywhere.
  saveImportInput.addEventListener("change", () => {
    const file = saveImportInput.files?.[0]
    if (file === undefined) {
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

  return { abiVersion: BRIDGE_ABI_VERSION, dispatch }
}
