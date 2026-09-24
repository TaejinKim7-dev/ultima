import "./shell.css"
import { createInputQueue, type InputQueue } from "./bridge/input-queue.ts"
import { createShell } from "./shell.ts"
import { startEngine, type EngineModuleFactory } from "./engine/startup.ts"

declare global {
  interface Window {
    ultimaInput?: InputQueue
  }
}

class MissingApplicationRootError extends Error {
  constructor() {
    super("The Vite application root is missing.")
    this.name = "MissingApplicationRootError"
  }
}

const applicationRoot = document.querySelector("#app")

if (applicationRoot === null) {
  throw new MissingApplicationRootError()
}

const bridge = createShell(document)
window.ultimaBridge = bridge

// Step 8 browser-safe input queue: DOM callbacks only enqueue immutable
// events; the engine (Step 9+) drains them from its input loop. These
// listeners never dispatch to game controllers and never preventDefault.
const inputQueue = createInputQueue()
window.ultimaInput = inputQueue
document.addEventListener("keydown", (event: KeyboardEvent) => {
  inputQueue.enqueueKeyFromDom({
    key: event.key,
    keyCode: event.keyCode,
    isComposing: event.isComposing
  })
})
document.addEventListener("compositionstart", () => {
  inputQueue.setComposing(true)
})
document.addEventListener("compositionend", () => {
  inputQueue.setComposing(false)
})

// Signal to QA/e2e tooling -- and to the future WASM engine's own startup
// sequence -- that the shell's DOM wiring and bridge object are ready.
document.body.setAttribute("data-bridge-ready", "true")
document.body.setAttribute("data-bridge-abi-version", String(bridge.abiVersion))

// Step 9: browser startup sequence, triggered by the user's own ZIP
// selection (never auto-run on page load -- a fresh page load always
// waits for a fresh selection; see src/engine/startup.ts's doc comment
// and design contract point 4: "재시작은... page reload로 한다").
// Guarded so this can only ever run once per page life; the shell's own
// romPicker listener in shell.ts still shows its lightweight
// name/size acknowledgement message independently of this.
let engineStartAttempted = false
const romPickerElement = document.querySelector<HTMLInputElement>("#rom-picker")
romPickerElement?.addEventListener("change", () => {
  const file = romPickerElement.files?.[0]
  if (file === undefined || engineStartAttempted) {
    return
  }
  engineStartAttempted = true
  document.body.setAttribute("data-engine-starting", "true")

  const engineUrl = `${import.meta.env.BASE_URL}engine/xu4.mjs`
  void import(/* @vite-ignore */ engineUrl)
    .then((module: { default: EngineModuleFactory }) =>
      startEngine({
        factory: module.default,
        factoryOptions: {
          locateFile: (path: string) => `${import.meta.env.BASE_URL}engine/${path}`
        },
        zipFile: file,
        dispatch: bridge.dispatch
      })
    )
    .then((result) => {
      document.body.setAttribute("data-engine-started", String(result.started))
      if (!result.started) {
        document.body.setAttribute("data-engine-start-reason", result.reason)
      }
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "unknown engine load error"
      console.error("Failed to load the WASM engine module.", error)
      document.body.setAttribute("data-engine-started", "false")
      document.body.setAttribute("data-engine-start-reason", "module-load-failed")
      bridge.dispatch({
        abiVersion: bridge.abiVersion,
        type: "runtime-error",
        message: `엔진 모듈을 불러오지 못했습니다: ${detail}`,
        fatal: true
      })
    })
})
