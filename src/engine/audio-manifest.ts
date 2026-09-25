// Todo 16: pure, dependency-free parsers for the CDI container format the
// module packager (Todo 2, vendor/xu4/tools/pack-xu4.b) writes Ultima-IV.mod
// / U4-Upgrade.mod in, plus the two audio container formats it embeds
// byte-for-byte (verified empirically against a real built Ultima-IV.mod:
// each CDIEntry's [offset, offset+bytes) range is an exact copy of the
// original .ogg/.wav asset file under vendor/xu4/module/Ultima-IV/{music,
// sound}/ -- no compression, no extra wrapping).
//
// Why this exists: vendor/xu4/src/sound_web.cpp's soundDuration() must be a
// SYNCHRONOUS call (see sound.h's contract and every native backend's
// bufferMs[] cache), but the browser's only real audio decoder
// (AudioContext.decodeAudioData) is asynchronous. Rather than reimplement
// WAV/Ogg parsing a second time in C++ (a second place for the two
// implementations to silently disagree), this module parses the *headers
// only* (not the compressed audio payload) synchronously in TypeScript,
// during startEngine()'s setup -- before callMain() ever runs -- and
// src/engine/audio.ts's bridge answers sound_web.cpp's synchronous
// `u4_web_audio_duration_ms(offset)` EM_JS call from this precomputed table
// (keyed by CDIEntry offset, which is unique within one module file).
//
// RFX (procedurally synthesized) sound effects are deliberately NOT covered
// here: an RFX entry has no stored duration at all (sfx_gen.c's
// sfx_generateWave() *is* the only way to learn how many samples a given
// SfxParams blob produces), so sound_web.cpp answers those durations itself,
// synchronously, by generating once and caching -- see that file's
// soundDuration() for the RFX branch.

/** Builds a CDI32 tag/appId the same way vendor/xu4/src/support/cdi.h's
 *  CDI32() macro does on a little-endian target (this project only ships to
 *  little-endian wasm and browsers, so the header's big-endian branch is
 *  irrelevant here). */
function cdi32(a: number, b: number, c: number, d: number): number {
  return (a | (b << 8) | (c << 16) | (d << 24)) >>> 0
}

/** vendor/xu4/src/support/cdi.h: DA7A_CONTAINER_CDI_PAK */
export const CDI_CONTAINER_PAK = cdi32(0xda, 0x7a, 0x70, 0x00)
/** vendor/xu4/src/support/cdi.h: DA7A_AUDIO_WAVE */
export const CDI_AUDIO_WAVE = cdi32(0xda, 0x7a, 0x20, 0x06)
/** vendor/xu4/src/support/cdi.h: DA7A_AUDIO_OGG_VORBIS */
export const CDI_AUDIO_OGG_VORBIS = cdi32(0xda, 0x7a, 0x20, 0x08)
/** vendor/xu4/src/support/cdi.h: DA7A_AUDIO_RFX */
export const CDI_AUDIO_RFX = cdi32(0xda, 0x7a, 0x20, 0x30)

export interface CdiTocEntry {
  readonly cdi: number
  readonly appId: number
  readonly offset: number
  readonly bytes: number
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

/**
 * Parses a CDI pak's table of contents (the same layout
 * vendor/xu4/src/support/cdi.c's cdi_openPak()/cdi_loadPakTOC() read): a
 * 16-byte header CDIEntry (cdi, appId, tocOffset, tocBytes) followed
 * elsewhere in the file by tocBytes/16 more CDIEntry records. Returns an
 * empty array for anything that isn't a valid CDI pak header, rather than
 * throwing -- callers treat "no entries" and "not a pak" identically.
 */
export function parseCdiToc(input: ArrayBuffer | Uint8Array): CdiTocEntry[] {
  const bytes = toUint8Array(input)
  if (bytes.byteLength < 16) {
    return []
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerCdi = view.getUint32(0, true)
  if (headerCdi !== CDI_CONTAINER_PAK) {
    return []
  }
  const tocOffset = view.getUint32(8, true)
  const tocBytes = view.getUint32(12, true)
  const count = Math.floor(tocBytes / 16)
  const entries: CdiTocEntry[] = []
  for (let i = 0; i < count; i++) {
    const base = tocOffset + i * 16
    if (base + 16 > bytes.byteLength) {
      break
    }
    entries.push({
      cdi: view.getUint32(base, true),
      appId: view.getUint32(base + 4, true),
      offset: view.getUint32(base + 8, true),
      bytes: view.getUint32(base + 12, true)
    })
  }
  return entries
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.byteLength) {
    return ""
  }
  let out = ""
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i]!)
  }
  return out
}

/**
 * RIFF/WAVE duration in milliseconds: walks chunks looking for "fmt " (to
 * read byteRate) then "data" (to read the payload size), exactly the
 * standard `dataBytes * 1000 / byteRate` computation. Returns 0 for
 * anything that isn't a well-formed canonical WAVE (missing chunks,
 * truncated, zero byteRate) -- callers treat 0 as "unknown/failed", mirroring
 * every native sound.h backend's BUFFER_MS_FAILED convention.
 */
