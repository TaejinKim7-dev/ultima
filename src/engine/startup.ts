// Browser startup sequence (Todo 9): instantiate the wasm module with
// `noInitialRun: true`, prepare the virtual filesystem (MEMFS `/assets` +
// `/data`, IDBFS-backed `/persist/profile`), validate + inject the
// user-selected original data ZIP, unlock audio, then call `main` exactly
// once. This module is deliberately stateless and side-effect-free beyond
// what it's told to do -- the "call main only once per page load, and a
// restart means a full page reload rather than calling this twice" rule
// (design contract point 4) is enforced by the *caller* (src/main.ts),
// not here, so this function stays trivially unit-testable.
//
// Order matches the plan's design contract exactly: factory resolve -> FS
// prep -> IDBFS populate -> ZIP validate/inject -> audio unlock (best
// effort) -> call main once. A ZIP validation failure means main is never
// called, but the module/FS are still brought up first (so, e.g., a
// missing-files error can still be surfaced through the same bridge
// events the running engine would use).

import { BRIDGE_ABI_VERSION, type BridgeEvent } from "../bridge/types.ts"
import { validateUltima4Zip, type ZipValidationResult } from "./zip.ts"

/** The slice of the Emscripten `FS` API this sequence actually needs. */
export interface EmscriptenFS {
  mkdirTree(path: string): void
  mount(type: unknown, opts: Record<string, unknown>, mountpoint: string): void
  writeFile(path: string, data: Uint8Array): void
  syncfs(populate: boolean, callback: (error: Error | null) => void): void
}

/** The slice of the Emscripten module object this sequence actually needs. */
export interface EngineModule {
  readonly FS: EmscriptenFS
  readonly IDBFS: unknown
  callMain(args?: readonly string[]): void
}

export type EngineModuleFactory = (options: Record<string, unknown>) => Promise<EngineModule>

export interface StartEngineOptions {
  /** The Emscripten module factory (the default export of xu4.mjs). */
  readonly factory: EngineModuleFactory
  /** Extra options merged into the factory call (e.g. `wasmBinary`, `locateFile`). */
  readonly factoryOptions?: Record<string, unknown>
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
}

export type StartEngineResult =
  | { readonly started: true }
  | { readonly started: false; readonly reason: "corrupted" | "missing-files" | "idbfs-sync-failed" | "engine-error"; readonly detail: string }

function message(text: string): BridgeEvent {
  return { abiVersion: BRIDGE_ABI_VERSION, type: "message", text }
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

  let module: EngineModule
  try {
    module = await options.factory({ noInitialRun: true, ...options.factoryOptions })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown engine instantiation error"
    options.dispatch(runtimeError(`엔진을 초기화하지 못했습니다: ${detail}`))
    return { started: false, reason: "engine-error", detail }
  }

  module.FS.mkdirTree("/assets")
  module.FS.mkdirTree("/data")
  module.FS.mkdirTree("/persist/profile")
  module.FS.mount(module.IDBFS, {}, "/persist")

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
  module.FS.writeFile("/data/ultima4.zip", new Uint8Array(buffer))

  try {
    await unlockAudio()
  } catch {
    // Non-fatal: no user gesture yet, autoplay policy, or no Web Audio
    // support in this environment. Audio itself is Todo 16's scope.
  }

  module.callMain([])
  options.dispatch(message("엔진이 시작되었습니다."))
  return { started: true }
}
