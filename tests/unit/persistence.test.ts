import { describe, expect, it } from "vitest"
import {
  createPersistenceCoordinator,
  packSaveArchive,
  unpackSaveArchive,
  exportSaveArchive,
  importSaveArchive,
  type PersistenceFS
} from "../../src/engine/persistence.ts"
import type { BridgeEvent } from "../../src/bridge/types.ts"

function makeFakeFs(syncfsError: Error | null = null): {
  fs: PersistenceFS
  syncfsCalls: boolean[]
  files: Map<string, Uint8Array>
} {
  const files = new Map<string, Uint8Array>()
  const syncfsCalls: boolean[] = []
  const fs: PersistenceFS = {
    trackingDelegate: {},
    writeFile(path: string, data: Uint8Array) {
      files.set(path, data)
    },
    readFile(path: string): Uint8Array {
      const data = files.get(path)
      if (data === undefined) throw new Error(`ENOENT: ${path}`)
      return data
    },
    readdir(path: string): string[] {
      const prefix = path.endsWith("/") ? path : `${path}/`
      const names = [".", ".."]
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          names.push(key.slice(prefix.length))
        }
      }
      return names
    },
    syncfs(populate: boolean, callback: (error: Error | null) => void) {
      syncfsCalls.push(populate)
      // Simulate async completion on the microtask queue, like real IDBFS.
      Promise.resolve().then(() => callback(syncfsError))
    }
  }
  return { fs, syncfsCalls, files }
}

function collectEvents(): { emit: (event: BridgeEvent) => boolean; events: BridgeEvent[] } {
  const events: BridgeEvent[] = []
  return { emit: (event) => (events.push(event), true), events }
}

const PATHS = { saveDir: "/persist/profile", settingsFile: "/persist/profile/xu4rc" }

describe("createPersistenceCoordinator", () => {
  it("attach() installs a trackingDelegate.onCloseFile hook on the given FS", () => {
    const { fs } = makeFakeFs()
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)
    expect(typeof fs.trackingDelegate.onCloseFile).toBe("function")
  })

  it("a single relevant file close triggers exactly one syncfs(false, ...) call", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    fs.trackingDelegate.onCloseFile?.("/persist/profile/party.sav")
    await coordinator.flush()

    expect(syncfsCalls).toEqual([false])
  })

  it("multiple closes in the same tick (e.g. PARTY_SAV + MONSTERS_SAV) coalesce into one sync", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    fs.trackingDelegate.onCloseFile?.("/persist/profile/party.sav")
    fs.trackingDelegate.onCloseFile?.("/persist/profile/monsters.sav")
    await coordinator.flush()

    expect(syncfsCalls).toHaveLength(1)
  })

  it("a close outside saveDir/settingsFile is ignored entirely", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    fs.trackingDelegate.onCloseFile?.("/data/ultima4.zip")
    await coordinator.flush()

    expect(syncfsCalls).toHaveLength(0)
  })

  it("status transitions idle -> saving -> saved in order, with matching bridge emits", async () => {
    const { fs } = makeFakeFs()
    const { emit, events } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    expect(coordinator.status).toBe("idle")
    fs.trackingDelegate.onCloseFile?.("/persist/profile/party.sav")
    // Sync is scheduled on the microtask queue (to coalesce same-tick
    // closes), so status is still "idle" immediately after the call --
    // it only flips once flush() actually runs the sync.
    await coordinator.flush()
    expect(coordinator.status).toBe("saved")

    const saveStateEvents = events.filter((e) => e.type === "save-state")
    expect(saveStateEvents.map((e) => (e.type === "save-state" ? e.status : null))).toEqual(["saving", "saved"])
  })

  it("a syncfs error sets status to 'error' with a message, and never reports 'saved'", async () => {
    const { fs } = makeFakeFs(new Error("indexeddb quota exceeded"))
    const { emit, events } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    fs.trackingDelegate.onCloseFile?.("/persist/profile/party.sav")
    await coordinator.flush()

    expect(coordinator.status).toBe("error")
    const saveStateEvents = events.filter((e) => e.type === "save-state")
    expect(saveStateEvents.some((e) => e.type === "save-state" && e.status === "saved")).toBe(false)
    const errorEvent = saveStateEvents.find((e) => e.type === "save-state" && e.status === "error")
    expect(errorEvent).toBeDefined()
    if (errorEvent?.type === "save-state") {
      expect(errorEvent.message).toContain("indexeddb quota exceeded")
    }
  })

  it("flush() with nothing pending resolves immediately without calling syncfs", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    await coordinator.flush()
    expect(syncfsCalls).toHaveLength(0)
  })
})

describe("packSaveArchive / unpackSaveArchive", () => {
  it("round-trips multiple entries with their exact paths and bytes", () => {
    const entries = [
      { path: "party.sav", data: new Uint8Array([1, 2, 3, 0, 255]) },
      { path: "monsters.sav", data: new Uint8Array([]) },
      { path: "xu4rc", data: new TextEncoder().encode("debug=0\n") }
    ]
    const packed = packSaveArchive(entries)
    const unpacked = unpackSaveArchive(packed)
    expect(unpacked).toEqual(entries)
  })

  it("throws a clear error on a buffer that isn't a save archive", () => {
    expect(() => unpackSaveArchive(new Uint8Array([1, 2, 3, 4]))).toThrow(/save archive/i)
  })
})

describe("exportSaveArchive / importSaveArchive", () => {
  it("exports every file under saveDir as a save archive, after flushing pending syncs", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    fs.writeFile("/persist/profile/party.sav", new Uint8Array([9, 9]))
    fs.writeFile("/persist/profile/xu4rc", new TextEncoder().encode("debug=0\n"))
    const { emit } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)
    fs.trackingDelegate.onCloseFile?.("/persist/profile/party.sav") // pending sync

    const archive = await exportSaveArchive(fs, PATHS, coordinator)

    expect(syncfsCalls).toHaveLength(1) // flushed before reading, not a second time
    const entries = unpackSaveArchive(archive)
    expect(entries.map((e) => e.path).sort()).toEqual(["party.sav", "xu4rc"])
  })

  it("imports a save archive by writing every entry under saveDir and syncing to IDBFS", async () => {
    const { fs, syncfsCalls } = makeFakeFs()
    const { emit, events } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)
    const archive = packSaveArchive([{ path: "party.sav", data: new Uint8Array([7, 7, 7]) }])

    await importSaveArchive(fs, PATHS, coordinator, archive)

    expect(fs.readFile("/persist/profile/party.sav")).toEqual(new Uint8Array([7, 7, 7]))
    expect(syncfsCalls).toContain(false)
    const saveStateEvents = events.filter((e) => e.type === "save-state")
    expect(saveStateEvents.some((e) => e.type === "save-state" && e.status === "saved")).toBe(true)
  })

  it("importSaveArchive reports a recoverable error (not 'saved') on a corrupted archive", async () => {
    const { fs } = makeFakeFs()
    const { emit, events } = collectEvents()
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs, PATHS, emit)

    await importSaveArchive(fs, PATHS, coordinator, new Uint8Array([1, 2, 3]))

    const saveStateEvents = events.filter((e) => e.type === "save-state")
    expect(saveStateEvents.some((e) => e.type === "save-state" && e.status === "saved")).toBe(false)
    expect(saveStateEvents.some((e) => e.type === "save-state" && e.status === "error")).toBe(true)
  })
})
