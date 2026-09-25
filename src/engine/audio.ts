// Todo 16: the TS Web Audio bridge behind vendor/xu4/src/sound_web.cpp's
// sound.h implementation. C++ owns every piece of *decision* state and
// logic sound_faun.cpp (the native Faun backend) has -- currentTrack,
// musicEnabled, volume, the volumeFades branch, the same-track guard, the
// BUFFER_MS_FAILED cache -- and calls into this module only to *execute*
// real audio actions (decode, play, stop, fade, generate) via a handful of
// EM_JS trampolines that call `Module.u4Audio.<method>(...)`. This module
// never re-derives xu4 game state; it is a thin, testable executor plus the
// one piece of state a JS-side async decode race genuinely needs: a
// generation counter per channel (see "generation cancellation" below).
//
// Why a generation counter at all, given C++ already guards its own state:
// `AudioContext.decodeAudioData()` is asynchronous, so between the moment
// sound_web.cpp fires a decode and the moment it resolves, the engine may
// have already called musicStop()/a newer musicPlay(). Without a generation
// check, that stale decode would start playing a track the game already
// considers stopped or superseded -- the plan's QA failure scenario. Each
// `playMusic()`/`playEffect()` call captures the channel's *current*
// generation; `stopMusic()`, a newer `playMusic()`, and `fadeOutMusic()`
// all bump it. When a decode resolves, it is dropped (never connected,
// never started) unless its captured generation is still current.
//
// RFX (procedurally synthesized effects) has no async gap at all --
// sound_web.cpp generates the full PCM synchronously (see its soundDuration/
// soundPlay for SOUND_UI_TICK-style entries) and hands this module already-
// decoded samples, so playEffectPcm() below needs no generation check.

import { buildAudioManifest, type AudioManifest } from "./audio-manifest.ts"

export { buildAudioManifest, type AudioManifest }

/** vendor/xu4/src/settings.h: MAX_VOLUME. Native's musicSetVolume/
 *  soundSetVolume divide the incoming 0..MAX_VOLUME integer by this to get
 *  a 0..1 float; this bridge mirrors that exactly so a given settings value
 *  sounds the same in the browser as it does natively. */
export const MAX_VOLUME = 10

/** Maps a native 0..MAX_VOLUME integer volume onto a 0..1 GainNode value,
 *  clamped defensively (C++ already clamps via xu4.settings' own bounds,
 *  but this is cheap insurance against an out-of-range value crossing the
 *  EM_JS boundary). */
export function volumeToGain(volume: number): number {
  const clamped = Math.min(Math.max(volume, 0), MAX_VOLUME)
  return clamped / MAX_VOLUME
}

export interface GenerationTracker {
  /** Advances to a new generation and returns it. */
  bump(): number
  /** The most recently bumped generation (0 before the first bump). */
  current(): number
  /** True when `generation` is not the latest one bumped. */
  isStale(generation: number): boolean
}

/** A monotonic per-channel counter used to detect a stale async decode --
 *  see this file's module doc comment. Deliberately dependency-free and
 *  synchronous so it is trivial to unit-test in isolation. */
export function createGenerationTracker(): GenerationTracker {
  let generation = 0
  return {
    bump(): number {
      generation += 1
      return generation
    },
    current(): number {
      return generation
    },
    isStale(candidate: number): boolean {
      return candidate !== generation
    }
  }
}

// ---------------------------------------------------------------------
// Minimal structural Web Audio surface. Real `AudioContext`/`GainNode`/
// `AudioBufferSourceNode`/`AudioBuffer` all satisfy these; tests supply
// plain fakes instead of touching a real AudioContext (jsdom/Vitest have
// none, and even a real one can't be driven deterministically for the
// generation-race scenario).
// ---------------------------------------------------------------------

export interface AudioParamLike {
  value: number
  setValueAtTime(value: number, time: number): void
  linearRampToValueAtTime(value: number, time: number): void
}

export interface GainNodeLike {
  readonly gain: AudioParamLike
  connect(destination: unknown): void
  disconnect(): void
}

export interface AudioBufferLike {
  readonly duration: number
  readonly length: number
  copyToChannel?(data: Float32Array, channelNumber: number): void
}

export interface AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null
  loop: boolean
  connect(destination: unknown): void
  disconnect(): void
  start(when?: number): void
  stop(when?: number): void
}

