// Browser startup sequence (Todo 9, FS/paths corrected by Todo 21.2):
// instantiate the wasm module with `noInitialRun: true`, prepare the virtual
// filesystem (IDBFS-backed `/persist`), write the module assets and the
// user-selected original data ZIP where the real engine actually searches
// for them, validate + inject the ZIP, unlock audio, then call `main`
// exactly once. This module is deliberately stateless and side-effect-free
// beyond what it's told to do -- the "call main only once per page load,
// and a restart means a full page reload rather than calling this twice"
// rule (design contract point 4) is enforced by the *caller* (src/main.ts),
// not here, so this function stays trivially unit-testable.
//
// Order matches the plan's design contract exactly: factory resolve -> FS
// prep -> IDBFS populate -> module/ZIP inject -> audio unlock (best
// effort) -> call main once. A ZIP validation failure means main is never
// called, but the module/FS are still brought up first (so, e.g., a
// missing-files error can still be surfaced through the same bridge
// events the running engine would use).
//
// Todo 21.2 path choices, verified empirically against the real engine
// (see handoff.md's Todo 21.2 record for the exact probe commands/output),
// not guessed from reading the source alone:
//  - u4find_path() (vendor/xu4/src/u4file.cpp) checks the bare filename
//    relative to the process cwd before anything else, and Emscripten's
//    default cwd is "/". Writing render.pak/the game module/the original
//    ZIP at FS root ("/render.pak", "/Ultima-IV.mod", "/ultima4.zip") is
//    therefore the first (and simplest) path every one of them resolves
//    against -- no need to replicate xu4's other resourcePaths.
//  - Settings::init's `__unix__` (but not `__linux__`, which Emscripten's
//    target does not define) branch builds userPath as "$HOME/.xu4/", and
//    every save file and the settings file itself are fopen'd relative to
//    that same userPath. Emscripten's default $HOME is "/home/web_user";
//    setting it to PERSIST_MOUNT makes every one of those files land
//    inside the Todo 10 IDBFS mount without touching the mount itself.
//  - That HOME override must happen in a `preRun` callback, not after
//    `await factory(...)` resolves: libc's getenv() cache is already built
//    by the time the factory's returned promise resolves (confirmed by
//    testing both orderings against the real engine -- the post-resolve
//    write was silently too late), and MODULARIZE reuses the options
//    object passed into the factory as the live `Module`, so mutating
//    `factoryOptions.ENV` from inside a `preRun` entry reaches it in time.

import { BRIDGE_ABI_VERSION, type BridgeEvent } from "../bridge/types.ts"
import {
  createPersistenceCoordinator,
  exportSaveArchive,
  importSaveArchive,
  type PersistenceCoordinator,
  type PersistenceFS
} from "./persistence.ts"
import { validateUltima4Zip, type ZipValidationResult } from "./zip.ts"

/** Bound to the running engine's real FS/paths/coordinator once startEngine succeeds; see src/shell.ts's attachSaveHandlers. */
export interface SaveHandlers {
  export(): Promise<Uint8Array>
  import(archive: Uint8Array): Promise<void>
}

/** Where the Todo 10 IDBFS mount lives, and (via the ENV.HOME override above) where Settings/saves land under it. */
const PERSIST_MOUNT = "/persist"
const USER_DATA_DIR = `${PERSIST_MOUNT}/.xu4`
const PERSISTENCE_PATHS = { saveDir: USER_DATA_DIR, settingsFile: `${USER_DATA_DIR}/xu4rc` }

/** The slice of the Emscripten `FS` API this sequence actually needs. */
export interface EmscriptenFS extends PersistenceFS {
  mkdirTree(path: string): void
  mount(type: unknown, opts: Record<string, unknown>, mountpoint: string): void
}

/** The slice of the Emscripten module object this sequence actually needs. */
export interface EngineModule {
  readonly FS: EmscriptenFS
  readonly IDBFS: unknown
  /** Exported via EXPORTED_RUNTIME_METHODS; see the ENV.HOME note above. */
  readonly ENV: Record<string, string>
  callMain(args?: readonly string[]): void
}

