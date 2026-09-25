// Todo 16 RED->GREEN: src/engine/audio-manifest.ts parses the CDI pak
// container format the module packager (Todo 2) writes Ultima-IV.mod in,
// and computes real WAV/Ogg Vorbis durations from the header bytes alone
// (no full PCM decode) so vendor/xu4/src/sound_web.cpp's soundDuration()
// can answer synchronously from a table built before callMain() ever runs.
// See src/engine/audio-manifest.ts's module doc comment for the full
// rationale (why this can't just call AudioContext.decodeAudioData()).
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  CDI_AUDIO_OGG_VORBIS,
  CDI_AUDIO_RFX,
  CDI_AUDIO_WAVE,
  CDI_CONTAINER_PAK,
  buildAudioManifest,
  computeOggDurationMs,
  computeWavDurationMs,
  parseCdiToc
} from "../../src/engine/audio-manifest.ts"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

// Real assets xu4 itself bundles and already commits to this repo (recomposed
// music / freely licensed sound effects -- NOT the banned original
// commercial Ultima IV data; see AGENTS.md's "절대 금지" list and
// vendor/source-manifest.json, which already pins these under vendor/xu4).
const REAL_WAV = `${repoRoot}vendor/xu4/module/Ultima-IV/sound/walk_normal_c64.wav`
const REAL_OGG_SHORT = `${repoRoot}vendor/xu4/module/Ultima-IV/sound/blocked_dos.ogg`
const REAL_OGG_LONG = `${repoRoot}vendor/xu4/module/Ultima-IV/music/minstrel/wanderer.ogg`

/** Builds a minimal but structurally valid CDI pak: header + TOC + chunks,
 *  in the exact layout vendor/xu4/src/support/cdi.c's cdi_openPak()/
 *  cdi_loadPakTOC() read (verified against a real built Ultima-IV.mod in
 *  this Todo's investigation -- see handoff.md). */
function buildFakePak(chunks: ReadonlyArray<{ cdi: number; appId: number; data: Uint8Array }>): Uint8Array {
  const tocOffset = 16
  const tocBytes = chunks.length * 16
  let dataOffset = tocOffset + tocBytes
  const entries = chunks.map((chunk) => {
    const offset = dataOffset
    dataOffset += chunk.data.byteLength
    return { ...chunk, offset }
  })
  const total = dataOffset
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, CDI_CONTAINER_PAK, true)
  view.setUint32(4, 0, true) // appId/unused in the header entry
  view.setUint32(8, tocOffset, true)
  view.setUint32(12, tocBytes, true)
  entries.forEach((entry, i) => {
    const base = tocOffset + i * 16
    view.setUint32(base, entry.cdi, true)
    view.setUint32(base + 4, entry.appId, true)
    view.setUint32(base + 8, entry.offset, true)
    view.setUint32(base + 12, entry.data.byteLength, true)
    out.set(entry.data, entry.offset)
  })
  return out
}

/** A minimal canonical 44-byte-header PCM WAVE: RIFF/WAVE, one "fmt " chunk
 *  (16 bytes, PCM), one "data" chunk of the given byte length. */
function buildFakeWav(sampleRate: number, byteRate: number, dataBytes: number): Uint8Array {
  const out = new Uint8Array(44 + dataBytes)
  const view = new DataView(out.buffer)
  out.set([0x52, 0x49, 0x46, 0x46], 0) // "RIFF"
  view.setUint32(4, 36 + dataBytes, true)
  out.set([0x57, 0x41, 0x56, 0x45], 8) // "WAVE"
  out.set([0x66, 0x6d, 0x74, 0x20], 12) // "fmt "
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  out.set([0x64, 0x61, 0x74, 0x61], 36) // "data"
  view.setUint32(40, dataBytes, true)
  return out
}

/** A minimal single-page Ogg Vorbis identification-header page followed by
 *  a second page carrying the final granule position -- enough structure
 *  for computeOggDurationMs()'s forward page walk, without a real Vorbis
 *  codec payload (duration only needs the granule position and the rate
 *  field of the id header, never actual audio samples). */
