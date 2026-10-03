import { describe, expect, it } from "vitest"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { composeTalkLine } from "../../src/dialogue/talk-compose.ts"
import { composeUiMessage } from "../../src/dialogue/ui-message-compose.ts"
import { composeVendorLine } from "../../src/dialogue/vendor-compose.ts"
import { createCoverageRecorder, createRecordingResolve, hashText, type CoverageMiss } from "../../src/i18n/coverage.ts"

// Todo 38: the recorder stores only hashes and ids -- never English text.
describe("hashText", () => {
  it("is the same FNV-1a as scripts/lib/ui-templates.mjs (8 lowercase hex)", () => {
    for (const text of ["", "a", "foobar", "Pass\n", "%s says: I am %s\n"]) {
      expect(hashText(text)).toBe(fnv1a32(text))
    }
  })
})

describe("createCoverageRecorder", () => {
  it("records and dedupes with counts, sorted", () => {
    const rec = createCoverageRecorder()
    rec.record({ kind: "ui-unmapped", hash: "deadbeef" })
    rec.record({ kind: "ui-unmapped", hash: "00000001" })
    rec.record({ kind: "ui-unmapped", hash: "deadbeef" })
    rec.record({ kind: "resolve-fallback", id: "ui:intro:3" })
    const snap = rec.snapshot()
    expect(snap["ui-unmapped"]).toEqual([
      { key: "00000001", count: 1 },
      { key: "deadbeef", count: 2 }
    ])
    expect(snap["resolve-fallback"]).toEqual([{ key: "ui:intro:3", count: 1 }])
    expect(snap["vendor-unmapped"]).toEqual([])
    expect(snap.rejected).toBe(0)
  })

  it("keys arg-passthrough by template id, position and argument hash", () => {
    const rec = createCoverageRecorder()
    rec.record({ kind: "arg-passthrough", id: "ui:combat:7", position: 1, argHash: hashText("Courage") })
    expect(rec.snapshot()["arg-passthrough"]).toEqual([{ key: `ui:combat:7|1|${hashText("Courage")}`, count: 1 }])
  })

  it("rejects keys that are not an id or an 8-hex hash, and never stores them", () => {
    const rec = createCoverageRecorder()
    rec.record({ kind: "ui-unmapped", hash: "Thou dost" })
    rec.record({ kind: "ui-unmapped", hash: "DEADBEEF" })
    rec.record({ kind: "ui-unmapped", hash: "deadbee" })
    rec.record({ kind: "resolve-fallback", id: "Hello world" })
    rec.record({ kind: "resolve-fallback", id: "ui:has space" })
    rec.record({ kind: "resolve-fallback", id: "plainword" })
    rec.record({ kind: "arg-passthrough", id: "ui:a:1", position: 0, argHash: "Courage" })
    const snap = rec.snapshot()
    expect(snap.rejected).toBe(7)
    expect(JSON.stringify(snap)).not.toMatch(/Thou|Hello|plainword|Courage|space/)
    expect(snap["ui-unmapped"]).toEqual([])
    expect(snap["resolve-fallback"]).toEqual([])
    expect(snap["arg-passthrough"]).toEqual([])
  })

  it("accepts tlk-style and module ids", () => {
    const rec = createCoverageRecorder()
    rec.record({ kind: "resolve-fallback", id: "BRITAIN:3:name" })
    rec.record({ kind: "resolve-fallback", id: "module:Ultima-IV:config:68" })
    expect(rec.snapshot().rejected).toBe(0)
  })

  it("snapshot is a copy: mutating it does not change the recorder", () => {
    const rec = createCoverageRecorder()
    rec.record({ kind: "talk-unmapped", hash: "0000abcd" })
    rec.snapshot()["talk-unmapped"].length = 0
    expect(rec.snapshot()["talk-unmapped"]).toHaveLength(1)
  })
})

describe("createRecordingResolve", () => {
  it("records a miss only when the id has no translation, and returns the inner result", () => {
    const rec = createCoverageRecorder()
    const resolve = createRecordingResolve(
      (id, fb) => (id === "ui:a:1" ? "가" : fb),
      (id) => id === "ui:a:1",
      rec
    )
    expect(resolve("ui:a:1", "A")).toBe("가")
    expect(resolve("ui:b:2", "B")).toBe("B")
    expect(rec.snapshot()["resolve-fallback"]).toEqual([{ key: "ui:b:2", count: 1 }])
  })
})

describe("composers report misses through onMiss without changing output", () => {
  const base = { resolve: (_id: string, fb: string) => fb }

  it("ui: unmapped hash -> ui-unmapped, null result unchanged", () => {
    const misses: CoverageMiss[] = []
    const out = composeUiMessage("deadbeef", [], {
      ...base,
      templateId: () => undefined,
      moduleNameId: () => undefined,
      onMiss: (m) => misses.push(m)
    })
    expect(out).toBeNull()
    expect(misses).toEqual([{ kind: "ui-unmapped", hash: "deadbeef" }])
  })

  it("ui: unmapped %s argument -> arg-passthrough with hash, raw text still shown", () => {
    const misses: CoverageMiss[] = []
    const out = composeUiMessage("aaaaaaaa", ["Courage", "Dagger"], {
      templateId: () => "ui:x:1",
      resolve: (id, fb) => (id === "ui:x:1" ? "%s와 %s" : id === "module:d" ? "단검" : fb),
      moduleNameId: (t) => (t === "Dagger" ? "module:d" : undefined),
      onMiss: (m) => misses.push(m)
    })
    expect(out).toBe("Courage와 단검")
    expect(misses).toEqual([{ kind: "arg-passthrough", id: "ui:x:1", position: 0, argHash: hashText("Courage") }])
  })

  it("vendor: unmapped hash -> vendor-unmapped", () => {
    const misses: CoverageMiss[] = []
    const out = composeVendorLine("cafebabe", [], {
      template: () => undefined,
      nameId: () => undefined,
      resolve: (_i, fb) => fb,
      onMiss: (m) => misses.push(m)
    })
    expect(out).toBeNull()
    expect(misses).toEqual([{ kind: "vendor-unmapped", hash: "cafebabe" }])
  })

  it("talk: unknown literal -> talk-unmapped with the literal's hash, English fallback unchanged", () => {
    const misses: CoverageMiss[] = []
    const out = composeTalkLine("Hello %s\n", ["x"], {
      templateId: () => undefined,
      resolve: (_i, fb) => fb,
      onMiss: (m) => misses.push(m)
    })
    expect(out).toBe("Hello x\n")
    expect(misses).toEqual([{ kind: "talk-unmapped", hash: hashText("Hello %s\n") }])
  })

  it("composers still work with no onMiss", () => {
    expect(composeUiMessage("x", [], { ...base, templateId: () => undefined, moduleNameId: () => undefined })).toBeNull()
  })
})
