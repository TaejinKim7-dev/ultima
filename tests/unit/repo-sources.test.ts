import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const verifierPath = fileURLToPath(new URL("../../scripts/verify-repo-sources.mjs", import.meta.url))

describe("repository source verification", () => {
  it("verifies pinned vendor sources when the repository matches its manifest", () => {
    // Given: the checked-out repository and its pinned vendor snapshots.
    const result = spawnSync("node", ["scripts/verify-repo-sources.mjs"], {
      cwd: projectRoot,
      encoding: "utf8"
    })

    // When: the repository source verifier runs.

    // Then: it succeeds.
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects tracked original game data when a candidate repository contains ULTIMA4.ZIP", () => {
    // Given: an isolated Git repository tracking a fake original game archive.
    const temporaryRepository = mkdtempSync(join(tmpdir(), "ultima-source-verifier-"))
    writeFileSync(join(temporaryRepository, "ULTIMA4.ZIP"), "fake game data")
    spawnSync("git", ["init", "--quiet"], { cwd: temporaryRepository })
    spawnSync("git", ["add", "ULTIMA4.ZIP"], { cwd: temporaryRepository })

    try {
      // When: the repository source verifier runs against the candidate repository.
      const result = spawnSync("node", [verifierPath, temporaryRepository], {
        encoding: "utf8"
      })

      // Then: it rejects the tracked original-game-data filename.
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("forbidden original-game-data path is tracked: ULTIMA4.ZIP")
    } finally {
      rmSync(temporaryRepository, { force: true, recursive: true })
    }
  })
})
