import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Todo 28: every e2e must record what the page showed when it failed
// (dialogue panel text, focused element, screenshot). In the 2026-09-30
// shop incident the spec never recorded its failure point, so the cause
// was guessed (wrongly) for a whole session; one captured panel dump found
// it in a single run. Specs therefore must take `test` from the shared
// fixture, never straight from @playwright/test.
const e2eDir = fileURLToPath(new URL("../e2e/", import.meta.url))
const specs = readdirSync(e2eDir).filter((name) => name.endsWith(".spec.ts"))

describe("e2e failure capture is on for every spec", () => {
  it("the shared fixture exists and auto-captures panel, focus and a screenshot on failure", () => {
    const fixture = join(e2eDir, "fixtures.ts")
    expect(existsSync(fixture)).toBe(true)
    const source = readFileSync(fixture, "utf8")
    expect(source).toContain("auto: true")
    expect(source).toContain("#dialogue-history")
    expect(source).toContain("activeElement")
    expect(source).toContain("screenshot")
  })

  it.each(specs)("%s imports test from ./fixtures.ts, not directly from @playwright/test", (spec) => {
    const source = readFileSync(join(e2eDir, spec), "utf8")
    expect(source).not.toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"@playwright\/test"/)
    expect(source).toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"\.\/fixtures\.ts"/)
  })
})
