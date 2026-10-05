// Todo 51 (save slots): moving a slot's files into / out of the engine's
// working directory, over a fake filesystem.
import { describe, expect, it } from "vitest"
import { createPersistenceCoordinator, type PersistenceFS, type PersistencePaths } from "../../src/engine/persistence.ts"
import { applySlotFiles, readWorkingFiles, type SlotFs } from "../../src/engine/slot-engine.ts"

const PATHS: PersistencePaths = { saveDir: "/persist/.xu4", settingsFile: "/persist/.xu4/xu4rc" }

function fakeFs(initial: Record<string, number[]> = {}) {
  const files = new Map<string, Uint8Array>(Object.entries(initial).map(([name, bytes]) => [`/persist/.xu4/${name}`, new Uint8Array(bytes)]))
  const calls: string[] = []
  const fs: SlotFs = {
    trackingDelegate: {},
    writeFile(path, data) {
      calls.push(`write ${path.split("/").pop()}`)
      files.set(path, data)
    },
    readFile(path) {
      const data = files.get(path)
      if (data === undefined) throw new Error(`ENOENT ${path}`)
      return data
    },
    readdir(path) {
      const prefix = `${path}/`
      return [".", "..", ...[...files.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))]
    },
    unlink(path) {
      calls.push(`unlink ${path.split("/").pop()}`)
      files.delete(path)
    },
    syncfs(_populate, callback) {
      calls.push("syncfs")
      Promise.resolve().then(() => callback(null))
    }
  }
  return { fs, files, calls }
}

describe("readWorkingFiles", () => {
  it("returns the save files only (not xu4rc or unknown files)", () => {
    const { fs } = fakeFs({ "party.sav": [1], "monsters.sav": [2], xu4rc: [3], "other.bin": [4] })
    const names = readWorkingFiles(fs, PATHS).map((file) => file.path).sort()
    expect(names).toEqual(["monsters.sav", "party.sav"])
  })

  it("is empty when nothing is saved yet", () => {
    expect(readWorkingFiles(fakeFs().fs, PATHS)).toEqual([])
  })
})

describe("applySlotFiles", () => {
  it("replaces the working save files with the slot's, keeps xu4rc, and syncs once at the end", async () => {
    const { fs, files, calls } = fakeFs({ "party.sav": [9], "dngmap.sav": [8], xu4rc: [7] })
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs as PersistenceFS, PATHS, () => true)
    await applySlotFiles(fs, PATHS, coordinator, [
      { path: "party.sav", data: new Uint8Array([1, 2]) },
      { path: "monsters.sav", data: new Uint8Array([3]) }
    ])
    expect([...files.keys()].map((key) => key.split("/").pop()).sort()).toEqual(["monsters.sav", "party.sav", "xu4rc"])
    expect([...files.get("/persist/.xu4/party.sav")!]).toEqual([1, 2])
    expect(calls.filter((call) => call === "syncfs")).toHaveLength(1)
    expect(calls[calls.length - 1]).toBe("syncfs")
    expect(calls.indexOf("unlink dngmap.sav")).toBeLessThan(calls.indexOf("write party.sav"))
  })

  it("an empty slot clears the working save files", async () => {
    const { fs, files } = fakeFs({ "party.sav": [9], "monsters.sav": [8], xu4rc: [7] })
    const coordinator = createPersistenceCoordinator()
    coordinator.attach(fs as PersistenceFS, PATHS, () => true)
    await applySlotFiles(fs, PATHS, coordinator, [])
    expect([...files.keys()].map((key) => key.split("/").pop())).toEqual(["xu4rc"])
  })
})