export type EngineModuleFactory = (options: Record<string, unknown>) => Promise<EngineModule>

export interface StartEngineOptions {
  /** The Emscripten module factory (the default export of xu4.mjs). */
  readonly factory: EngineModuleFactory
  /** Extra options merged into the factory call (e.g. `wasmBinary`, `locateFile`). */
  readonly factoryOptions?: Record<string, unknown>
  /** render.pak bytes (Todo 6/build-modules output), written to FS root before main(). */
  readonly renderPak: Blob
  /** The game module (Ultima-IV.mod) bytes, written to FS root before main(). */
  readonly gameModule: Blob
  /** The user-selected original data archive. */
  readonly zipFile: Blob
  /** The shell's bridge dispatch function -- see src/shell.ts. */
  readonly dispatch: (event: BridgeEvent) => boolean
  /**
   * Attempts to unlock/resume a Web Audio context. Injected so unit tests
   * don't need a real AudioContext; defaults to a real one in the browser.
   * Failures here are always non-fatal (autoplay policy, no gesture yet,
   * jsdom/test environments without Web Audio, etc.).
   */
  readonly unlockAudio?: () => Promise<void>
  /** Observes native save/settings writes and flushes IDBFS (Todo 10); defaults to a fresh coordinator. */
  readonly persistenceCoordinator?: PersistenceCoordinator
}

export type StartEngineResult =
  | { readonly started: true; readonly saveHandlers: SaveHandlers }
  | { readonly started: false; readonly reason: "corrupted" | "missing-files" | "idbfs-sync-failed" | "engine-error"; readonly detail: string }

function message(text: string): BridgeEvent {
  // Todo 11: this is a whole, UI-authored notice, not a fragment of the
  // native engine's own message-buffer byte stream (which the dialogue
  // panel otherwise joins across events -- see src/shell.ts's PanelState
  // comment). A trailing newline keeps it from visually running onto
  // whatever the panel renders next.
  return { abiVersion: BRIDGE_ABI_VERSION, type: "message", text: `${text}\n` }
}

function runtimeError(text: string): BridgeEvent {
  return { abiVersion: BRIDGE_ABI_VERSION, type: "runtime-error", message: text, fatal: true }
}

function describeValidationFailure(validation: Extract<ZipValidationResult, { ok: false }>): string {
  if (validation.reason === "corrupted") {
    return `선택한 파일이 손상되었거나 올바른 ZIP이 아닙니다: ${validation.detail}`
  }
  return `원본 데이터에 필요한 파일이 없습니다: ${validation.missing.join(", ")}`
}

async function defaultUnlockAudio(): Promise<void> {
  const AudioContextCtor =
    (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (AudioContextCtor === undefined) {
    return
  }
  const context = new AudioContextCtor()
  if (context.state === "suspended") {
    await context.resume()
  }
}

function syncfsAsync(fs: EmscriptenFS, populate: boolean): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    fs.syncfs(populate, (error) => {
      if (error) {
        rejectPromise(error)
      } else {
        resolvePromise()
      }
    })
  })
}

/**
 * Runs the full browser startup sequence exactly once. See the module
 * doc comment for the required ordering; do not reorder the steps below
 * without updating that comment and docs/ULTIMA_WEB_PLAN.md's design
 * contract point 4 they mirror.
 */
