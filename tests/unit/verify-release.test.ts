import { describe, expect, it } from "vitest"
import { RELEASE_STEPS, releaseSteps, runRelease } from "../../scripts/verify-release.mjs"

// The Verification strategy's `npm run verify:release`: build everything the
// gate needs, then unit/native/e2e, i18n, and artifact checks in one gate,
// nonzero on the first failure. The step runner is injected so no real
// command runs here.
//
// SPEC CHANGE (F1 follow-up, deliberate): the step list gained the build
// steps. Ported as-is it could never pass in a fresh clone -- `test:unit`
// reads build/wasm-release (tests/unit/wasm-symbols.test.ts) and `test:native`
// is `ctest --test-dir build/native` reading build/native *and* the GLFW
// binary from build:native (native/tests/native_baseline_test.c FAILS, not
// skips, without it) -- while neither was in the list. The gate is now
// self-sufficient rather than requiring a lucky pre-built tree.

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
      // Build first, so each later step can actually run in a fresh clone.
      "npm run deps:host",
      "npm run build:modules",
      "npm run deps:wasm",
      "npm run build:wasm",
      "npm run build:native",
      "npm run check:build-fresh",
      "npm run cmake:configure",
      "npm run cmake:build",
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
    expect(RELEASE_STEPS).toHaveLength(18)
  })

  it("builds every artifact the later steps read, in that order", () => {
    // Not a restatement of the list above: these are the concrete
    // prerequisites each step fails without, so a removal/reorder regression
    // is caught with the reason spelled out.
    const labels = releaseSteps().map((step) => step.label)
    // `npm run build:site -- --base=/ultima/` is the same step as
    // `npm run build:site`, so match on the script name, not the whole label.
    const at = (name: string) =>
      labels.findIndex((label) => label === `npm run ${name}` || label.startsWith(`npm run ${name} --`))

    // tests/unit/wasm-symbols.test.ts throws "WASM not built" without
    // build/wasm-release/{xu4.mjs,xu4.wasm}.
    expect(at("build:wasm"), "build:wasm must exist").toBeGreaterThanOrEqual(0)
    expect(at("deps:wasm"), "build:wasm needs deps:wasm").toBeLessThan(at("build:wasm"))
    expect(at("build:wasm"), "test:unit must run after build:wasm").toBeLessThan(at("test:unit"))

    // build:site copies the engine into dist/engine/ only when
    // build/wasm-release exists; audit:dist --require-engine then fails.
    expect(at("build:wasm"), "build:site must run after build:wasm").toBeLessThan(at("build:site"))

    // test:native is `ctest --test-dir build/native`, which needs the dir to
    // exist, and its native-baseline-negative case execs the GLFW binary
    // that build:native produces.
    expect(at("cmake:configure"), "test:native needs a configured build/native").toBeLessThan(at("test:native"))
    expect(at("cmake:build"), "test:native needs a built build/native").toBeLessThan(at("test:native"))
    expect(at("build:native"), "test:native needs the GLFW xu4 binary").toBeLessThan(at("test:native"))

    // The e2e suite runs against dist/, so the site build must precede it.
    expect(at("build:site"), "e2e must run after build:site").toBeLessThan(at("test:e2e"))
  })

  it("returns 0 and runs everything when every step passes", () => {
    const runner = recordingRunner()
    const code = runRelease({ env: { ULTIMA4_DATA: "/data/ultima4.zip" }, argv: [], runner: runner.run, ...quiet })
    expect(code).toBe(0)
    expect(runner.ran).toHaveLength(18)
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
    expect(runner.ran).toHaveLength(18)
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
