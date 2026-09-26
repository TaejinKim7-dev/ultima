import "./shell.css"
import { createInputQueue, type InputQueue } from "./bridge/input-queue.ts"
import { createShell } from "./shell.ts"
import type { AudioBridge } from "./engine/audio.ts"
import { startEngine, type EngineModuleFactory } from "./engine/startup.ts"
import {
  resolveDisplayText,
  translationPlaceholdersMatch
} from "./i18n/localization.ts"

/** Todo 14: localization runtime boundary observability hook (mirrors
 *  `window.ultimaAudio`). Read-only display lookup -- never consulted by
 *  any engine decision logic; command keys always fall back to ASCII. */
export interface UltimaI18nApi {
  resolve(id: string, fallback: string): string
  checkPlaceholders(id: string): boolean
}

declare global {
  interface Window {
    ultimaInput?: InputQueue
    /** Todo 16: e2e/manual-QA observability hook -- never consulted by any
     *  engine decision logic. See src/engine/audio.ts's AudioBridge for the
     *  full surface (stats(), suspend(), ...). */
    ultimaAudio?: AudioBridge | undefined
    /** Todo 14: localization runtime boundary for e2e/manual QA only. */
    ultimaI18n?: UltimaI18nApi | undefined
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

// Todo 14: expose the static localization table for e2e/manual QA only.
// Display text resolves to Korean when ready, English fallback otherwise;
// command-key IDs always return the ASCII fallback (see
// src/i18n/localization.ts). Available immediately -- not gated on engine
// start, like the other ultima* QA hooks.
window.ultimaI18n = {
  resolve: (id: string, fallback: string) => resolveDisplayText(id, fallback),
  checkPlaceholders: (id: string) => translationPlaceholdersMatch(id)
}

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

  const engineBaseUrl = `${import.meta.env.BASE_URL}engine/`
  const engineUrl = `${engineBaseUrl}xu4.mjs`
  const fetchModuleAsset = (name: string) =>
    fetch(`${engineBaseUrl}modules/${name}`).then((r) => {
      // fetch() only rejects on a network failure, never on a 4xx/5xx
      // status -- without this check a missing/renamed module asset
      // (Todo 21's own "missing module file" failure scenario) would
      // silently write a 404 error page's body into the wasm FS as if it
      // were real module data, instead of failing loudly.
      if (!r.ok) {
        throw new Error(`${name}: HTTP ${r.status}`)
      }
      return r.blob()
    })
  void Promise.all([
    import(/* @vite-ignore */ engineUrl) as Promise<{ default: EngineModuleFactory }>,
    fetchModuleAsset("render.pak"),
    fetchModuleAsset("Ultima-IV.mod")
  ])
    .then(([module, renderPak, gameModule]) =>
      startEngine({
        factory: module.default,
        factoryOptions: {
          locateFile: (path: string) => `${engineBaseUrl}${path}`,
          // Todo 21.3: Browser.getCanvas() (the GLFW/WebGL2 port's canvas
          // lookup) just returns Module['canvas'] -- without this, main()
          // crashes reading properties of undefined the moment screenInit
          // tries to bind a GL context.
          canvas: document.querySelector("#game-canvas")
        },
        renderPak,
        gameModule,
        zipFile: file,
        dispatch: bridge.dispatch
      })
    )
    .then((result) => {
      document.body.setAttribute("data-engine-started", String(result.started))
      if (result.started) {
        bridge.attachSaveHandlers(result.saveHandlers)
        window.ultimaAudio = result.audioBridge
        document.body.setAttribute("data-audio-bridge-ready", String(result.audioBridge !== undefined))
      } else {
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