export type AudioContextStateLike = "suspended" | "running" | "closed"

export interface AudioContextLike {
  readonly state: AudioContextStateLike
  readonly currentTime: number
  readonly destination: unknown
  resume(): Promise<void>
  suspend(): Promise<void>
  createGain(): GainNodeLike
  createBufferSource(): AudioBufferSourceNodeLike
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
}

/** The slice of Emscripten's FS API this bridge needs to read audio bytes
 *  out of the already-mounted module file (Ultima-IV.mod / U4-Upgrade.mod)
 *  -- the exact same file+offset+bytes native code reads via
 *  Config::modulePath()/CDIEntry. See src/engine/persistence.ts's
 *  PersistenceFS for the sibling interface this mirrors. */
export interface AudioBridgeFS {
  readFile(path: string): Uint8Array
}

export interface AudioBridgeDeps {
  readonly context: AudioContextLike
  readonly fs: AudioBridgeFS
  /** Precomputed via buildAudioManifest() before callMain(); see
   *  src/engine/audio-manifest.ts's module doc comment. */
  readonly manifest: AudioManifest
}

export interface AudioBridgeStats {
  readonly contextState: AudioContextStateLike
  readonly musicGeneration: number
  readonly effectGeneration: number
  readonly staleMusicDiscards: number
  readonly staleEffectDiscards: number
  readonly musicStarts: number
  readonly effectStarts: number
  readonly lastMusicDurationSec: number | null
  readonly lastEffectDurationSec: number | null
}

/** The C-ABI-shaped surface vendor/xu4/src/sound_web.cpp's EM_JS
 *  trampolines call through `Module.u4Audio`. See that file's header
 *  comment for the exact EM_JS call sites. */
export interface AudioBridge {
  durationMs(offset: number): number
  playEffect(path: string, offset: number, bytes: number, limitMs: number): void
  playEffectPcm(samples: Float32Array, limitMs: number): void
  stopEffects(): void
  setEffectVolume(volume: number): void
  playMusic(path: string, offset: number, bytes: number, fadeInMs: number): void
  stopMusic(): void
  fadeOutMusic(fadeMs: number): void
  setMusicVolume(volume: number): void
  suspend(halt: boolean): void
  /** Observability for e2e/manual QA (window.ultimaAudio.stats()); never
   *  consulted by any decision logic in this module. */
  stats(): AudioBridgeStats
  /**
   * Test-only: exercises the exact same generation-guarded decode-then-
   * start path as playMusic(), given raw bytes directly instead of an FS
   * path/offset/bytes triple. Exists so e2e/manual QA can deterministically
   * reproduce the plan's "stale decode must not restart stopped music" race
   * (tests/e2e/audio.spec.ts) without needing to know the real engine's
   * internal FS path string for the module file. Never called by
   * sound_web.cpp's EM_JS trampolines.
   */
  playMusicFromBytesForTest(data: ArrayBuffer, fadeInMs: number): void
}

function safeStop(source: AudioBufferSourceNodeLike | null): void {
  if (source === null) {
    return
  }
  try {
    source.stop()
  } catch {
    // Already stopped/ended -- Web Audio throws InvalidStateError for a
    // double stop() call; this bridge only ever calls it defensively.
  }
  source.disconnect()
}

/**
 * Builds the bridge object attached to `Module.u4Audio` (see
 * src/engine/startup.ts). Every method here is intentionally "dumb": it
 * executes exactly what it is told, with only the generation-cancellation
 * and fade/volume bookkeeping a real audio backend needs to not glitch --
 * all higher-level xu4 decisions (is this the same track already playing,
 * is music enabled, what does the current settings volume map to) are made
 * once, in C++, exactly like every native sound.h backend.
 */
