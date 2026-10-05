import { createIndexedDbZipStore, forgetZip, rememberZip, restoreCachedZip, type ZipStore } from "./engine/zip-cache.ts"
import { createDebugLog, debugEnabledFromUrl, type DebugLog, type DebugLogEntry } from "./debug-log.ts"
import "./shell.css"
import { createInputQueue, type InputQueue } from "./bridge/input-queue.ts"
import { createShell } from "./shell.ts"
import { sharedCoverage, type CoverageSnapshot } from "./i18n/coverage.ts"
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
    /** Todo 42: read-only wasm linear-memory size for the memory smoke e2e. */
    ultimaWasmMemory?: { bytes(): number } | undefined
    /** Todo 38: read-only snapshot of dropped/fallback text counters (hashes and ids only). */
    ultimaI18nCoverage?: { snapshot(): CoverageSnapshot } | undefined
    /** User request 2026-10-05: key-point trace (console output only with ?debug=1). */
    ultimaDebugLog?: DebugLog | undefined
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

// `import.meta.env.DEV` is false in `vite build`, so this whole block (and the
// /__dev-log URL) is removed from the shipped bundle. Under `vite dev` the
// entries are batched to the dev server's file log (see vite.config.ts).
let devLogSink: ((entry: DebugLogEntry) => void) | undefined
if (import.meta.env.DEV) {
  let pending: DebugLogEntry[] = []
  let flushTimer: number | undefined
  devLogSink = (entry) => {
    pending.push(entry)
    if (flushTimer === undefined) {
      flushTimer = window.setTimeout(() => {
        const batch = pending
        pending = []
        flushTimer = undefined
        void fetch(`${import.meta.env.BASE_URL}__dev-log`, { method: "POST", body: JSON.stringify(batch), keepalive: true }).catch(() => undefined)
      }, 150)
    }
  }
}
const debugLog = createDebugLog({
  enabled: debugEnabledFromUrl(window.location.href),
  ...(devLogSink !== undefined ? { sink: devLogSink } : {})
})
window.ultimaDebugLog = debugLog
const bridge = createShell(document, debugLog)
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
window.ultimaI18nCoverage = { snapshot: () => sharedCoverage.snapshot() }
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

// Stage 3 Step 7: eagerly preload the game-screen pixel font so the first
// frame any NeoDunggeunmo-backed overlay (message area, status) draws
// already has the @font-face family loaded. Fire-and-forget: shell
// readiness and engine startup must not wait on the font, and a failed
// load only degrades to the system-font fallback -- the page still boots.
void document.fonts.load("16px NeoDunggeunmo").catch(() => {
  // No action: a missing font is a cosmetic degradation, never a boot error.
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
// User decision 2026-10-05: the player's own zip is remembered in this
// browser after a successful start and restored on the next page load.
const zipStore: ZipStore | null = typeof indexedDB === "undefined" ? null : createIndexedDbZipStore(indexedDB)
const romPickerElement = document.querySelector<HTMLInputElement>("#rom-picker")
romPickerElement?.addEventListener("change", () => {
  const file = romPickerElement.files?.[0]
  if (file !== undefined) startWithZip(file, "picker")
})

document.querySelector<HTMLButtonElement>("#rom-forget")?.addEventListener("click", () => {
  if (zipStore === null) return
  void forgetZip(zipStore).then(
    () => notify("저장된 원본 데이터를 지웠습니다. 다음에는 ultima4.zip을 다시 선택해야 합니다.\n"),
    () => notify("저장된 원본 데이터를 지우지 못했습니다.\n")
  )
})

if (zipStore !== null) {
  void restoreCachedZip(zipStore).then((file) => {
    debugLog.log("zip-cache-restore", { found: file !== null, ...(file !== null ? { bytes: file.size } : {}) })
    if (file === null || engineStartAttempted) return
    notify(`저장된 원본 데이터로 시작합니다: ${file.name} (${file.size} bytes)\n`)
    startWithZip(file, "cache")
  })
}

function notify(text: string): void {
  bridge.dispatch({ abiVersion: bridge.abiVersion, type: "message", text })
}

function startWithZip(file: File, source: "picker" | "cache"): void {
  if (engineStartAttempted) {
    return
  }
  engineStartAttempted = true
  debugLog.log("engine-start", { source, name: file.name, bytes: file.size })
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
        dispatch: bridge.dispatch,
        textPrompt: bridge.textPromptReceiver,
        talkText: bridge.talkTextReceiver,
        introView: bridge.introViewReceiver,
        screen: bridge.screenReceiver
      })
    )
    .then((result) => {
      document.body.setAttribute("data-engine-started", String(result.started))
      debugLog.log("engine-start-result", { source, started: result.started, ...(result.started ? {} : { reason: result.reason }) })
      if (zipStore !== null) {
        // Remember a zip that started; forget a remembered one that did not.
        if (result.started && source === "picker") void rememberZip(zipStore, file).catch(() => undefined)
        if (!result.started && source === "cache") void forgetZip(zipStore).catch(() => undefined)
      }
      if (result.started) {
        bridge.attachSaveHandlers(result.saveHandlers)
        window.ultimaAudio = result.audioBridge
        window.ultimaWasmMemory = { bytes: result.wasmMemoryBytes }
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
}
