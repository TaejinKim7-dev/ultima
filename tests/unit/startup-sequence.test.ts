import { describe, expect, it } from "vitest"
import { startEngine, type EngineModule, type EngineModuleFactory } from "../../src/engine/startup.ts"
import { MAX_ZIP_BYTES, REQUIRED_ULTIMA4_ENTRIES } from "../../src/engine/zip.ts"
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
    HEAPU8: new Uint8Array(65536),
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
  it("Todo 42: wasmMemoryBytes() re-reads Module.HEAPU8.buffer on every call (growth replaces the buffer)", async () => {
    const { module } = makeFakeModule()
    const { factory } = makeFactory(module)
    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {}
    })
    expect(result.started).toBe(true)
    if (!result.started) throw new Error("unreachable")
    expect(result.wasmMemoryBytes()).toBe(65536)
    // Emscripten's memory growth swaps in a new, larger HEAPU8 view.
    ;(module as { HEAPU8: Uint8Array }).HEAPU8 = new Uint8Array(131072)
    expect(result.wasmMemoryBytes()).toBe(131072)
  })

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
    if (!result.started) throw new Error("unreachable")
    // Real save export/import (bound to this same FS/paths/coordinator),
    // not Todo 5's placeholder JSON -- see src/shell.ts's attachSaveHandlers.
    const archive = await result.saveHandlers.export()
    expect(new TextDecoder().decode(archive.subarray(0, 4))).toBe("U4SV")
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

  it("on an oversized zip: rejects from the Blob's own .size, never reads it into memory, never calls main", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const dispatched: BridgeEvent[] = []
    // A fake Blob that reports an oversized `.size` but throws if anything
    // ever tries to actually read its bytes -- proves startEngine rejects
    // from `.size` alone, before ever calling `.arrayBuffer()`.
    const oversizedZip = {
      size: MAX_ZIP_BYTES + 1,
      arrayBuffer: () => {
        throw new Error("must not be read: startEngine should reject from .size alone")
      }
    } as unknown as Blob

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: oversizedZip,
      dispatch: (event) => {
        dispatched.push(event)
        return true
      },
      unlockAudio: async () => {}
    })

    expect(result.started).toBe(false)
    if (result.started) return
    expect(result.reason).toBe("oversized")
    expect(calls.mainCalled).toBe(0)
    const runtimeError = dispatched.find((event) => event.type === "runtime-error")
    expect(runtimeError).toBeDefined()
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

  it("Todo 16: attaches a Web Audio bridge to module.u4Audio before callMain() when an AudioContext is supplied", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    let u4AudioAtMainCall: unknown
    module.callMain = () => {
      calls.mainCalled += 1
      u4AudioAtMainCall = module.u4Audio
    }
    const fakeContext = {
      state: "suspended" as const,
      currentTime: 0,
      destination: {},
      resume: async () => {},
      suspend: async () => {},
      createGain: () => ({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
      createBufferSource: () => ({ buffer: null, loop: false, connect() {}, disconnect() {}, start() {}, stop() {} }),
      createBuffer: () => ({ duration: 0, length: 0 }),
      decodeAudioData: async () => ({ duration: 0, length: 0 })
    }

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: fakeContext
    })

    expect(result.started).toBe(true)
    expect(module.u4Audio).toBeDefined()
    expect(u4AudioAtMainCall).toBe(module.u4Audio) // attached before callMain(), not after
    // durationMs() must answer synchronously, with no async work at all
    // (this fake module asset isn't a real CDI pak, so the manifest is
    // empty -- the point here is the *call shape*, not a real duration).
    expect(module.u4Audio?.durationMs(0)).toBe(0)
  })

  it("Todo 16: attaches no audio bridge when audioContext is explicitly null (mirrors 'no Web Audio at all')", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null
    })

    expect(result.started).toBe(true)
    expect(calls.mainCalled).toBe(1)
    expect(module.u4Audio).toBeUndefined()
  })
  it("Todo 18: attaches the native text-prompt receiver to module.u4TextPrompt before callMain()", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const seen: string[] = []
    const textPrompt = {
      opened: (id: number) => seen.push(`open:${id}`),
      closed: (id: number) => seen.push(`close:${id}`)
    }
    let receiverAtMainCall: unknown
    module.callMain = () => {
      calls.mainCalled += 1
      receiverAtMainCall = module.u4TextPrompt
      module.u4TextPrompt?.opened(1)
      module.u4TextPrompt?.closed(1)
    }

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      textPrompt
    })

    expect(result.started).toBe(true)
    expect(receiverAtMainCall).toBe(textPrompt) // attached before callMain(), not after
    expect(seen).toEqual(["open:1", "close:1"])
  })
  it("Todo 22: attaches the native talk-line receiver to module.u4Text before callMain()", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const seen: string[] = []
    const talkText = {
      talk: (format: string, a0: string | null, a1: string | null) => seen.push(`talk:${format}|${a0}|${a1}`),
      input: (text: string) => seen.push(`input:${text}`),
      message: (hash: string, args: string[]) => seen.push(`message:${hash}|${args.join(",")}`),
      center: (hash: string, newlines: number) => seen.push(`center:${hash}|${newlines}`),
      vendor: (hash: string, pairs: string[]) => seen.push(`vendor:${hash}|${pairs.join(",")}`)
    }
    let receiverAtMainCall: unknown
    module.callMain = () => {
      calls.mainCalled += 1
      receiverAtMainCall = module.u4Text
      module.u4Text?.talk("%s", "@MOONGLOW:12:health", null)
      module.u4Text?.input("health")
      module.u4Text?.message("deadbeef", ["a", "b"])
      module.u4Text?.center("deadbeef", 2)
      module.u4Text?.vendor("cafef00d", ["@", "Shop"])
    }

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      talkText
    })

    expect(result.started).toBe(true)
    expect(receiverAtMainCall).toBe(talkText)
    expect(seen).toEqual(["talk:%s|@MOONGLOW:12:health|null", "input:health", "message:deadbeef|a,b", "center:deadbeef|2", "vendor:cafef00d|@,Shop"])
  })
  it("Todo 26: attaches the intro view receiver to module.u4View before callMain()", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const seen: string[] = []
    const introView = {
      show: (region: string, x: number, y: number, w: number, h: number, selected: number, payload: string) =>
        seen.push(`show:${region}|${x},${y},${w},${h}|${selected}|${payload}`),
      hide: (region: string) => seen.push(`hide:${region}`)
    }
    let receiverAtMainCall: unknown
    module.callMain = () => {
      calls.mainCalled += 1
      receiverAtMainCall = module.u4View
      module.u4View?.show("menu", 8, 104, 304, 88, 2, "Journey Onward")
      module.u4View?.hide("menu")
    }

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      introView
    })

    expect(result.started).toBe(true)
    expect(receiverAtMainCall).toBe(introView)
    expect(seen).toEqual(["show:menu|8,104,304,88|2|Journey Onward", "hide:menu"])
  })
  it("Todo 26: hides the intro overlays when the engine exits or aborts", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const captured: Record<string, unknown>[] = []
    const seen: string[] = []
    const introView = {
      show: () => {},
      hide: (region: string) => seen.push(`hide:${region}`)
    }
    module.callMain = () => {
      calls.mainCalled += 1
    }
    await startEngine({
      factory: (opts) => {
        captured.push(opts)
        return factory(opts)
      },
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      introView
    })
    const opts = captured[0] as { onExit: (code: number) => void; onAbort: (reason: unknown) => void }
    opts.onExit(0)
    opts.onAbort("boom")
    expect(seen).toEqual(["hide:menu", "hide:textview", "hide:menu", "hide:textview"])
  })
  it("Todo 49: attaches the screen receiver to module.u4Screen before callMain()", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const seen: string[] = []
    const screen = {
      input: (id: number, text: string) => seen.push(`input:${id}:${text}`),
      choice: (ch: string) => seen.push(`choice:${ch}`),
      cursor: (on: boolean) => seen.push(`cursor:${on}`),
      play: (on: boolean) => seen.push(`play:${on}`),
      modal: (on: boolean) => seen.push(`modal:${on}`),
      crlf: () => seen.push(`crlf`)
    }
    let receiverAtMainCall: unknown
    module.callMain = () => {
      calls.mainCalled += 1
      receiverAtMainCall = module.u4Screen
      module.u4Screen?.input(1, "hej")
      module.u4Screen?.choice("A")
      module.u4Screen?.cursor(true)
      module.u4Screen?.play(true)
      module.u4Screen?.modal(true)
      module.u4Screen?.crlf()
    }

    const result = await startEngine({
      factory,
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      screen
    })

    expect(result.started).toBe(true)
    expect(receiverAtMainCall).toBe(screen) // attached before callMain(), not after
    expect(seen).toEqual(["input:1:hej", "choice:A", "cursor:true", "play:true", "modal:true", "crlf"])
  })
  it("Todo 49: reports play(false) when the engine exits or aborts", async () => {
    const { module, calls } = makeFakeModule()
    const { factory } = makeFactory(module)
    const captured: Record<string, unknown>[] = []
    const seen: string[] = []
    const screen = {
      input: () => {},
      choice: () => {},
      cursor: () => {},
      play: (on: boolean) => seen.push(`play:${on}`),
      modal: () => {},
      crlf: () => {}
    }
    module.callMain = () => {
      calls.mainCalled += 1
    }
    await startEngine({
      factory: (opts) => {
        captured.push(opts)
        return factory(opts)
      },
      renderPak: fakeModuleAsset("render.pak"),
      gameModule: fakeModuleAsset("Ultima-IV.mod"),
      zipFile: fakeZipFile(REQUIRED_ULTIMA4_ENTRIES),
      dispatch: () => true,
      unlockAudio: async () => {},
      audioContext: null,
      screen
    })
    const opts = captured[0] as { onExit: (code: number) => void; onAbort: (reason: unknown) => void }
    opts.onExit(0)
    opts.onAbort("boom")
    // Both the exit path and the abort path must drop the overlay: play(0).
    expect(seen).toEqual(["play:false", "play:false"])
  })
})
