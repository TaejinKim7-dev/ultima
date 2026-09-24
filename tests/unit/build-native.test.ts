import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/build-native.mjs")

describe("build:native", () => {
  it("fails clearly when the host boron library has not been built yet", () => {
    // Given: no host boron/faun libraries at the configured (overridden) paths.
    const missingBoronDir = join(projectRoot, "build/host/does-not-exist-boron")
    const missingFaunDir = join(projectRoot, "build/host/does-not-exist-faun")

    // When: build:native runs without deps:host having produced libraries.
    const result = spawnSync("node", [scriptPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, BORON_HOST_DIR: missingBoronDir, FAUN_HOST_DIR: missingFaunDir }
    })

    // Then: it fails with a message pointing at deps:host, not a stack trace,
    // and never gets far enough to touch vendor/xu4.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("run \"npm run deps:host\" first")
    expect(result.stderr).toContain(missingBoronDir)
  })
})
