// Todo 16 RED->GREEN: src/engine/audio.ts is the TS Web Audio bridge that
// vendor/xu4/src/sound_web.cpp calls into via EM_JS (see that file's header
// comment for the exact call shape). This suite drives it entirely through
// fake AudioContext/GainNode/BufferSource/decodeAudioData doubles -- no real
// Web Audio, no wasm -- so the generation-cancellation race (the plan's
// QA "failure" scenario: a stale decode must not restart music already
// stopped) is deterministic instead of timing-dependent.
import { describe, expect, it, vi } from "vitest"
import {
  MAX_VOLUME,
  createAudioBridge,
  createGenerationTracker,
  volumeToGain,
  type AudioBridgeFS,
  type AudioBufferLike,
  type AudioContextLike
} from "../../src/engine/audio.ts"

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fakeGainParam() {
  return {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn()
  }
}

function fakeAudioBuffer(duration = 1.5) {
  return { duration, length: Math.round(duration * 44100), copyToChannel: vi.fn() }
}

interface FakeSource {
  buffer: AudioBufferLike | null
  loop: boolean
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

function makeFakeContext(decodeAudioData: (data: ArrayBuffer) => Promise<unknown>) {
  const sources: FakeSource[] = []
  const gains: ReturnType<typeof fakeGainParam>[] = []
  let state: "suspended" | "running" | "closed" = "suspended"
  const context: AudioContextLike & { sources: FakeSource[]; gains: ReturnType<typeof fakeGainParam>[] } = {
    get state() {
      return state
    },
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      state = "running"
    }),
    suspend: vi.fn(async () => {
      state = "suspended"
    }),
    createGain: vi.fn(() => {
      const gain = fakeGainParam()
      gains.push(gain)
      return { gain, connect: vi.fn(), disconnect: vi.fn() }
    }),
    createBufferSource: vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      }
      sources.push(source)
      return source
    }),
    createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) =>
      fakeAudioBuffer(length / sampleRate)
    ),
    decodeAudioData: vi.fn(decodeAudioData) as unknown as AudioContextLike["decodeAudioData"],
    sources,
    gains
  }
  return context
}

function fakeFs(bytes: Uint8Array): AudioBridgeFS {
  return { readFile: vi.fn(() => bytes) }
}

describe("audio bridge: generation tracker", () => {
  it("bump() increments and current tracks the latest value", () => {
    const tracker = createGenerationTracker()
    expect(tracker.current()).toBe(0)
    const a = tracker.bump()
    const b = tracker.bump()
    expect(a).toBe(1)
    expect(b).toBe(2)
    expect(tracker.current()).toBe(2)
  })

  it("isStale() is true for any generation older than the current one", () => {
    const tracker = createGenerationTracker()
    const first = tracker.bump()
    tracker.bump()
    expect(tracker.isStale(first)).toBe(true)
    expect(tracker.isStale(tracker.current())).toBe(false)
  })
})

describe("audio bridge: volume mapping", () => {
  it("maps 0..MAX_VOLUME onto 0..1 the same way native sound_faun.cpp does (float(volume)/MAX_VOLUME)", () => {
    expect(MAX_VOLUME).toBe(10)
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(10)).toBe(1)
    expect(volumeToGain(5)).toBeCloseTo(0.5)
  })
})

describe("audio bridge: music generation cancellation (the plan's QA failure scenario)", () => {
  it("a decode that resolves after stopMusic() must NOT start playback", async () => {
    const gate = deferred<unknown>()
    const context = makeFakeContext(() => gate.promise)
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusic("/Ultima-IV.mod", 16, 792133, 0)
    bridge.stopMusic() // the game (or the player) stops music before the decode ever finishes

    gate.resolve(fakeAudioBuffer(49.4)) // the stale decode finally completes
    await Promise.resolve()
    await Promise.resolve()

    expect(context.sources).toHaveLength(0) // no BufferSourceNode was ever created for the stale decode
    expect(bridge.stats().staleMusicDiscards).toBe(1)
    expect(bridge.stats().musicStarts).toBe(0)
  })

  it("a decode that resolves after a NEWER playMusic() call must not resurrect the old track", async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    let call = 0
    const context = makeFakeContext(() => (call++ === 0 ? first.promise : second.promise))
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusic("/Ultima-IV.mod", 16, 100, 0) // track A, generation 1
    bridge.playMusic("/Ultima-IV.mod", 200, 100, 0) // track B, generation 2 (still decoding)

    second.resolve(fakeAudioBuffer(2)) // B finishes first
    await Promise.resolve()
    await Promise.resolve()
    expect(bridge.stats().musicStarts).toBe(1)

    first.resolve(fakeAudioBuffer(3)) // A (stale) finishes late
    await Promise.resolve()
    await Promise.resolve()

    expect(bridge.stats().musicStarts).toBe(1) // still just B; A never started
    expect(bridge.stats().staleMusicDiscards).toBe(1)
  })

  it("a fresh (non-stale) decode DOES start playback", async () => {
    const gate = deferred<unknown>()
    const context = makeFakeContext(() => gate.promise)
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusic("/Ultima-IV.mod", 16, 792133, 0)
    gate.resolve(fakeAudioBuffer(49.4))
    await Promise.resolve()
    await Promise.resolve()

    expect(context.sources).toHaveLength(1)
    expect(context.sources[0]!.start).toHaveBeenCalled()
    expect(context.sources[0]!.loop).toBe(true)
    expect(bridge.stats().musicStarts).toBe(1)
    expect(bridge.stats().staleMusicDiscards).toBe(0)
  })
})

