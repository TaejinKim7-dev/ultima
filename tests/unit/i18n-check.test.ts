import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = "scripts/i18n-check.mjs"

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function baseSchema() {
  return {
    ui: {
      $schema: "ultima-web/i18n-schema/ui/v1",
      entries: {
        "ui:game:0": {
          sourceHash: "sha256:aaaa",
          placeholders: [],
          translation: "",
          status: "pending"
        },
        "ui:game:1": {
          sourceHash: "sha256:bbbb",
          placeholders: ["%d"],
          translation: "속도: %d",
          status: "ready"
        },
        "ui:stats:0": {
          sourceHash: "sha256:cccc",
          placeholders: [],
          translation: "체력",
          status: "ready",
          category: "status"
        }
      }
    },
    module: { $schema: "ultima-web/i18n-schema/module/v1", entries: {} },
    binary: { $schema: "ultima-web/i18n-schema/binary/v1", entries: {} },
    tlk: {
      $schema: "ultima-web/i18n-schema/tlk/v1",
      entries: {
        "BRITAIN:0:name": {
          sourceHash: "sha256:dddd",
          placeholders: [],
          translation: "갓프리",
          status: "ready"
        }
      }
    },
    aliases: {
      $schema: "ultima-web/i18n-schema/aliases/v1",
      entries: {
        alias1: { alias: "안녕", canonical: "hail" },
        alias2: { alias: "경비병", canonical: "guard" }
      }
    },
    glossary: {
      $schema: "ultima-web/i18n-schema/glossary/v1",
      entries: {
        "glossary:virtue": { sourceHash: "sha256:eeee", translation: "미덕", status: "ready" }
      }
    }
  }
}

function writeFixture(schema: ReturnType<typeof baseSchema>) {
  const dir = mkdtempSync(join(tmpdir(), "i18n-check-fixture-"))
  createdDirs.push(dir)
  mkdirSync(dir, { recursive: true })
  for (const [name, data] of Object.entries(schema)) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2))
  }
  return dir
}

function runCheck(dir: string, ...extraArgs: string[]) {
  return spawnSync("node", [scriptPath, dir, ...extraArgs], { cwd: projectRoot, encoding: "utf8" })
}

describe("i18n:check happy path", () => {
  it("passes a complete, internally-consistent schema sample", () => {
    const dir = writeFixture(baseSchema())
    const result = runCheck(dir)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("i18n:check passed")
  })

  it("does not require pending entries to be translated (translation is a later todo)", () => {
    const dir = writeFixture(baseSchema())
    const result = runCheck(dir)
    expect(result.status, result.stderr).toBe(0)
  })
})

describe("i18n:check failure: missing translation", () => {
  it("fails with the exact key when a required translation is removed", () => {
    const schema = baseSchema()
    schema.tlk.entries["BRITAIN:0:name"].translation = ""
    const dir = writeFixture(schema)
    const result = runCheck(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("BRITAIN:0:name")
    expect(result.stderr).toContain("no translation")
  })
})

describe("i18n:check failure: placeholder mismatch", () => {
  it("fails with the exact key when the translation drops a placeholder", () => {
    const schema = baseSchema()
    schema.ui.entries["ui:game:1"].translation = "속도 변경됨"
    const dir = writeFixture(schema)
    const result = runCheck(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ui:game:1")
    expect(result.stderr).toContain("placeholder mismatch")
  })
})

describe("i18n:check failure: over-wide status string", () => {
  it("fails with the exact key when a status-line translation exceeds the column budget", () => {
    const schema = baseSchema()
    // STATUS_AREA_WIDTH_COLUMNS is 15; this Hangul string alone is 24 columns wide.
    schema.ui.entries["ui:stats:0"].translation = "매우매우매우매우매우긴상태줄문자열입니다"
    const dir = writeFixture(schema)
    const result = runCheck(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ui:stats:0")
    expect(result.stderr).toContain("display columns wide")
  })
})

describe("i18n:check failure: alias collision", () => {
  it("fails and names both entries when two aliases normalize to the same text", () => {
    const schema = baseSchema()
    schema.aliases.entries.alias2 = { alias: "안녕", canonical: "guard" }
    const dir = writeFixture(schema)
    const result = runCheck(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("aliases.json")
    expect(result.stderr).toContain("alias1")
    expect(result.stderr).toContain("alias2")
  })
})

describe("i18n:check failure: stale (sourceHash drift) entry", () => {
  it("fails with the exact key when a translated entry is flagged stale", () => {
    const schema = baseSchema()
    // Simulates re-running `npm run i18n:inventory` after the underlying
    // source text changed: mergeEntries() sets `stale: true` and keeps the
    // (now possibly wrong) translation for human re-review rather than
    // silently overwriting or wiping it -- i18n:check must not let that
    // silently pass.
    ;(schema.tlk.entries["BRITAIN:0:name"] as Record<string, unknown>)["stale"] = true
    const dir = writeFixture(schema)
    const result = runCheck(dir)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("BRITAIN:0:name")
    expect(result.stderr).toContain("sourceHash drift")
  })
})

describe("i18n:check --strict", () => {
  it("fails on a pending entry only when --strict is passed", () => {
    const dir = writeFixture(baseSchema())
    const lenient = runCheck(dir)
    expect(lenient.status, lenient.stderr).toBe(0)

    const strict = runCheck(dir, "--strict")
    expect(strict.status).toBe(1)
    expect(strict.stderr).toContain("ui:game:0")
    expect(strict.stderr).toContain("pending")
  })
})
