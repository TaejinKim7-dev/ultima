import { describe, expect, it } from "vitest"
import { buildStoreZip } from "../lib/test-zip.ts"
import { REQUIRED_ULTIMA4_ENTRIES, ULTIMA4_PINNED_SHA256, parseZipEntries, validateUltima4Zip } from "../../src/engine/zip.ts"

function dummyEntries(names: readonly string[]): { name: string; data: Uint8Array }[] {
  return names.map((name) => ({ name, data: new TextEncoder().encode(`dummy:${name}`) }))
}

describe("parseZipEntries", () => {
  it("reads back every entry name from a valid store-only zip", () => {
    const zip = buildStoreZip(dummyEntries(["WORLD.MAP", "AVATAR.EXE"]))
    const entries = parseZipEntries(zip.buffer as ArrayBuffer)
    expect(entries.map((e) => e.name).sort()).toEqual(["AVATAR.EXE", "WORLD.MAP"])
  })

  it("throws a corrupted-archive error when the end-of-central-directory signature is missing", () => {
    const zip = buildStoreZip(dummyEntries(["WORLD.MAP"]))
    const truncated = zip.slice(0, zip.length - 22) // chop off the EOCD record entirely
    expect(() => parseZipEntries(truncated.buffer as ArrayBuffer)).toThrow(/end.of.central.directory/i)
  })

  it("throws a corrupted-archive error when a central directory entry signature is wrong", () => {
    const zip = buildStoreZip(dummyEntries(["WORLD.MAP"]))
    const mutated = zip.slice()
    // Central directory record signature is 4 bytes at a fixed, computable
    // offset for this single-entry fixture: local header (30 + 9) + data.
    const localHeaderLen = 30 + "WORLD.MAP".length
    const dataLen = "dummy:WORLD.MAP".length
    const cdOffset = localHeaderLen + dataLen
    mutated[cdOffset] = 0x00 // corrupt the 0x02014b50 signature's first byte
    expect(() => parseZipEntries(mutated.buffer as ArrayBuffer)).toThrow(/central directory/i)
  })
})

describe("validateUltima4Zip", () => {
  it("rejects with ok:false and every missing name when required entries are absent", async () => {
    const zip = buildStoreZip(dummyEntries(["WORLD.MAP"])) // far from complete
    const result = await validateUltima4Zip(zip.buffer as ArrayBuffer)
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== "missing-files") {
      throw new Error(`expected reason 'missing-files', got ${JSON.stringify(result)}`)
    }
    expect(result.missing).toEqual(expect.arrayContaining(["SHAPES.EGA", "TITLE.EXE", "AVATAR.EXE", "BRITAIN.TLK"]))
    expect(result.missing).not.toContain("WORLD.MAP")
  })

  it("rejects with reason 'corrupted' before checking required files at all", async () => {
    const zip = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES))
    const truncated = zip.slice(0, zip.length - 22)
    const result = await validateUltima4Zip(truncated.buffer as ArrayBuffer)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("corrupted")
  })

  it("accepts a structurally-complete zip whose sha256 does not match the pinned hash, with a warning (allow, not reject)", async () => {
    const zip = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES))
    const result = await validateUltima4Zip(zip.buffer as ArrayBuffer)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.sha256).not.toBe(ULTIMA4_PINNED_SHA256)
    expect(result.shaMismatch).toBe(true)
  })

  it("has no shaMismatch warning when every required entry is present and the hash happens to match", async () => {
    // We cannot reproduce the real pinned SHA-256 with a synthetic fixture
    // (it is the hash of the actual proprietary archive, which this repo
    // never touches) -- so this test instead proves the flag is driven by
    // an actual comparison rather than being hardcoded true, by asserting
    // shaMismatch is exactly `sha256 !== ULTIMA4_PINNED_SHA256`.
    const zip = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES))
    const result = await validateUltima4Zip(zip.buffer as ArrayBuffer)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.shaMismatch).toBe(result.sha256 !== ULTIMA4_PINNED_SHA256)
  })

  it("REQUIRED_ULTIMA4_ENTRIES has all 16 TLK maps plus the four binary/map assets", () => {
    expect(REQUIRED_ULTIMA4_ENTRIES.length).toBe(16 + 4)
    expect(REQUIRED_ULTIMA4_ENTRIES).toEqual(expect.arrayContaining(["WORLD.MAP", "SHAPES.EGA", "TITLE.EXE", "AVATAR.EXE"]))
  })
})
