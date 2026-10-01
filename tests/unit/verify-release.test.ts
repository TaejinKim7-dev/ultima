import { describe, expect, it } from "vitest"
import { RELEASE_STEPS, releaseSteps, runRelease } from "../../scripts/verify-release.mjs"

// The Verification strategy's `npm run verify:release`: production build,
// unit/native/e2e, i18n, and artifact checks in one gate, nonzero on the
// first failure. The step runner is injected so no real command runs here.

function recordingRunner(exitCodes: Record<string, number> = {}) {
  const ran: string[] = []
  return {
    ran,
    run: (step: { label: string }) => {
      ran.push(step.label)
      return exitCodes[step.label] ?? 0
    }
  }
}

const quiet = { log: () => {}, error: () => {} }

describe("verify:release", () => {
  it("runs every release check in the planned order", () => {
    expect(releaseSteps().map((step) => step.label)).toEqual([
      "npm run typecheck",
      "npm run test:unit",
      "npm run test:native",
      "npm run i18n:check -- --strict",
      "npm run verify:repo-sources",
      "npm run build:site -- --base=/ultima/",
      "npm run audit:dist -- --require-engine",
      "npm run verify:workflow",
      "npm run verify:release-docs",
      "npm run test:e2e -- --project=chromium --workers=1"
    ])
    expect(RELEASE_STEPS).toHaveLength(10)
  })

  it("returns 0 and runs everything when every step passes", () => {
    const runner = recordingRunner()
    const code = runRelease({ env: { ULTIMA4_DATA: "/data/ultima4.zip" }, argv: [], runner: runner.run, ...quiet })
    expect(code).toBe(0)
    expect(runner.ran).toHaveLength(10)
  })

  it("stops at the first failing step and exits with that step's code", () => {
    const runner = recordingRunner({ "npm run audit:dist -- --require-engine": 3 })
    const code = runRelease({ env: { ULTIMA4_DATA: "/data/ultima4.zip" }, argv: [], runner: runner.run, ...quiet })
    expect(code).toBe(3)
    expect(runner.ran.at(-1)).toBe("npm run audit:dist -- --require-engine")
    expect(runner.ran).not.toContain("npm run verify:workflow")
  })

  it("refuses to run without ULTIMA4_DATA (real-engine e2e would silently skip)", () => {
    const runner = recordingRunner()
    const errors: string[] = []
    const code = runRelease({ env: {}, argv: [], runner: runner.run, log: () => {}, error: (m: string) => errors.push(m) })
    expect(code).not.toBe(0)
    expect(runner.ran).toEqual([])
    expect(errors.join("\n")).toContain("ULTIMA4_DATA")
  })

  it("--allow-skip-real-data runs anyway, with a loud warning", () => {
    const runner = recordingRunner()
    const errors: string[] = []
    const code = runRelease({
      env: {},
      argv: ["--allow-skip-real-data"],
      runner: runner.run,
      log: () => {},
      error: (m: string) => errors.push(m)
    })
    expect(code).toBe(0)
    expect(runner.ran).toHaveLength(10)
    expect(errors.join("\n")).toMatch(/WARNING.*ULTIMA4_DATA/)
  })

  it("--dry-run prints the steps and runs nothing", () => {
    const runner = recordingRunner()
    const logged: string[] = []
    const code = runRelease({ env: {}, argv: ["--dry-run"], runner: runner.run, log: (m: string) => logged.push(m), error: () => {} })
    expect(code).toBe(0)
    expect(runner.ran).toEqual([])
    expect(logged.join("\n")).toContain("npm run test:native")
  })
})
