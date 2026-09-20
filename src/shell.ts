// DOM wiring for the static browser shell (Todo 5). This module only talks
// to the DOM and the bridge contract in `./bridge/types.ts` -- it does not
// implement any real engine, persistence, or i18n behavior (those are later
// Todos). It exists to prove the shell + bridge contract hold together.

import { BRIDGE_ABI_VERSION, isBridgeEvent, type BridgeEvent } from "./bridge/types.ts"

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
  const statusOverlay = requireElement<HTMLDivElement>(doc, "#status-overlay")
  const romPicker = requireElement<HTMLInputElement>(doc, "#rom-picker")
  const saveExportButton = requireElement<HTMLButtonElement>(doc, "#save-export")
  const saveImportInput = requireElement<HTMLInputElement>(doc, "#save-import")
  const saveStatus = requireElement<HTMLElement>(doc, "#save-status")

  function appendDialogueLine(text: string): void {
    const line = doc.createElement("p")
    line.textContent = text // textContent only -- never innerHTML for game text.
    dialogueHistory.appendChild(line)
    dialoguePanel.scrollTop = dialoguePanel.scrollHeight
  }

  function setStatusText(text: string): void {
    statusOverlay.textContent = text
  }

  function setSaveStatusText(text: string): void {
    saveStatus.textContent = text
  }

  function applyEvent(event: BridgeEvent): void {
    switch (event.type) {
      case "message":
        appendDialogueLine(event.text)
        return
      case "clear":
        dialogueHistory.replaceChildren()
        return
      case "prompt":
        appendDialogueLine(`[prompt:${event.kind}] ${event.promptId}`)
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
        appendDialogueLine(`[오류] ${event.message}`)
        return
    }
  }

  function dispatch(candidate: unknown): boolean {
    if (!isBridgeEvent(candidate)) {
      console.error("Rejected malformed or unknown bridge event.", candidate)
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
      text: `원본 데이터 선택됨: ${file.name} (${file.size} bytes)`
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