describe("audio bridge: playMusicFromBytesForTest (test-only bytes-based entry, e2e generation-race support)", () => {
  it("exercises the same generation-guarded path as playMusic(): a decode resolving after stopMusic() is discarded", async () => {
    const gate = deferred<unknown>()
    const context = makeFakeContext(() => gate.promise)
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusicFromBytesForTest(new ArrayBuffer(8), 0)
    bridge.stopMusic()
    gate.resolve(fakeAudioBuffer(1))
    await Promise.resolve()
    await Promise.resolve()

    expect(context.sources).toHaveLength(0)
    expect(bridge.stats().staleMusicDiscards).toBe(1)
  })

  it("starts playback when the decode is not stale", async () => {
    const gate = deferred<unknown>()
    const context = makeFakeContext(() => gate.promise)
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusicFromBytesForTest(new ArrayBuffer(8), 0)
    gate.resolve(fakeAudioBuffer(1))
    await Promise.resolve()
    await Promise.resolve()

    expect(context.sources).toHaveLength(1)
    expect(bridge.stats().musicStarts).toBe(1)
  })
})

describe("audio bridge: fade-out guard (mirrors native's `if (currentTrack != MUSIC_NONE)`)", () => {
  it("fadeOutMusic() is a no-op when no music is playing", () => {
    const context = makeFakeContext(() => Promise.resolve(fakeAudioBuffer()))
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.fadeOutMusic(1000)

    expect(bridge.stats().musicGeneration).toBe(0) // never bumped: truly a no-op, not just "no audible effect"
  })

  it("fadeOutMusic() after playMusic() bumps the generation and stops the current source", async () => {
    const context = makeFakeContext(() => Promise.resolve(fakeAudioBuffer()))
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playMusic("/Ultima-IV.mod", 16, 100, 0)
    await Promise.resolve()
    await Promise.resolve()
    expect(context.sources).toHaveLength(1)

    bridge.fadeOutMusic(0)
    expect(bridge.stats().musicGeneration).toBeGreaterThan(0)
    expect(context.sources[0]!.stop).toHaveBeenCalled()
  })
})

describe("audio bridge: RFX effect playback (synthesized PCM, synchronous, no decode race)", () => {
  it("playEffectPcm() builds an AudioBuffer directly and starts it immediately", () => {
    const context = makeFakeContext(() => Promise.resolve(fakeAudioBuffer()))
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    const samples = new Float32Array([0.1, -0.2, 0.3, 0])
    bridge.playEffectPcm(samples, -1)

    expect(context.createBuffer).toHaveBeenCalledWith(1, samples.length, 44100)
    expect(context.sources).toHaveLength(1)
    expect(context.sources[0]!.start).toHaveBeenCalled()
    expect(bridge.stats().effectStarts).toBe(1)
  })
})

describe("audio bridge: synchronous duration lookup (soundDuration() contract)", () => {
  it("durationMs() answers from the precomputed manifest without any async work", () => {
    const context = makeFakeContext(() => Promise.resolve(fakeAudioBuffer()))
    const manifest = new Map([[16, 49400]])
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest })

    expect(bridge.durationMs(16)).toBe(49400)
    expect(bridge.durationMs(99999)).toBe(0) // unknown offset -> 0, never throws
  })
})

describe("audio bridge: suspend/resume (event.cpp's soundSuspend contract)", () => {
  it("suspend(true) suspends the context and suspend(false) resumes it", () => {
    const context = makeFakeContext(() => Promise.resolve(fakeAudioBuffer()))
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.suspend(true)
    expect(context.suspend).toHaveBeenCalled()

    bridge.suspend(false)
    expect(context.resume).toHaveBeenCalled()
  })
})

describe("audio bridge: effect stop cancels in-flight decodes", () => {
  it("stopEffects() bumps the effect generation so a late decode does not start", async () => {
    const gate = deferred<unknown>()
    const context = makeFakeContext(() => gate.promise)
    const bridge = createAudioBridge({ context, fs: fakeFs(new Uint8Array(64)), manifest: new Map() })

    bridge.playEffect("/Ultima-IV.mod", 7020497, 3768, -1)
    bridge.stopEffects()
    gate.resolve(fakeAudioBuffer(0.04))
    await Promise.resolve()
    await Promise.resolve()

    expect(context.sources).toHaveLength(0)
    expect(bridge.stats().staleEffectDiscards).toBe(1)
  })
})
