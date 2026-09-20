import "./shell.css"
import { createShell } from "./shell.ts"

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

// Signal to QA/e2e tooling -- and to the future WASM engine's own startup
// sequence -- that the shell's DOM wiring and bridge object are ready.
document.body.setAttribute("data-bridge-ready", "true")
document.body.setAttribute("data-bridge-abi-version", String(bridge.abiVersion))
