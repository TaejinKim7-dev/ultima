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
import { buildAliasTable, resolveInput, type AliasSourceEntry, type AliasTable } from "./i18n/korean-aliases.ts"
// Real Korean alias data (Todo 13), never original game data -- just this
// project's own translation strings. Vite/TS both support importing JSON
// modules directly; see tsconfig.json's `resolveJsonModule`.
import koreanAliasesSchema from "../locales/ko/aliases.json" with { type: "json" }

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
  const statusOverlay = requireElement<HTMLDivElement>(doc, "#status-overlay")
  const romPicker = requireElement<HTMLInputElement>(doc, "#rom-picker")
  const saveExportButton = requireElement<HTMLButtonElement>(doc, "#save-export")
  const saveImportInput = requireElement<HTMLInputElement>(doc, "#save-import")
  const saveStatus = requireElement<HTMLElement>(doc, "#save-status")
  const koreanKeywordInput = requireElement<HTMLInputElement>(doc, "#korean-keyword-input")

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

  // Todo 13: Korean NPC-keyword input (see index.html's comment on this
  // control and src/i18n/korean-aliases.ts's module doc comment for why
  // this has to synthesize real keystrokes rather than somehow "teaching"
  // the native engine to understand Korean directly -- it structurally
  // cannot: ReadStringController::keyPressed only ever accepts key codes
  // below 128).
  //
  // This box is hardcoded to the "text" (NPC free-answer) prompt kind: no
  // bridge event today carries which prompt kind is currently open (the
  // real engine doesn't yet emit `prompt` events at all -- see Todo 11's
  // known-limitations note), so there is no live signal this shell could
  // use to gate the box per prompt kind. It is a dedicated "talk to an NPC
  // in Korean" control, not a general-purpose Korean input method; using
  // it while no NPC conversation is open synthesizes the resolved keyword
  // as top-level keystrokes, exactly as if a player had typed English at
  // the wrong moment (not a new category of risk this box introduces).
  const koreanAliasTable: AliasTable = buildAliasTable(
    (koreanAliasesSchema as { entries: Record<string, AliasSourceEntry> }).entries
  )
  const gameWindow = doc.defaultView ?? window

  function charToKeyCode(ch: string): number {
    if (ch === " ") {
      return 32
    }
    return ch.toUpperCase().charCodeAt(0)
  }

  // Synthesizes the same 'keydown'/'keyup' pairs a physical keyboard
  // produces for each ASCII character of `text`, followed by Enter --
  // the only path a real player's keystrokes reach the engine (GLFW's
  // Emscripten port listens on `window`; see the guard below). `keyCode`
  // is set with `Object.defineProperty` rather than the constructor's
  // init dict: `KeyboardEvent`'s `keyCode`/`which` are legacy
  // getter-backed properties that some browsers ignore in the
  // constructor dict, but a fresh own property on the instance always
  // shadows the prototype getter. Marked `__ultimaSynthetic` so the guard
  // below never re-intercepts its own output.
  function synthesizeKeystrokes(text: string): void {
    const keyCodes = [...text].map(charToKeyCode)
    keyCodes.push(13) // Enter -- submits the native interest-prompt buffer we just filled
    for (const keyCode of keyCodes) {
      for (const type of ["keydown", "keyup"] as const) {
        const event = new KeyboardEvent(type, { bubbles: true, cancelable: true })
        Object.defineProperty(event, "keyCode", { value: keyCode })
        Object.defineProperty(event, "which", { value: keyCode })
        ;(event as unknown as { __ultimaSynthetic?: boolean }).__ultimaSynthetic = true
        gameWindow.dispatchEvent(event)
      }
    }
  }

  function submitKoreanKeyword(): void {
    const raw = koreanKeywordInput.value
    koreanKeywordInput.value = ""
    const result = resolveInput("text", raw, koreanAliasTable)
    if (result.ok) {
      synthesizeKeystrokes(result.text)
      return
    }
    // A UI-authored rejection notice, never a fragment of the engine's own
    // message stream -- see appendWholeLine's doc comment on why this
    // dispatches a "message" event directly instead.
    dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "message", text: `[한글 입력 거부] ${result.message}\n` })
  }

  // GLFW's Emscripten port listens for 'keydown' on `window` at the
  // CAPTURE phase regardless of which element has DOM focus (verified in
  // emsdk's library_glfw.js: `window.addEventListener('keydown',
  // GLFW.onKeydown, true)`), so simply typing into this control would ALSO
  // feed every keystroke straight into the running game as if it were a
  // command key -- including the Enter that submits this control, which
  // native `runTalkDialogue()` treats as an empty answer ("Bye.", ending
  // the conversation). This guard is registered here, at shell-creation
  // time -- always before the engine ever boots, since GLFW's own listener
  // is only registered once `startEngine()`'s `callMain()` reaches
  // `glfwCreateWindow()` -- so for same-phase/same-target listeners it
  // always runs first and can call `stopImmediatePropagation()` to keep
  // the real event from ever reaching GLFW's listener.
  gameWindow.addEventListener(
    "keydown",
    (event: Event) => {
      const keyboardEvent = event as KeyboardEvent
      if ((keyboardEvent as unknown as { __ultimaSynthetic?: boolean }).__ultimaSynthetic === true) {
        return // our own synthesized keystrokes must reach the real game
      }
      if (doc.activeElement !== koreanKeywordInput) {
        return
      }
      keyboardEvent.stopImmediatePropagation()
      if (keyboardEvent.key === "Enter" && !keyboardEvent.isComposing) {
        submitKoreanKeyword()
      }
    },
    true
  )

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
