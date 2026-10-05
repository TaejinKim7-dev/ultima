// Todo 51 (save slots): moves a slot's files into / out of the engine's working
// directory (/persist/.xu4). The engine itself is untouched: it still reads and
// writes one set of files; slots are copies of that set.

import type { PersistenceCoordinator, PersistenceFS, PersistencePaths } from "./persistence.ts"
import { SLOT_FILE_NAMES } from "../saves/slots.ts"
import type { SlotFile } from "../saves/slot-store.ts"

/** The slice of Emscripten's FS this module needs beyond PersistenceFS. */
export interface SlotFs extends PersistenceFS {
  unlink(path: string): void
}

/**
 * Emscripten's FS.readFile / FS.writeFile open and close the file, and every
 * close fires trackingDelegate.onCloseFile -- which the persistence coordinator
 * treats as an engine save. Our own reads and writes must not look like saves
 * (user report 2026-10-05: read -> "saved" -> capture -> read ... flickered
 * 저장 중 / 저장 종료 forever), so the hook is parked while we touch files.
 */
function withoutSaveTracking<T>(fs: PersistenceFS, body: () => T): T {
  const hook = fs.trackingDelegate.onCloseFile
  delete fs.trackingDelegate.onCloseFile
  try {
    return body()
  } finally {
    if (hook !== undefined) fs.trackingDelegate.onCloseFile = hook
  }
}

function dirOf(paths: PersistencePaths): string {
  return paths.saveDir.endsWith("/") ? paths.saveDir : `${paths.saveDir}/`
}

/** The save files currently in the working directory (never the xu4rc settings file). */
export function readWorkingFiles(fs: PersistenceFS, paths: PersistencePaths): SlotFile[] {
  const dir = dirOf(paths)
  return withoutSaveTracking(fs, () => {
    let names: string[]
    try {
      names = fs.readdir(paths.saveDir)
    } catch {
      return []
    }
    return names
      .filter((name) => SLOT_FILE_NAMES.includes(name))
      .map((name) => ({ path: name, data: fs.readFile(`${dir}${name}`) }))
  })
}

/**
 * Replaces the working save files with `files` (an empty list clears them) and
 * syncs to IDBFS once at the end, reporting through the coordinator like an
 * import does. xu4rc is left alone. Call only before play starts.
 */
export async function applySlotFiles(
  fs: SlotFs,
  paths: PersistencePaths,
  coordinator: PersistenceCoordinator,
  files: readonly SlotFile[]
): Promise<void> {
  const dir = dirOf(paths)
  withoutSaveTracking(fs, () => {
    for (const name of SLOT_FILE_NAMES) {
      try {
        fs.readFile(`${dir}${name}`)
      } catch {
        continue
      }
      fs.unlink(`${dir}${name}`)
    }
    for (const file of files) {
      if (SLOT_FILE_NAMES.includes(file.path)) {
        fs.writeFile(`${dir}${file.path}`, file.data)
      }
    }
  })
  await coordinator.flush()
  coordinator.reportStatus("saving")
  await new Promise<void>((resolve) => {
    fs.syncfs(false, (error) => {
      coordinator.reportStatus(error ? "error" : "saved", error?.message)
      resolve()
    })
  })
}
