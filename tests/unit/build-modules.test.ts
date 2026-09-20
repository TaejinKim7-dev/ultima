import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/build-modules.mjs")

describe("build:modules", () => {
  it("fails clearly when the host boron binary has not been built yet", () => {
    // Given: no host boron binary at the configured (overridden) path.
    const missingBoronPath = join(projectRoot, "build/host/boron/does-not-exist")

    // When: build:modules runs without deps:host having produced a binary.
    const result = spawnSync("node", [scriptPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { ...process.env, BORON_BIN: missingBoronPath }
    })

    // Then: it fails with a message pointing at deps:host, not a stack trace.
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("run \"npm run deps:host\" first")
    expect(result.stderr).toContain(missingBoronPath)
  })
})
