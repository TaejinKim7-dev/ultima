import "./shell.css"
import { createInputQueue, type InputQueue } from "./bridge/input-queue.ts"
import { createShell } from "./shell.ts"

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
