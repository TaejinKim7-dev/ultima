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
  calls: {
    mkdirTree: string[]
    mounted: unknown[]
    written: { path: string; data: Uint8Array }[]
    mainCalled: number
  }
} {
  const calls = {
    mkdirTree: [] as string[],
    mounted: [] as unknown[],
    written: [] as { path: string; data: Uint8Array }[],
    mainCalled: 0
  }
  const module: EngineModule = {
    IDBFS: { marker: "idbfs" },
    // Real Emscripten sets Module.ENV itself during module setup, before
    // any preRun callback runs (see src/engine/startup.ts's doc comment);
    // this fake starts empty so the preRun callback is what fills it in.
    ENV: {},
    FS: {
      trackingDelegate: {},
      mkdirTree(path: string) {
        calls.mkdirTree.push(path)
      },
      mount(type, opts, mountpoint) {
        calls.mounted.push({ type, opts, mountpoint })
      },
      writeFile(path: string, data: Uint8Array) {
        calls.written.push({ path, data })
      },
      readFile() {
        return new Uint8Array()
      },
      readdir() {
        return []
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
  // Mirrors real Emscripten glue closely enough for this suite: preRun
  // callbacks run against the live module before the factory "resolves".
  const factory: EngineModuleFactory = async (opts) => {
    callLog.push(callLog.length)
    expect(opts["noInitialRun"]).toBe(true)
    // Real Emscripten's `Module['ENV'] = ENV` assignment happens before
    // preRun runs, and MODULARIZE reuses `opts` as `Module` -- so the
    // fake module's ENV must be the *same object* `opts.ENV` for a preRun
    // callback that mutates `opts.ENV` to be visible on the returned module.
    opts["ENV"] = fakeModule.ENV
    const preRun = opts["preRun"]
    if (Array.isArray(preRun)) {
      for (const fn of preRun) (fn as () => void)()
    }
    return fakeModule
  }
  return { factory, calls: callLog }
}

function fakeZipFile(names: readonly string[]): Blob {
  const bytes = buildStoreZip(dummyEntries(names))
  return new Blob([bytes])
}

function fakeModuleAsset(label: string): Blob {
  return new Blob([new TextEncoder().encode(`fake:${label}`)])
}

describe("startEngine", () => {
  it("on success: mounts IDBFS, syncs, writes the zip, calls main exactly once, dispatches a success message", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const dispatched: BridgeEvent[] = []

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(true)
    expect(calls.mkdirTree).toEqual(["/persist"])
    expect(calls.mounted).toEqual([{ type: module.IDBFS, opts: {}, mountpoint: "/persist" }])
    expect(calls.written.map((w) => w.path)).toEqual(["/render.pak", "/Ultima-IV.mod", "/ultima4.zip"])
    expect(calls.mainCalled).toBe(1)
    // FS root, not Emscripten's Node/web default -- see the module doc
    // comment; this is what actually lands userPath under the IDBFS mount.
    expect(module.ENV["HOME"]).toBe("/persist")
    // Attached before callMain so no native save write can be missed.
    expect(typeof module.FS.trackingDelegate.onCloseFile).toBe("function")
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
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
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
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
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
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
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
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
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
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
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
