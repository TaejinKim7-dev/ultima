import { describe, expect, it } from "vitest"
import { startEngine, type EngineModule, type EngineModuleFactory } from "../../src/engine/startup.ts"
import { REQUIRED_ULTIMA4_ENTRIES } from "../../src/engine/zip.ts"
import { buildStoreZip } from "../lib/test-zip.ts"
import type { BridgeEvent } from "../../src/bridge/types.ts"

function dummyEntries(names: readonly string[]) {
  return names.map((name) => ({ name, data: new TextEncoder().encode(`dummy:${name}`) }))
}

function makeFakeModule(syncfsError: Error | null = null): {
  module: EngineModule
  calls: { mkdirTree: string[]; mounted: unknown[]; written: { path: string; data: Uint8Array }[]; mainCalled: number }
} {
  const calls = {
    mkdirTree: [] as string[],
    mounted: [] as unknown[],
    written: [] as { path: string; data: Uint8Array }[],
    mainCalled: 0
  }
  const module: EngineModule = {
    IDBFS: { marker: "idbfs" },
    FS: {
      mkdirTree(path: string) {
        calls.mkdirTree.push(path)
      },
      mount(type, opts, mountpoint) {
        calls.mounted.push({ type, opts, mountpoint })
      },
      writeFile(path: string, data: Uint8Array) {
        calls.written.push({ path, data })
      },
      syncfs(_populate: boolean, callback: (error: Error | null) => void) {
        callback(syncfsError)
      }
    },
    callMain() {
      calls.mainCalled += 1
    }
  }
  return { module, calls }
}

function makeFactory(fakeModule: EngineModule): { factory: EngineModuleFactory; calls: number[] } {
  const callLog: number[] = []
  const factory: EngineModuleFactory = async (opts) => {
    callLog.push(callLog.length)
    expect(opts["noInitialRun"]).toBe(true)
    return fakeModule
  }
  return { factory, calls: callLog }
}

function fakeZipFile(names: readonly string[]): Blob {
  const bytes = buildStoreZip(dummyEntries(names))
  return new Blob([bytes])
}

describe("startEngine", () => {
  it("on success: mounts IDBFS, syncs, writes the zip, calls main exactly once, dispatches a success message", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const dispatched: BridgeEvent[] = []

    const result = await startEngine({
      factory,
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(true)
    expect(calls.mkdirTree).toEqual(["/assets", "/data", "/persist/profile"])
    expect(calls.mounted).toEqual([{ type: module.IDBFS, opts: {}, mountpoint: "/persist" }])
    expect(calls.written).toHaveLength(1)
    expect(calls.written[0]!.path).toBe("/data/ultima4.zip")
    expect(calls.mainCalled).toBe(1)
    // A shaMismatch warning message plus the final "started" message.
    const messages = dispatched.filter((e) => e.type === "message")
    expect(messages.length).toBeGreaterThanOrEqual(1)
    expect(dispatched.some((e) => e.type === "runtime-error")).toBe(false)
  })

  it("on missing required files: never calls main, dispatches a fatal runtime-error, reason is 'missing-files'", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const dispatched: BridgeEvent[] = []

    const result = await startEngine({
      factory,
      zipFile: fakeZipFile(["WORLD.MAP"]), // far from complete
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(false)
    if (result.started) return
    expect(result.reason).toBe("missing-files")
    expect(calls.mainCalled).toBe(0)
    expect(calls.written).toHaveLength(0) // never inject a bad archive into the FS
    const errorEvent = dispatched.find((e) => e.type === "runtime-error")
    expect(errorEvent).toBeDefined()
    if (errorEvent?.type === "runtime-error") {
      expect(errorEvent.fatal).toBe(true)
    }
  })

  it("on a corrupted zip: never calls main, dispatches a fatal runtime-error, reason is 'corrupted'", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const zipBytes = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES))
    const corrupted = new Blob([zipBytes.slice(0, zipBytes.length - 22)])
    const dispatched: BridgeEvent[] = []

    const result = await startEngine({
      factory,
      zipFile: corrupted,
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(false)
    if (result.started) return
    expect(result.reason).toBe("corrupted")
    expect(calls.mainCalled).toBe(0)
  })

  it("on an IDBFS sync failure: never reads/validates the zip, never calls main, dispatches a fatal runtime-error", async () => {
    const { module, calls } = makeFakeModule(new Error("indexeddb quota exceeded"))
    const { factory } = makeFactory(module)
    const dispatched: BridgeEvent[] = []

    const result = await startEngine({
      factory,
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(false)
    if (result.started) return
    expect(result.reason).toBe("idbfs-sync-failed")
    expect(calls.mainCalled).toBe(0)
    expect(calls.written).toHaveLength(0)
  })

  it("a failing audio unlock is non-fatal: startup still completes and main is still called", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)

    const result = await startEngine({
      factory,
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {
        throw new Error("no user gesture yet")
      }
    })

    expect(result.started).toBe(true)
    expect(calls.mainCalled).toBe(1)
  })

  it("on factory (module instantiation) failure: dispatches a fatal runtime-error and never touches FS", async () => {
    const dispatched: BridgeEvent[] = []
    const result = await startEngine({
      factory: async () => {
        throw new Error("wasm compile failed")
      },
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: (event) => {
        dispatched.push(event)
        return true
      }
    })

    expect(result.started).toBe(false)
    if (result.started) return
    expect(result.reason).toBe("engine-error")
    expect(dispatched.some((e) => e.type === "runtime-error")).toBe(true)
  })
})
