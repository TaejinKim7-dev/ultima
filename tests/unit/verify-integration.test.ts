import { describe, expect, it } from "vitest"
// @ts-expect-error -- plain .mjs script, no type declarations
import { INTEGRATION_STEPS, runSteps } from "../../scripts/verify-integration.mjs"

const names = (INTEGRATION_STEPS as { name: string }[]).map((step) => step.name)

describe("verify:integration step order", () => {
  it("rebuilds modules before wasm (wasm copies them) and checks freshness before building the site", () => {
    expect(names.indexOf("build:modules")).toBeGreaterThanOrEqual(0)
    expect(names.indexOf("build:modules")).toBeLessThan(names.indexOf("build:wasm"))
    expect(names.indexOf("build:wasm")).toBeLessThan(names.indexOf("check:build-fresh"))
    expect(names.indexOf("check:build-fresh")).toBeLessThan(names.indexOf("build:site"))
  })

  it("includes every AGENTS.md merge gate and runs the full e2e suite last", () => {
    for (const gate of ["test:unit", "verify:repo-sources", "typecheck", "build", "git diff --check", "audit:dist"]) {
      expect(names, gate).toContain(gate)
    }
    expect(names[names.length - 1]).toBe("e2e")
  })
})

describe("verify:integration runner", () => {
  it("stops at the first failing step and reports it", async () => {
    const ran: string[] = []
    const result = await runSteps(
      [{ name: "a" }, { name: "b" }, { name: "c" }],
      async (step: { name: string }) => {
        ran.push(step.name)
        return step.name === "b" ? 2 : 0
      }
    )
    expect(ran).toEqual(["a", "b"])
    expect(result).toMatchObject({ ok: false, failedStep: "b", exitCode: 2 })
  })

  it("can skip steps by name (e.g. --skip=e2e for a quick gate) and still records them as skipped", async () => {
    const ran: string[] = []
    const result = await runSteps(
      [{ name: "a" }, { name: "e2e" }],
      async (step: { name: string }) => (ran.push(step.name), 0),
      { skip: ["e2e"] }
    )
    expect(ran).toEqual(["a"])
    expect(result.ok).toBe(true)
    expect(result.log.join("\n")).toContain("e2e: SKIPPED")
  })
})
