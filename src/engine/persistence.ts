// Persistence coordinator (Todo 10): observes EVERY native save/settings
// write path -- gameSave() (quit&save), the separate new-character-creation
// write in intro.cpp, and Settings::write() -- and flushes IDBFS after each
// one, rather than relying on page unload or hardcoding gameSave alone (both
// explicitly forbidden by the plan). See .omo/drafts/step-10-idbfs-design.md
// for the source investigation this implements.
//
// Observation strategy: Emscripten's `FS.trackingDelegate.onCloseFile` fires
// for every fclose() the native code performs, regardless of which C++
// call site did the writing -- so this coordinator only needs one hook, not
// one per write path. A syncfs is scheduled on the microtask queue rather
// than immediately, so multiple closes from the same synchronous write
// sequence (e.g. gameSave()'s PARTY_SAV then MONSTERS_SAV) coalesce into a
// single IDBFS sync instead of one per file.
//
// This module never touches an actual game or wasm module: it's exercised
// entirely through the PersistenceFS interface below, so unit tests can
// drive it with a fake filesystem. Wiring it to a real EngineModule's FS
// happens in the caller (src/main.ts, once the real engine boot sequence
// exists -- see HANDOFF.md's Step 9 "placeholder main()" caveat).

import { BRIDGE_ABI_VERSION, type BridgeEvent, type SaveStateBridgeEvent } from "../bridge/types.ts"

export type PersistenceStatus = "idle" | "saving" | "saved" | "error"

/** The slice of Emscripten's FS API this module needs, beyond src/engine/startup.ts's EmscriptenFS. */
export interface PersistenceFS {
  trackingDelegate: { onCloseFile?: (path: string) => void }
  writeFile(path: string, data: Uint8Array): void
  readFile(path: string): Uint8Array
  readdir(path: string): string[]
  syncfs(populate: boolean, callback: (error: Error | null) => void): void
}

export interface PersistencePaths {
  /** Directory the native save files (PARTY_SAV, MONSTERS_SAV, ...) live under. */
  readonly saveDir: string
  /** The single file Settings::write() rewrites wholesale. */
  readonly settingsFile: string
}

export type BridgeEmit = (event: BridgeEvent) => boolean | void

export interface PersistenceCoordinator {
  /** Installs the FS.trackingDelegate hook. Call once, before main(). */
  attach(fs: PersistenceFS, paths: PersistencePaths, emit: BridgeEmit): void
  /** Awaits completion of any sync currently scheduled or in flight. */
  flush(): Promise<void>
  readonly status: PersistenceStatus
  /**
   * Reports a save-state transition from outside the trackingDelegate path
   * (used by import, which writes files directly rather than through a
   * native fclose()). "idle" is intentionally not accepted here -- it is
   * only ever the coordinator's initial state.
   */
  reportStatus(status: Exclude<PersistenceStatus, "idle">, message?: string): void
}

function isUnderSaveDir(path: string, paths: PersistencePaths): boolean {
  const dir = paths.saveDir.endsWith("/") ? paths.saveDir : `${paths.saveDir}/`
  return path === paths.settingsFile || path.startsWith(dir)
}

function saveStateEvent(status: SaveStateBridgeEvent["status"], message?: string): BridgeEvent {
  return message === undefined
    ? { abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status }
    : { abiVersion: BRIDGE_ABI_VERSION, type: "save-state", status, message }
}

export function createPersistenceCoordinator(): PersistenceCoordinator {
  let status: PersistenceStatus = "idle"
  let fsRef: PersistenceFS | null = null
  let emitRef: BridgeEmit = () => {}
  let scheduled = false
  let inFlight: Promise<void> | null = null

  function runSync(): Promise<void> {
    const fs = fsRef
    if (fs === null) return Promise.resolve()
    status = "saving"
    emitRef(saveStateEvent("saving"))
    return new Promise<void>((resolve) => {
      fs.syncfs(false, (error) => {
        if (error) {
          status = "error"
          emitRef(saveStateEvent("error", error.message))
        } else {
          status = "saved"
          emitRef(saveStateEvent("saved"))
        }
        resolve()
      })
    })
  }

  function scheduleSync(): void {
    if (scheduled) return
    scheduled = true
    inFlight = Promise.resolve().then(() => {
      scheduled = false
      return runSync()
    })
  }

  return {
    attach(fs, paths, emit) {
      fsRef = fs
      emitRef = emit
      fs.trackingDelegate.onCloseFile = (path: string) => {
        if (isUnderSaveDir(path, paths)) {
          scheduleSync()
        }
      }
    },
    flush() {
      return inFlight ?? Promise.resolve()
    },
    get status() {
      return status
    },
    reportStatus(newStatus, message) {
      status = newStatus
      emitRef(saveStateEvent(newStatus, message))
    }
  }
}

