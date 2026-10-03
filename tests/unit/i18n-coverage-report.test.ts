import { describe, expect, it } from "vitest"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { buildReverseMaps, mergeSnapshots, renderReport } from "../../scripts/i18n-coverage-report.mjs"

// Todo 38: the report reverse-maps hashes against open-source literals on a fixture.
const CPP = `void f() {
  screenMessage("Hello %s!\\n", name);
  screenMessage("Dropped line\\n");
}
`
const BORON = `shop: {
  {{
    Welcome to @.
  }}
}
`

describe("mergeSnapshots", () => {
  it("sums counts per kind and key across snapshots", () => {
    const a = { "ui-unmapped": [{ key: "00000001", count: 2 }], rejected: 1 }
    const b = {
      "ui-unmapped": [
        { key: "00000001", count: 3 },
        { key: "00000002", count: 1 }
      ]
    }
    const merged = mergeSnapshots([a, b])
    expect(merged["ui-unmapped"]).toEqual([
      { key: "00000001", count: 5 },
      { key: "00000002", count: 1 }
    ])
    expect(merged.rejected).toBe(1)
    expect(merged["vendor-unmapped"]).toEqual([])
  })
})

describe("buildReverseMaps + renderReport", () => {
  const maps = buildReverseMaps({
    cppSources: [{ file: "vendor/xu4/src/game.cpp", text: CPP }],
    vendorSource: { file: "vendor/xu4/module/Ultima-IV/vendors.b", text: BORON }
  })

  it("maps a ui hash to file:line", () => {
    expect(maps.ui.get(fnv1a32("Dropped line\n"))).toEqual([{ file: "vendor/xu4/src/game.cpp", line: 3 }])
  })

  it("renders counts, file:line, unknown hashes and blind spots without English text", () => {
    const merged = mergeSnapshots([
      {
        "ui-unmapped": [
          { key: fnv1a32("Dropped line\n"), count: 4 },
          { key: "0badf00d", count: 1 }
        ]
      }
    ])
    const md = renderReport(merged, maps, { specCount: 3 })
    expect(md).toContain("ui-unmapped")
    expect(md).toContain("vendor/xu4/src/game.cpp:3")
    expect(md).toContain("0badf00d")
    expect(md).toMatch(/Unknown hashes/i)
    expect(md).toMatch(/Blind spots/i)
    expect(md).not.toContain("Dropped line")
    expect(md).not.toContain("Hello")
  })
})

// Todo 45 (a): the hash that matched no literal was screenMessage("\b\b\b\b"),
// the cursor-erase after the "Dir?" prompt. The report's own unescape did not
// know the C escapes \b \a \f \r \v, so the literal hashed differently from
// what the engine sends. It is control characters only (no text to translate).
describe("C escape handling in the reverse map (Todo 45)", () => {
  const ESCAPES = `void g() {
  screenMessage("\\b\\b\\b\\b");
  screenMessage("a\\rb\\fc\\vd\\ae");
}
`
  const escMaps = buildReverseMaps({ cppSources: [{ file: "vendor/xu4/src/game.cpp", text: ESCAPES }] })

  it("hashes \\b \\a \\f \\r \\v literals the way the engine's bytes hash", () => {
    expect(escMaps.literal.get(fnv1a32("\b\b\b\b"))).toEqual([{ file: "vendor/xu4/src/game.cpp", line: 2 }])
    expect(escMaps.literal.get(fnv1a32("a\rb\fc\vd\x07e"))).toEqual([{ file: "vendor/xu4/src/game.cpp", line: 3 }])
  })

  it("reports a control-only literal as not translatable, not as an unknown hash or an args-carrying format", () => {
    const merged = mergeSnapshots([{ "ui-unmapped": [{ key: fnv1a32("\b\b\b\b"), count: 7 }] }])
    const md = renderReport(merged, escMaps, { specCount: 1 })
    expect(md).toContain("vendor/xu4/src/game.cpp:2")
    expect(md).toContain("CONTROL-ONLY")
    expect(md).not.toContain("UNKNOWN")
    expect(md).not.toContain("FORMAT-ONLY")
  })
})
