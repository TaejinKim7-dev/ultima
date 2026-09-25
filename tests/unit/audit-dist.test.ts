import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/audit-dist.mjs")

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function makeCleanDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "audit-dist-"))
  createdDirs.push(dir)
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><body></body></html>")
  mkdirSync(join(dir, "assets"))
  writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log('ok')")
  writeFileSync(join(dir, "assets", "index-abc123.css"), "body{}")
  return dir
}

function run(distDir: string) {
  return spawnSync("node", [scriptPath, `--dir=${distDir}`], { encoding: "utf8" })
}

describe("audit:dist", () => {
  it("passes for a clean Pages artifact with only web assets", () => {
    // Given: a dist directory containing only index.html + built assets.
    const dir = makeCleanDist()

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it succeeds.
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects original Ultima IV game data leaking into the artifact", () => {
    // Given: a dist directory that also (incorrectly) contains a copy of
    // the original game archive.
    const dir = makeCleanDist()
    writeFileSync(join(dir, "ULTIMA4.ZIP"), "fake game data")

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails and names the leaked path.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("original game data")
    expect(result.stderr).toContain("ULTIMA4.ZIP")
  })

  it("rejects development/tooling files leaking into the artifact", () => {
    // Given: a dist directory that (incorrectly) also contains a build-time
    // config file that should never be served statically.
    const dir = makeCleanDist()
    writeFileSync(join(dir, "vite.config.ts"), "export default {}")

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails and names the leaked path.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("vite.config.ts")
  })

  it("fails clearly when the artifact has no index.html at its root", () => {
    // Given: an empty directory (e.g. the site was never built).
    const dir = mkdtempSync(join(tmpdir(), "audit-dist-empty-"))
    createdDirs.push(dir)

    // When: the dist artifact audit runs.
    const result = run(dir)

    // Then: it fails, pointing at the missing artifact root file.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("index.html")
  })
})
