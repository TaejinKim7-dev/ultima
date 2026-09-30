import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
// @ts-expect-error -- plain .mjs build helper, no type declarations
import { checkFreshness, hashInputs, MODULES_STAMP, WASM_STAMP, writeStamp } from "../../scripts/lib/build-stamp.mjs"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const created: string[] = []

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true })
})

function put(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), content)
}

/** A fake repo with module/wasm sources and nothing built yet. */
function fakeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "build-stamp-"))
  created.push(root)
  put(root, "vendor/xu4/module/Ultima-IV/vendors.b", "say 'hello'")
  put(root, "vendor/xu4/tools/pack-xu4.b", "pack")
  put(root, "vendor/xu4/src/game.cpp", "int main(){}")
  put(root, "scripts/build-modules.mjs", "// modules")
  put(root, "scripts/build-wasm.mjs", "// wasm")
  return root
}

function buildModules(root: string, modBytes = "MOD-v1"): void {
  put(root, "build/host/modules/Ultima-IV.mod", modBytes)
  writeStamp(root, MODULES_STAMP)
}

function buildWasm(root: string): void {
  put(root, "build/wasm-release/xu4.wasm", "WASM")
  put(root, "build/wasm-release/modules/Ultima-IV.mod", "MOD-v1")
  writeStamp(root, WASM_STAMP)
}

describe("build-stamp: hashInputs", () => {
  it("is deterministic, changes when a source file changes, and ignores excluded paths", () => {
    const root = fakeRepo()
    const a = hashInputs(root, ["vendor/xu4"], ["vendor/xu4/module"])
    expect(hashInputs(root, ["vendor/xu4"], ["vendor/xu4/module"])).toBe(a)
    put(root, "vendor/xu4/module/Ultima-IV/vendors.b", "changed but excluded")
    expect(hashInputs(root, ["vendor/xu4"], ["vendor/xu4/module"])).toBe(a)
    put(root, "vendor/xu4/src/game.cpp", "int main(){return 1;}")
    expect(hashInputs(root, ["vendor/xu4"], ["vendor/xu4/module"])).not.toBe(a)
  })
})

describe("build-stamp: checkFreshness", () => {
  it("is ok when nothing has been built (engine-less local build)", () => {
    expect(checkFreshness(fakeRepo()).ok).toBe(true)
  })

  it("rejects built modules that have no stamp (built before stamps existed)", () => {
    const root = fakeRepo()
    put(root, "build/host/modules/Ultima-IV.mod", "MOD-legacy")
    const result = checkFreshness(root)
    expect(result.ok).toBe(false)
    expect(result.problems.join("\n")).toContain("build:modules")
  })

  it("accepts fresh modules + wasm, then rejects the modules after a module source edit", () => {
    const root = fakeRepo()
    buildModules(root)
    buildWasm(root)
    expect(checkFreshness(root)).toMatchObject({ ok: true })

    // The exact 2026-09-30 incident: vendors.b changed after the last build:modules.
    put(root, "vendor/xu4/module/Ultima-IV/vendors.b", "say 'hello'; web-say")
    const result = checkFreshness(root)
    expect(result.ok).toBe(false)
    expect(result.problems.join("\n")).toContain("npm run build:modules")
  })

  it("rejects the wasm build after an engine source edit", () => {
    const root = fakeRepo()
    buildModules(root)
    buildWasm(root)
    put(root, "vendor/xu4/src/game.cpp", "int main(){return 2;}")
    const result = checkFreshness(root)
    expect(result.ok).toBe(false)
    expect(result.problems.join("\n")).toContain("npm run build:wasm")
  })

  it("rejects a wasm-release module copy that differs from the freshly built module (build:modules rerun without build:wasm)", () => {
    const root = fakeRepo()
    buildModules(root)
    buildWasm(root)
    buildModules(root, "MOD-v2") // new module, but build:wasm never recopied it
    const result = checkFreshness(root)
    expect(result.ok).toBe(false)
    expect(result.problems.join("\n")).toContain("wasm-release/modules/Ultima-IV.mod")
  })
})

describe("build-stamp: enforcement points", () => {
  it("check-build-fresh CLI exits 1 with the fix command for stale modules, 0 when fresh", () => {
    const root = fakeRepo()
    buildModules(root)
    const cli = join(projectRoot, "scripts/check-build-fresh.mjs")
    expect(spawnSync("node", [cli, `--root=${root}`], { encoding: "utf8" }).status).toBe(0)
    put(root, "vendor/xu4/module/Ultima-IV/vendors.b", "edited")
    const stale = spawnSync("node", [cli, `--root=${root}`], { encoding: "utf8" })
    expect(stale.status).toBe(1)
    expect(stale.stderr).toContain("npm run build:modules")
  })

  it("build:site refuses to build from stale artifacts before running vite", () => {
    const root = fakeRepo()
    put(root, "build/host/modules/Ultima-IV.mod", "MOD-legacy") // no stamp
    const result = spawnSync("node", [join(projectRoot, "scripts/build-site.mjs")], {
      encoding: "utf8",
      env: { ...process.env, U4_BUILD_ROOT: root }
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("build:modules")
    expect(result.stdout).not.toContain("vite v")
  })
})