// ---------------------------------------------------------------------------
// Save archive: this project's own minimal binary bundle format for
// export/import, NOT a real ZIP -- save files are fixed-byte-layout native
// formats that must round-trip exactly, and a full ZIP writer would be
// more machinery than this needs (src/engine/zip.ts is a READER only, for
// the much larger original-data archive; deliberately not reused here).
// Layout: magic "U4SV" + u16 version + u16 count, then per entry:
// u16 pathLength + path (utf-8) + u32 dataLength + data.

const ARCHIVE_MAGIC = "U4SV"
const ARCHIVE_VERSION = 1

export interface SaveArchiveEntry {
  readonly path: string
  readonly data: Uint8Array
}

export function packSaveArchive(entries: readonly SaveArchiveEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const encodedNames = entries.map((e) => encoder.encode(e.path))
  let total = ARCHIVE_MAGIC.length + 2 + 2
  for (let i = 0; i < entries.length; i++) {
    total += 2 + encodedNames[i]!.length + 4 + entries[i]!.data.length
  }
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let offset = 0
  out.set(encoder.encode(ARCHIVE_MAGIC), offset)
  offset += ARCHIVE_MAGIC.length
  view.setUint16(offset, ARCHIVE_VERSION, true)
  offset += 2
  view.setUint16(offset, entries.length, true)
  offset += 2
  for (let i = 0; i < entries.length; i++) {
    const name = encodedNames[i]!
    view.setUint16(offset, name.length, true)
    offset += 2
    out.set(name, offset)
    offset += name.length
    const data = entries[i]!.data
    view.setUint32(offset, data.length, true)
    offset += 4
    out.set(data, offset)
    offset += data.length
  }
  return out
}

export function unpackSaveArchive(buffer: Uint8Array): SaveArchiveEntry[] {
  const decoder = new TextDecoder("utf-8")
  const magicBytes = buffer.slice(0, ARCHIVE_MAGIC.length)
  if (decoder.decode(magicBytes) !== ARCHIVE_MAGIC) {
    throw new Error("not a valid Ultima IV save archive: magic header missing")
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  let offset = ARCHIVE_MAGIC.length
  const version = view.getUint16(offset, true)
  offset += 2
  if (version !== ARCHIVE_VERSION) {
    throw new Error(`unsupported save archive version: ${version}`)
  }
  const count = view.getUint16(offset, true)
  offset += 2
  const entries: SaveArchiveEntry[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 2 > buffer.length) {
      throw new Error("not a valid Ultima IV save archive: truncated entry header")
    }
    const nameLength = view.getUint16(offset, true)
    offset += 2
    const path = decoder.decode(buffer.slice(offset, offset + nameLength))
    offset += nameLength
    const dataLength = view.getUint32(offset, true)
    offset += 4
    const data = buffer.slice(offset, offset + dataLength)
    offset += dataLength
    entries.push({ path, data })
  }
  return entries
}

function listSaveDirEntries(fs: PersistenceFS, saveDir: string): string[] {
  return fs
    .readdir(saveDir)
    .filter((name) => name !== "." && name !== "..")
}

/** Flushes pending writes, then bundles every file under saveDir into an archive. */
export async function exportSaveArchive(
  fs: PersistenceFS,
  paths: PersistencePaths,
  coordinator: PersistenceCoordinator
): Promise<Uint8Array> {
  await coordinator.flush()
  const dir = paths.saveDir.endsWith("/") ? paths.saveDir : `${paths.saveDir}/`
  const names = listSaveDirEntries(fs, paths.saveDir)
  const entries: SaveArchiveEntry[] = names.map((name) => ({
    path: name,
    data: fs.readFile(`${dir}${name}`)
  }))
  return packSaveArchive(entries)
}

/**
 * Writes every entry from an archive under saveDir, then syncs to IDBFS.
 * Never throws: a corrupted archive or a sync failure both resolve
 * normally after reporting a recoverable "error" save-state through the
 * coordinator -- the plan explicitly requires the UI show a recoverable
 * error rather than a false "saved", not a thrown exception.
 */
export async function importSaveArchive(
  fs: PersistenceFS,
  paths: PersistencePaths,
  coordinator: PersistenceCoordinator,
  archive: Uint8Array
): Promise<void> {
  let entries: SaveArchiveEntry[]
  try {
    entries = unpackSaveArchive(archive)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown save archive error"
    coordinator.reportStatus("error", message)
    return
  }
  const dir = paths.saveDir.endsWith("/") ? paths.saveDir : `${paths.saveDir}/`
  for (const entry of entries) {
    fs.writeFile(`${dir}${entry.path}`, entry.data)
  }
  coordinator.reportStatus("saving")
  await new Promise<void>((resolve) => {
    fs.syncfs(false, (error) => {
      coordinator.reportStatus(error ? "error" : "saved", error?.message)
      resolve()
    })
  })
}
