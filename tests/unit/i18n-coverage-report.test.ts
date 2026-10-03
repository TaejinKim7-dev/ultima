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
