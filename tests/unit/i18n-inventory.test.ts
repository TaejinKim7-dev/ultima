import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = "scripts/i18n-inventory.mjs"

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function makeTmpDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

describe("i18n:inventory without ULTIMA4_DATA", () => {
  it("still succeeds and extracts module/ui sources, skipping TLK/binary with a clear message", () => {
    const publicDir = makeTmpDir("i18n-inventory-public-")
    const privateDir = makeTmpDir("i18n-inventory-private-")

    const result = spawnSync(
      "node",
      [scriptPath, "--out-public", publicDir, "--out-private", privateDir],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, ULTIMA4_DATA: "" }
      }
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain("ULTIMA4_DATA is not set")
    expect(result.stdout).toContain("module:")
    expect(result.stdout).toContain("ui:")

    expect(existsSync(join(publicDir, "module.json"))).toBe(true)
    expect(existsSync(join(publicDir, "ui.json"))).toBe(true)
    // Without ULTIMA4_DATA, the TLK/binary sources are never touched, so no
    // public schema file is written for them by this run.
    expect(existsSync(join(publicDir, "tlk.json"))).toBe(false)
    expect(existsSync(join(publicDir, "binary.json"))).toBe(false)
  })

  it("never writes raw extracted English text into the public schema", () => {
    const publicDir = makeTmpDir("i18n-inventory-public-")
    const privateDir = makeTmpDir("i18n-inventory-private-")

    const result = spawnSync(
      "node",
      [scriptPath, "--out-public", publicDir, "--out-private", privateDir],
      { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ULTIMA4_DATA: "" } }
    )
    expect(result.status, result.stderr).toBe(0)

    const publicModule = JSON.parse(readFileSync(join(publicDir, "module.json"), "utf8"))
    const entries = Object.values(publicModule.entries) as Record<string, unknown>[]
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("sourceText")
      expect(entry).not.toHaveProperty("text")
      expect(typeof (entry as { sourceHash: unknown }).sourceHash).toBe("string")
    }

    const privateModule = JSON.parse(readFileSync(join(privateDir, "module.json"), "utf8"))
    const privateEntries = Object.values(privateModule) as Record<string, unknown>[]
    expect(privateEntries.length).toBeGreaterThan(0)
    expect(privateEntries.some((entry) => "sourceText" in entry)).toBe(true)
  })

  it("preserves an existing translation across a re-run when the source text has not changed", () => {
    const publicDir = makeTmpDir("i18n-inventory-public-")
    const privateDir = makeTmpDir("i18n-inventory-private-")
    const args = [scriptPath, "--out-public", publicDir, "--out-private", privateDir]
    const env = { ...process.env, ULTIMA4_DATA: "" }

    const first = spawnSync("node", args, { cwd: projectRoot, encoding: "utf8", env })
    expect(first.status, first.stderr).toBe(0)

    const modulePath = join(publicDir, "module.json")
    const moduleSchema = JSON.parse(readFileSync(modulePath, "utf8"))
    const someKey = Object.keys(moduleSchema.entries)[0] as string
    moduleSchema.entries[someKey].translation = "번역 예시"
    moduleSchema.entries[someKey].status = "ready"
    writeFileSync(modulePath, JSON.stringify(moduleSchema, null, 2))

    const second = spawnSync("node", args, { cwd: projectRoot, encoding: "utf8", env })
    expect(second.status, second.stderr).toBe(0)

    const reloaded = JSON.parse(readFileSync(modulePath, "utf8"))
    expect(reloaded.entries[someKey].translation).toBe("번역 예시")
    expect(reloaded.entries[someKey].status).toBe("ready")
  })
})
