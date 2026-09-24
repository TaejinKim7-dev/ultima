import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/qa-native-baseline.mjs")

function run(env: Record<string, string>) {
  const combined: Record<string, string> = { ...(process.env as Record<string, string>) }
  delete combined["ULTIMA4_DATA"]
  Object.assign(combined, env)
  return spawnSync("node", [scriptPath], { cwd: projectRoot, encoding: "utf8", env: combined })
}

describe("qa:native-baseline", () => {
  it("prints the deterministic Moonglow multi-turn dialogue plan", () => {
    // Given: the native QA command without original game data.
    // When: its non-game plan inspection mode is requested.
    const result = spawnSync("node", [scriptPath, "--print-npc-dialogue-plan"], {
      cwd: projectRoot,
      encoding: "utf8"
    })

    // Then: the exact runtime route, per-step talk sweep, interest-buffer
    // clear guard, two keywords, and clean exit are exposed.
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(
      "goto=moonglow; enter=e; approachSteps=6; talkPerStep=Right,Up,Down,Left; " +
      "clearInterest=backspace*16; keywords=name,health; exit=bye; exitMap=x\n"
    )
  })

  it("fails clearly when ULTIMA4_DATA is unset", () => {
    const result = run({})

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ULTIMA4_DATA is required")
  })

  it("fails clearly when ULTIMA4_DATA points at a nonexistent file", () => {
    const missingZip = join(projectRoot, "build/does-not-exist-ultima4.zip")

    const result = run({ ULTIMA4_DATA: missingZip })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ULTIMA4_DATA file does not exist")
    expect(result.stderr).toContain(missingZip)
  })

  it("fails before touching xu4 when ULTIMA4_DATA's hash does not match the pinned original", () => {
    // Any file with a wrong hash must be rejected -- this exercises the
    // "wrong zip" plan scenario without needing a second real Ultima IV
    // release on disk. package.json is guaranteed to exist and guaranteed
    // not to hash to the pinned ultima4.zip sha256.
    const wrongFile = join(projectRoot, "package.json")

    const result = run({ ULTIMA4_DATA: wrongFile, ULTIMA4_DATA_SHA256: "a".repeat(64) })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("ULTIMA4_DATA sha256 mismatch")
    expect(result.stderr).toContain("expected " + "a".repeat(64))
  })
})
