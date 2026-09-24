// Pure-browser ZIP central-directory reader + original-data validator.
//
// This exists because the browser has no `unzip` binary (unlike this
// project's Node-side tooling, e.g. scripts/lib/zip-extract.mjs, which
// shells out to it). We only ever need entry *names* here -- listing and
// presence-checking, never decompression -- so this reads exactly the ZIP
// End Of Central Directory record + Central Directory File Headers and
// nothing else. No new npm dependency, no bundled decompressor.
//
// This module never touches real Ultima IV data at build/commit time: it
// only runs against a *user-selected* File's bytes, at runtime, in the
// browser (see src/engine/startup.ts).

/** One entry's name as read from a ZIP's central directory. */
export interface ZipEntry {
  readonly name: string
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const EOCD_MIN_SIZE = 22
const EOCD_MAX_COMMENT = 65535

function findEndOfCentralDirectory(view: DataView): number {
  const maxScan = Math.min(view.byteLength, EOCD_MIN_SIZE + EOCD_MAX_COMMENT)
  for (let offset = view.byteLength - EOCD_MIN_SIZE; offset >= view.byteLength - maxScan && offset >= 0; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      return offset
    }
  }
  throw new Error("corrupted ZIP archive: end-of-central-directory record not found")
}

/**
 * Reads every entry name out of a ZIP archive's central directory. Throws
 * (never returns a partial/best-effort result) if the EOCD record is
 * missing, the declared entry count doesn't match what's actually there,
 * or a central directory record's signature is wrong -- all of which mean
 * the archive is corrupted or truncated.
 */
export function parseZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer)
  const eocdOffset = findEndOfCentralDirectory(view)
  const entryCount = view.getUint16(eocdOffset + 10, true)
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)

  if (centralDirectoryOffset + centralDirectorySize > eocdOffset) {
    throw new Error("corrupted ZIP archive: central directory does not fit before end-of-central-directory record")
  }

  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset
  const decoder = new TextDecoder("utf-8")

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > eocdOffset) {
      throw new Error(
        `corrupted ZIP archive: central directory record ${i} runs past the declared central directory region`
      )
    }
    const signature = view.getUint32(offset, true)
    if (signature !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(
        `corrupted ZIP archive: central directory record ${i} has an invalid signature (expected 0x02014b50, got 0x${signature.toString(16)})`
      )
    }
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameBytes = new Uint8Array(buffer, offset + 46, nameLength)
    entries.push({ name: decoder.decode(nameBytes) })
    offset += 46 + nameLength + extraLength + commentLength
  }

  if (entries.length !== entryCount) {
    throw new Error(
      `corrupted ZIP archive: central directory declared ${entryCount} entries but only ${entries.length} were readable`
    )
  }

  return entries
}

/**
 * Required entries for a real Ultima IV DOS data archive: the 16 town/
 * dungeon-map dialogue files (one .TLK per map, per
 * scripts/i18n-inventory.mjs's TLK_MAPS) plus the world map, tile shapes,
 * and the two binary-string-table executables. Duplicated (not imported)
 * from the Node-side i18n tooling deliberately: that tooling is Node-only
 * (uses node:child_process) and must never be bundled into the browser.
 */
const TLK_MAPS = [
  "BRITAIN", "COVE", "DEN", "EMPATH", "JHELOM", "LCB", "LYCAEUM", "MAGINCIA",
  "MINOC", "MOONGLOW", "PAWS", "SERPENT", "SKARA", "TRINSIC", "VESPER", "YEW"
] as const

export const REQUIRED_ULTIMA4_ENTRIES: readonly string[] = [
  ...TLK_MAPS.map((map) => `${map}.TLK`),
  "WORLD.MAP",
  "SHAPES.EGA",
  "TITLE.EXE",
  "AVATAR.EXE"
]

/**
 * The one specific PC-version release this project has actually verified
 * (see docs/SOURCE_PINS.md). A mismatch is a *warning*, not a rejection --
 * other legitimate releases (e.g. a GOG repackage) may carry the same
 * required files with a different archive hash, and this project
 * deliberately does not assume they're byte-identical.
 */
export const ULTIMA4_PINNED_SHA256 = "94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74"

export type ZipValidationResult =
  | { readonly ok: true; readonly sha256: string; readonly shaMismatch: boolean }
  | { readonly ok: false; readonly reason: "corrupted"; readonly detail: string }
  | { readonly ok: false; readonly reason: "missing-files"; readonly missing: readonly string[] }

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Validates a candidate original-data ZIP entirely from its bytes, before
 * anything touches the wasm engine or virtual filesystem. Order matters:
 * a corrupted archive is reported as corrupted even if it happens to also
 * be missing files (we can't reliably enumerate "missing" from a central
 * directory we don't trust), and file-presence is a hard gate while the
 * hash is only ever a warning.
 */
export async function validateUltima4Zip(buffer: ArrayBuffer): Promise<ZipValidationResult> {
  let entries: ZipEntry[]
  try {
    entries = parseZipEntries(buffer)
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown ZIP parse error"
    return { ok: false, reason: "corrupted", detail }
  }

  const presentUpper = new Set(entries.map((entry) => entry.name.toUpperCase()))
  const missing = REQUIRED_ULTIMA4_ENTRIES.filter((name) => !presentUpper.has(name.toUpperCase()))
  if (missing.length > 0) {
    return { ok: false, reason: "missing-files", missing }
  }

  const sha256 = await sha256Hex(buffer)
  return { ok: true, sha256, shaMismatch: sha256 !== ULTIMA4_PINNED_SHA256 }
}