export function createAudioBridge(deps: AudioBridgeDeps): AudioBridge {
  const { context, fs, manifest } = deps
  const musicGeneration = createGenerationTracker()
  const effectGeneration = createGenerationTracker()

  const musicGain = context.createGain()
  const effectGain = context.createGain()
  musicGain.connect(context.destination)
  effectGain.connect(context.destination)

  const moduleBytesCache = new Map<string, Uint8Array>()
  function moduleBytes(path: string): Uint8Array {
    let bytes = moduleBytesCache.get(path)
    if (bytes === undefined) {
      bytes = fs.readFile(path)
      moduleBytesCache.set(path, bytes)
    }
    return bytes
  }
  /** A fresh, independently-owned copy: decodeAudioData() detaches its
   *  input ArrayBuffer, so this must never be a view into FS-owned memory
   *  (nor, for the wasm heap specifically, into the wasm heap itself --
   *  memory growth can move it). */
  function readChunkCopy(path: string, offset: number, bytes: number): Uint8Array {
    return moduleBytes(path).slice(offset, offset + bytes)
  }

  let currentMusicSource: AudioBufferSourceNodeLike | null = null
  /** JS-local "is anything audibly active" guard -- independent of, and in
   *  addition to, C++'s own currentTrack guard: this bridge must not
   *  schedule a fade/stop against a channel it never started, regardless
   *  of what called it or why. */
  let musicActive = false

  let staleMusicDiscards = 0
  let staleEffectDiscards = 0
  let musicStarts = 0
  let effectStarts = 0
  let lastMusicDurationSec: number | null = null
  let lastEffectDurationSec: number | null = null

  function scheduleFadeAndStop(gain: GainNodeLike, source: AudioBufferSourceNodeLike, fadeMs: number): void {
    const now = context.currentTime
    const target = Math.max(fadeMs, 0) / 1000
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + target)
    if (fadeMs > 0) {
      setTimeout(() => safeStop(source), fadeMs)
    } else {
      safeStop(source)
    }
  }

  /**
   * The generation-guarded decode-then-start logic shared by playMusic()
   * (real FS-backed bytes) and playMusicFromBytesForTest() (bytes supplied
   * directly, so e2e/manual QA can exercise this exact race -- a decode
   * that resolves after the music was already stopped or superseded --
   * without needing to know the real engine's internal FS path string).
   * See this file's module doc comment for why the generation check
   * exists at all.
   */
  function decodeAndStartMusic(data: ArrayBuffer, fadeInMs: number): void {
    const generation = musicGeneration.bump()
    void context.decodeAudioData(data).then(
      (buffer) => {
        if (musicGeneration.isStale(generation)) {
          staleMusicDiscards += 1
          return
        }
        safeStop(currentMusicSource)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(musicGain)
        if (fadeInMs > 0) {
          const now = context.currentTime
          musicGain.gain.setValueAtTime(0, now)
          musicGain.gain.linearRampToValueAtTime(1, now + fadeInMs / 1000)
        } else {
          musicGain.gain.setValueAtTime(musicGain.gain.value, context.currentTime)
        }
        source.start()
        currentMusicSource = source
        lastMusicDurationSec = buffer.duration
        musicStarts += 1
      },
      () => {
        // Decode failure: nothing to play. Leave musicActive as-is only
        // if a newer call has since taken over; otherwise there is
        // nothing audible, matching native's "load failed, don't retry"
        // (BUFFER_MS_FAILED) spirit at the manifest level.
        if (!musicGeneration.isStale(generation)) {
          musicActive = false
        }
      }
    )
  }

  return {
    durationMs(offset: number): number {
      return manifest.get(offset) ?? 0
    },

    playMusic(path, offset, bytes, fadeInMs) {
      musicActive = true
      const chunk = readChunkCopy(path, offset, bytes)
      decodeAndStartMusic(chunk.buffer as ArrayBuffer, fadeInMs)
    },

    playMusicFromBytesForTest(data, fadeInMs) {
      musicActive = true
      decodeAndStartMusic(data, fadeInMs)
    },

    stopMusic() {
      musicGeneration.bump()
      musicActive = false
      safeStop(currentMusicSource)
      currentMusicSource = null
    },

    fadeOutMusic(fadeMs) {
      if (!musicActive) {
        return // mirrors native musicFadeOut's `if (currentTrack != MUSIC_NONE)` guard
      }
      musicGeneration.bump()
      musicActive = false
      const source = currentMusicSource
      currentMusicSource = null
      if (source !== null) {
        scheduleFadeAndStop(musicGain, source, fadeMs)
      }
    },

    setMusicVolume(volume) {
      musicGain.gain.value = volumeToGain(volume)
    },

    playEffect(path, offset, bytes, limitMs) {
      const generation = effectGeneration.bump()
      const chunk = readChunkCopy(path, offset, bytes)
      void context.decodeAudioData(chunk.buffer as ArrayBuffer).then(
        (buffer) => {
          if (effectGeneration.isStale(generation)) {
            staleEffectDiscards += 1
            return
          }
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(effectGain)
          source.start()
          if (limitMs > 0) {
            setTimeout(() => safeStop(source), limitMs)
          }
          lastEffectDurationSec = buffer.duration
          effectStarts += 1
        },
        () => {
          /* decode failure: nothing to play, nothing to clean up */
        }
      )
    },

    playEffectPcm(samples, limitMs) {
      // RFX: sound_web.cpp already generated real PCM (sfx_gen.c,
      // synchronously) -- build the AudioBuffer directly, no decode step
      // and therefore no generation race is possible here.
      const buffer = context.createBuffer(1, samples.length, 44100)
      if (typeof buffer.copyToChannel === "function") {
        buffer.copyToChannel(samples, 0)
      }
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(effectGain)
      source.start()
      if (limitMs > 0) {
        setTimeout(() => safeStop(source), limitMs)
      }
      lastEffectDurationSec = buffer.duration
      effectStarts += 1
    },

    stopEffects() {
      // Bumping invalidates any effect still decoding; already-started
      // one-shot effect sources are left to end on their own (they are not
      // individually tracked, matching Faun's own fire-and-forget model).
      effectGeneration.bump()
    },

    setEffectVolume(volume) {
      effectGain.gain.value = volumeToGain(volume)
    },

    suspend(halt) {
      if (halt) {
        void context.suspend()
      } else {
        void context.resume()
      }
    },

    stats(): AudioBridgeStats {
      return {
        contextState: context.state,
        musicGeneration: musicGeneration.current(),
        effectGeneration: effectGeneration.current(),
        staleMusicDiscards,
        staleEffectDiscards,
        musicStarts,
        effectStarts,
        lastMusicDurationSec,
        lastEffectDurationSec
      }
    }
  }
}