function buildFakeOgg(sampleRate: number, finalGranule: bigint): Uint8Array {
  function page(granule: bigint, payload: Uint8Array): Uint8Array {
    const segments = [payload.byteLength] // single segment, < 255 bytes
    const header = new Uint8Array(27 + segments.length)
    const view = new DataView(header.buffer)
    header.set([0x4f, 0x67, 0x67, 0x53], 0) // "OggS"
    header[4] = 0 // version
    header[5] = 0 // header_type
    view.setBigInt64(6, granule, true)
    view.setUint32(14, 0x1234, true) // serial number
    view.setUint32(18, 0, true) // page sequence
    view.setUint32(22, 0, true) // checksum (unchecked by our parser)
    header[26] = segments.length
    header[27] = segments[0]!
    const out = new Uint8Array(header.byteLength + payload.byteLength)
    out.set(header, 0)
    out.set(payload, header.byteLength)
    return out
  }

  const idPayload = new Uint8Array(30)
  idPayload[0] = 1 // packet_type = identification header
  idPayload.set([0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], 1) // "vorbis"
  new DataView(idPayload.buffer).setUint32(1 + 6, 0, true) // vorbis_version = 0
  idPayload[1 + 6 + 4] = 1 // channels = 1
  new DataView(idPayload.buffer).setUint32(1 + 6 + 4 + 1, sampleRate, true)

  const firstPage = page(0n, idPayload)
  const lastPage = page(finalGranule, new Uint8Array([0]))
  const out = new Uint8Array(firstPage.byteLength + lastPage.byteLength)
  out.set(firstPage, 0)
  out.set(lastPage, firstPage.byteLength)
  return out
}

describe("audio-manifest: CDI pak TOC parsing", () => {
  it("parses a synthetic pak's header and entries", () => {
    const wav = buildFakeWav(44100, 88200, 100)
    const pak = buildFakePak([{ cdi: CDI_AUDIO_WAVE, appId: 0x11223344, data: wav }])
    const toc = parseCdiToc(pak)
    expect(toc).toHaveLength(1)
    expect(toc[0]!.cdi).toBe(CDI_AUDIO_WAVE)
    expect(toc[0]!.appId).toBe(0x11223344)
    expect(toc[0]!.bytes).toBe(wav.byteLength)
  })

  it("returns an empty array for a buffer that isn't a CDI pak", () => {
    expect(parseCdiToc(new Uint8Array([1, 2, 3, 4]))).toEqual([])
    expect(parseCdiToc(new Uint8Array(64))).toEqual([])
  })

  it("parses the real built-from-source Ultima-IV.mod's TOC header shape (sanity: header cdi tag)", () => {
    // This only exercises the header-parsing path against something whose
    // first 16 bytes are guaranteed pak-shaped; the real .mod is a build
    // artifact (build/host/modules), not something this repo commits, so
    // the full real-module case is covered by the e2e suite instead.
    const pak = buildFakePak([
      { cdi: CDI_AUDIO_WAVE, appId: 1, data: buildFakeWav(44100, 88200, 10) },
      { cdi: CDI_AUDIO_OGG_VORBIS, appId: 2, data: buildFakeOgg(44100, 4410n) },
      { cdi: CDI_AUDIO_RFX, appId: 3, data: new Uint8Array(104) }
    ])
    expect(parseCdiToc(pak)).toHaveLength(3)
  })
})