export function computeWavDurationMs(input: ArrayBuffer | Uint8Array): number {
  const bytes = toUint8Array(input)
  if (bytes.byteLength < 12 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") {
    return 0
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 12
  let byteRate = 0
  while (pos + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, pos, 4)
    const chunkSize = view.getUint32(pos + 4, true)
    if (chunkId === "fmt " && pos + 16 + 4 <= bytes.byteLength) {
      // chunk data: audioFormat(2) channels(2) sampleRate(4) byteRate(4) ...
      byteRate = view.getUint32(pos + 8 + 8, true)
    } else if (chunkId === "data") {
      if (byteRate <= 0) {
        return 0
      }
      return Math.round((chunkSize * 1000) / byteRate)
    }
    const advance = 8 + chunkSize + (chunkSize & 1)
    if (advance <= 0) {
      return 0
    }
    pos += advance
  }
  return 0
}

/**
 * Ogg Vorbis duration in milliseconds: walks pages forward from the start
 * (each page's exact byte length is computable from its own header, so this
 * never mistakes payload bytes for a page header the way a raw "search for
 * OggS" scan could) until the byte range is exhausted, reading the sample
 * rate from the first page's identification header and the duration from
 * the last page's granule position (the standard technique -- granule
 * position on a Vorbis stream *is* the total decoded sample count at that
 * point). Returns 0 for anything malformed or not Ogg.
 */
export function computeOggDurationMs(input: ArrayBuffer | Uint8Array): number {
  const bytes = toUint8Array(input)
  if (bytes.byteLength < 27 || readAscii(bytes, 0, 4) !== "OggS") {
    return 0
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let pos = 0
  let sampleRate = 0
  let lastGranule = -1n
  let firstPage = true
  while (pos + 27 <= bytes.byteLength && readAscii(bytes, pos, 4) === "OggS") {
    const granule = view.getBigInt64(pos + 6, true)
    const segmentCount = bytes[pos + 26]!
    const headerLength = 27 + segmentCount
    if (pos + headerLength > bytes.byteLength) {
      break
    }
    let bodyLength = 0
    for (let i = 0; i < segmentCount; i++) {
      bodyLength += bytes[pos + 27 + i]!
    }
    const payloadOffset = pos + headerLength
    if (firstPage) {
      // Vorbis identification header packet: packet_type(1) "vorbis"(6)
      // vorbis_version(4) audio_channels(1) audio_sample_rate(4) ...
      if (payloadOffset + 16 <= bytes.byteLength) {
        sampleRate = view.getUint32(payloadOffset + 12, true)
      }
      firstPage = false
    }
    // -1 (all bits set) marks a page with no new sample boundary
    // (a packet continued from the previous page); it is never the real
    // total and must not overwrite a previously seen valid granule.
    if (granule >= 0n) {
      lastGranule = granule
    }
    pos = payloadOffset + bodyLength
  }
  if (sampleRate <= 0 || lastGranule < 0n) {
    return 0
  }
  // Round to nearest millisecond (BigInt division truncates toward zero),
  // matching computeWavDurationMs()'s Math.round() convention.
  const rateBig = BigInt(sampleRate)
  return Number((lastGranule * 1000n + rateBig / 2n) / rateBig)
}

/** offset (within the module file) -> precomputed duration in milliseconds. */
export type AudioManifest = ReadonlyMap<number, number>

/**
 * Builds the full offset->durationMs table for one module file's WAV/Ogg
 * audio entries (RFX entries are skipped -- see this file's module doc
 * comment). Keyed by CDIEntry.offset rather than by Sound/MusicTrack id or
 * appId: offsets are unique within a single module file and this table
 * only ever needs to answer "how long is the asset at this exact byte
 * range", which is exactly what sound_web.cpp already has in hand (it reads
 * the same CDIEntry to get the offset it passes across the EM_JS boundary).
 */
export function buildAudioManifest(gameModuleBytes: ArrayBuffer | Uint8Array): AudioManifest {
  const bytes = toUint8Array(gameModuleBytes)
  const manifest = new Map<number, number>()
  for (const entry of parseCdiToc(bytes)) {
    if (entry.offset + entry.bytes > bytes.byteLength) {
      continue
    }
    const chunk = bytes.subarray(entry.offset, entry.offset + entry.bytes)
    let durationMs = 0
    if (entry.cdi === CDI_AUDIO_WAVE) {
      durationMs = computeWavDurationMs(chunk)
    } else if (entry.cdi === CDI_AUDIO_OGG_VORBIS) {
      durationMs = computeOggDurationMs(chunk)
    } else {
      continue
    }
    if (durationMs > 0) {
      manifest.set(entry.offset, durationMs)
    }
  }
  return manifest
}