// ---------------------------------------------------------------------
// Real AudioContext singleton + unlock (browser-only; startEngine() calls
// unlockAudioContext() before callMain(), and src/main.ts arms a fallback
// resume-on-gesture listener since a synthetic file-input change event is
// not guaranteed to count as user activation for the autoplay policy).
// ---------------------------------------------------------------------

let singletonContext: AudioContext | null = null

function AudioContextConstructor(): (new () => AudioContext) | undefined {
  const w = globalThis as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext }
  return w.AudioContext ?? w.webkitAudioContext
}

/** Returns the shared AudioContext, creating it on first use. Returns null
 *  in an environment with no Web Audio support at all (test runners, some
 *  older browsers) -- callers must treat that as "no audio", never throw. */
export function getAudioContext(): AudioContext | null {
  if (singletonContext !== null) {
    return singletonContext
  }
  const Ctor = AudioContextConstructor()
  if (Ctor === undefined) {
    return null
  }
  singletonContext = new Ctor()
  return singletonContext
}

/** Best-effort: resumes the shared AudioContext if it exists and is
 *  suspended. Never throws (autoplay policy rejection, no gesture yet, and
 *  "no Web Audio at all" are all just "still locked/unavailable"). */
export async function unlockAudioContext(): Promise<void> {
  const ctx = getAudioContext()
  if (ctx === null || ctx.state !== "suspended") {
    return
  }
  try {
    await ctx.resume()
  } catch {
    // Autoplay policy: no user gesture yet. armAutoResumeOnGesture() below
    // retries on the first real gesture the page receives.
  }
}

let gestureListenerArmed = false

/** Arms a one-shot retry: the first pointerdown/keydown/click the document
 *  receives after this call also (best-effort) resumes the shared
 *  AudioContext. Safe to call more than once (arms at most one listener
 *  set). Browsers only grant Web Audio unlock on a real user gesture, and
 *  the gesture that starts engine boot (selecting a ROM file) is not
 *  guaranteed to count as one. */
export function armAutoResumeOnGesture(): void {
  if (gestureListenerArmed || typeof document === "undefined") {
    return
  }
  gestureListenerArmed = true
  const retry = () => {
    void unlockAudioContext()
  }
  for (const type of ["pointerdown", "keydown", "click"] as const) {
    document.addEventListener(type, retry, { once: true })
  }
}

/** Test-only: drops the shared AudioContext and gesture-listener state so
 *  each test starts from a clean slate. Never called from production code. */
export function resetAudioForTest(): void {
  singletonContext = null
  gestureListenerArmed = false
}