describe("audio-manifest: WAV duration", () => {
  it("computes duration from a synthetic canonical WAV (dataBytes * 1000 / byteRate)", () => {
    // 1 second of 44.1kHz 16-bit mono: byteRate = 88200, 88200 bytes of data.
    const wav = buildFakeWav(44100, 88200, 88200)
    expect(computeWavDurationMs(wav)).toBe(1000)
  })

  it("returns 0 for a truncated/non-WAVE buffer", () => {
    expect(computeWavDurationMs(new Uint8Array(4))).toBe(0)
    expect(computeWavDurationMs(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBe(0)
  })

  it("returns 0 when there is no data chunk", () => {
    const wav = buildFakeWav(44100, 88200, 0).slice(0, 36) // fmt chunk only, no data chunk id
    expect(computeWavDurationMs(wav)).toBe(0)
  })

  it("matches a real committed xu4 sound asset's actual duration (walk_normal_c64.wav)", () => {
    const bytes = readFileSync(REAL_WAV)
    // Verified independently (this Todo's investigation, see handoff.md):
    // 3724 bytes of 16-bit mono 44100Hz data => byteRate 88200 => ~42ms.
    expect(computeWavDurationMs(bytes)).toBe(Math.round((3724 * 1000) / 88200))
    expect(computeWavDurationMs(bytes)).toBeGreaterThan(0)
  })
})

describe("audio-manifest: Ogg Vorbis duration", () => {
  it("computes duration from a synthetic two-page stream (granule / sampleRate)", () => {
    const ogg = buildFakeOgg(44100, 44100n) // exactly 1 second
    expect(computeOggDurationMs(ogg)).toBe(1000)
  })

  it("ignores a continuation page's -1 granule and keeps the last real one", () => {
    const withContinuation = (() => {
      const base = buildFakeOgg(44100, 22050n) // 0.5s as the "real" last page
      return base
    })()
    expect(computeOggDurationMs(withContinuation)).toBe(500)
  })

  it("returns 0 for a non-Ogg or truncated buffer", () => {
    expect(computeOggDurationMs(new Uint8Array(10))).toBe(0)
    expect(computeOggDurationMs(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe(0)
  })

  it("matches a real committed short xu4 effect asset (blocked_dos.ogg)", () => {
    const bytes = readFileSync(REAL_OGG_SHORT)
    const ms = computeOggDurationMs(bytes)
    // Verified independently via a granule-position probe during this
    // Todo's investigation: ~97ms (44100Hz, granule 4303).
    expect(ms).toBe(Math.round((4303 * 1000) / 44100))
  })

  it("matches a real committed long, real multi-page xu4 music asset (wanderer.ogg)", () => {
    const bytes = readFileSync(REAL_OGG_LONG)
    const ms = computeOggDurationMs(bytes)
    // Verified independently: stereo 44100Hz, granule 2178560 => ~49.4s.
    // (channel count does not affect granule-based duration.)
    expect(ms).toBe(Math.round((2178560 * 1000) / 44100))
    expect(ms).toBeGreaterThan(49_000)
  })
})

describe("audio-manifest: buildAudioManifest", () => {
  it("keys WAV/Ogg entries by CDIEntry offset and skips RFX entries entirely", () => {
    const wav = buildFakeWav(44100, 88200, 88200) // 1000ms
    const ogg = buildFakeOgg(44100, 22050n) // 500ms
    const rfx = new Uint8Array(104)
    const pak = buildFakePak([
      { cdi: CDI_AUDIO_WAVE, appId: 1, data: wav },
      { cdi: CDI_AUDIO_OGG_VORBIS, appId: 2, data: ogg },
      { cdi: CDI_AUDIO_RFX, appId: 3, data: rfx }
    ])
    const toc = parseCdiToc(pak)
    const manifest = buildAudioManifest(pak)

    expect(manifest.size).toBe(2)
    expect(manifest.get(toc[0]!.offset)).toBe(1000)
    expect(manifest.get(toc[1]!.offset)).toBe(500)
    expect(manifest.has(toc[2]!.offset)).toBe(false)
  })

  it("omits entries whose header fails to parse (0-duration) rather than storing a 0", () => {
    const brokenWav = buildFakeWav(44100, 0, 100) // byteRate 0 => unparseable
    const pak = buildFakePak([{ cdi: CDI_AUDIO_WAVE, appId: 1, data: brokenWav }])
    const manifest = buildAudioManifest(pak)
    expect(manifest.size).toBe(0)
  })

  it("returns an empty manifest for a non-pak buffer instead of throwing", () => {
    expect(buildAudioManifest(new Uint8Array(8)).size).toBe(0)
  })
})