export async function startEngine(options: StartEngineOptions): Promise<StartEngineResult> {
  const unlockAudio = options.unlockAudio ?? defaultUnlockAudio
  const persistence = options.persistenceCoordinator ?? createPersistenceCoordinator()

  // See the module doc comment: this must run as a preRun callback, not
  // after the factory promise resolves, or the engine's getenv("HOME")
  // cache is already built with Emscripten's default. MODULARIZE reuses
  // this exact object as the live `Module` -- it must stay the same
  // reference all the way into options.factory(), not get copied through
  // a `{ ...factoryOptions }` object-literal spread at the call site,
  // or the preRun closure below ends up mutating an object the glue never
  // sees.
  const factoryOptions: Record<string, unknown> = { ...options.factoryOptions, noInitialRun: true }
  const priorPreRun = Array.isArray(factoryOptions["preRun"]) ? (factoryOptions["preRun"] as unknown[]) : []
  factoryOptions["preRun"] = [
    ...priorPreRun,
    () => {
      ;(factoryOptions["ENV"] as Record<string, string>)["HOME"] = PERSIST_MOUNT
    }
  ]

  // callMain() below is fire-and-forget (Asyncify: it returns at the
  // program's actual exit OR its first yield, and there is no way to tell
  // those apart from the return value alone). Without this, a main() that
  // exits/aborts before ever yielding -- e.g. Todo 21.2's original shader
  // compile failure -- would still fall through to the success path below
  // and dispatch "engine started" once it does return.
  let engineExited: { readonly code: number; readonly detail: string } | null = null
  factoryOptions["onExit"] = (code: number) => {
    engineExited = { code, detail: `엔진이 종료되었습니다 (code ${code})` }
  }
  factoryOptions["onAbort"] = (reason: unknown) => {
    engineExited = { code: -1, detail: `엔진이 중단되었습니다: ${String(reason)}` }
  }

  let module: EngineModule
  try {
    module = await options.factory(factoryOptions)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown engine instantiation error"
    options.dispatch(runtimeError(`엔진을 초기화하지 못했습니다: ${detail}`))
    return { started: false, reason: "engine-error", detail }
  }

  module.FS.mkdirTree(PERSIST_MOUNT)
  module.FS.mount(module.IDBFS, {}, PERSIST_MOUNT)

  try {
    await syncfsAsync(module.FS, true)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown IDBFS sync error"
    options.dispatch(runtimeError(`저장된 설정을 불러오지 못했습니다: ${detail}`))
    return { started: false, reason: "idbfs-sync-failed", detail }
  }

  const buffer = await options.zipFile.arrayBuffer()
  const validation = await validateUltima4Zip(buffer)
  if (!validation.ok) {
    options.dispatch(runtimeError(describeValidationFailure(validation)))
    return { started: false, reason: validation.reason, detail: describeValidationFailure(validation) }
  }
  if (validation.shaMismatch) {
    options.dispatch(
      message(
        `경고: 선택한 원본 데이터의 해시가 확인된 배포판과 다릅니다 (sha256=${validation.sha256}). ` +
          "필요한 파일은 모두 있어 계속 진행합니다."
      )
    )
  }

  // FS root, not a sandbox subdirectory: this is where u4find_path/
  // u4find_pathc actually look first (see the module doc comment).
  module.FS.writeFile("/render.pak", new Uint8Array(await options.renderPak.arrayBuffer()))
  module.FS.writeFile("/Ultima-IV.mod", new Uint8Array(await options.gameModule.arrayBuffer()))
  module.FS.writeFile("/ultima4.zip", new Uint8Array(buffer))

  // Must be attached before callMain(): main() runs the engine's full
  // blocking event loop under Asyncify, so this is the last point at
  // which JS code runs before any native save/settings write can happen.
  persistence.attach(module.FS, PERSISTENCE_PATHS, options.dispatch)

  try {
    await unlockAudio()
  } catch {
    // Non-fatal: no user gesture yet, autoplay policy, or no Web Audio
    // support in this environment. Audio itself is Todo 16's scope.
  }

  module.callMain([])
  if (engineExited) {
    const detail: string = (engineExited as { readonly code: number; readonly detail: string }).detail
    options.dispatch(runtimeError(detail))
    return { started: false, reason: "engine-error", detail }
  }
  options.dispatch(message("엔진이 시작되었습니다."))
  const saveHandlers: SaveHandlers = {
    export: () => exportSaveArchive(module.FS, PERSISTENCE_PATHS, persistence),
    import: (archive) => importSaveArchive(module.FS, PERSISTENCE_PATHS, persistence, archive)
  }
  return { started: true, saveHandlers }
}
