// Build-artifact freshness stamps (Todo 28).
//
// build:modules and build:wasm each record a hash of the sources they were
// built from; build:site (and so every e2e run) and the dev server refuse to
// serve artifacts whose sources changed since. This exists because an
// integration e2e once ran against a two-day-old Ultima-IV.mod (vendors.b had
// gained the Todo 25 web-say calls in between) and the failure was
// misdiagnosed for a whole session.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

/** build:modules packs vendor/xu4/module with the host boron + pack script. */
export const MODULES_STAMP = {
  name: "build:modules",
  stamp: "build/host/modules/.build-stamp.json",
  artifactDir: "build/host/modules",
  inputs: ["vendor/xu4/module", "vendor/xu4/tools/pack-xu4.b", "scripts/build-modules.mjs", "build/host/boron/boron"],
  exclude: []
}

/**
 * build:wasm compiles vendor/xu4 (minus the Boron module sources, which it
 * never compiles) plus shims, and COPIES build/host/modules into
 * build/wasm-release/modules -- that copy is what is actually served.
 */
export const WASM_STAMP = {
  name: "build:wasm",
  stamp: "build/wasm-release/.build-stamp.json",
  artifactDir: "build/wasm-release",
  inputs: [
    "vendor/xu4",
    "vendor/faun/support",
    "vendor/boron/include",
    "scripts/build-wasm.mjs",
    "build/wasm-deps/boron/libboron.a"
  ],
  exclude: ["vendor/xu4/module"]
}

function listFiles(root, rel, exclude, out) {
  const abs = join(root, rel)
  if (!existsSync(abs)) return
  if (exclude.some((prefix) => rel === prefix || rel.startsWith(prefix + "/"))) return
  if (statSync(abs).isDirectory()) {
    for (const entry of readdirSync(abs)) listFiles(root, rel === "" ? entry : `${rel}/${entry}`, exclude, out)
  } else {
    out.push(rel)
  }
}

/** Deterministic sha256 over every file under `inputs` (repo-relative), minus `exclude` prefixes. */
export function hashInputs(root, inputs, exclude = []) {
  const files = []
  for (const input of inputs) listFiles(root, input, exclude, files)
  files.sort()
  const hash = createHash("sha256")
  for (const rel of files) {
    const bytes = readFileSync(join(root, rel))
    hash.update(`${rel}\0${bytes.length}\0`)
    hash.update(bytes)
  }
  return hash.digest("hex")
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function artifactFiles(root, spec) {
  const dir = join(root, spec.artifactDir)
  if (!existsSync(dir)) return []
  const files = []
  listFiles(root, spec.artifactDir, [], files)
  return files.filter((rel) => !rel.endsWith(".build-stamp.json"))
}

/** Records the current source hash for `spec`; call as the last step of a successful build. */
export function writeStamp(root, spec) {
  const path = join(root, spec.stamp)
  mkdirSync(dirname(path), { recursive: true })
  const stamp = { builtBy: spec.name, sourceHash: hashInputs(root, spec.inputs, spec.exclude), builtAt: new Date().toISOString() }
  writeFileSync(path, JSON.stringify(stamp, null, 2) + "\n")
  return stamp
}

function checkSpec(root, spec, isBuilt, problems) {
  if (!isBuilt) return
  const stampPath = join(root, spec.stamp)
  if (!existsSync(stampPath)) {
    problems.push(`${spec.artifactDir} has no freshness stamp (built before stamps existed) -- run "npm run ${spec.name}"`)
    return
  }
  const stamp = JSON.parse(readFileSync(stampPath, "utf8"))
  if (stamp.sourceHash !== hashInputs(root, spec.inputs, spec.exclude)) {
    problems.push(`${spec.artifactDir} is stale: its sources changed since it was built (${stamp.builtAt}) -- run "npm run ${spec.name}"`)
  }
}

/**
 * { ok, problems, notes }. Nothing built at all is ok (engine-less builds are
 * still useful for the dist leak audit); anything that IS built must match
 * its sources, and every module copy under build/wasm-release/modules must be
 * byte-identical to the freshly built one under build/host/modules.
 */
export function checkFreshness(root) {
  const problems = []
  const notes = []
  const modulesBuilt = artifactFiles(root, MODULES_STAMP).length > 0
  const wasmBuilt = existsSync(join(root, WASM_STAMP.artifactDir, "xu4.wasm"))
  if (!modulesBuilt && !wasmBuilt) notes.push("no module/wasm artifacts built -- nothing to check")

  checkSpec(root, MODULES_STAMP, modulesBuilt, problems)
  checkSpec(root, WASM_STAMP, wasmBuilt, problems)

  const copiesDir = join(root, WASM_STAMP.artifactDir, "modules")
  if (existsSync(copiesDir)) {
    for (const name of readdirSync(copiesDir)) {
      const copy = join(copiesDir, name)
      const fresh = join(root, MODULES_STAMP.artifactDir, name)
      const rel = relative(root, copy).split(sep).join("/")
      if (!existsSync(fresh)) {
        problems.push(`${rel} has no counterpart in ${MODULES_STAMP.artifactDir} -- run "npm run build:modules" then "npm run build:wasm"`)
      } else if (sha256File(copy) !== sha256File(fresh)) {
        problems.push(`${rel} differs from the freshly built module -- run "npm run build:wasm" to recopy it`)
      }
    }
  }
  return { ok: problems.length === 0, problems, notes }
}

/** Throws a single readable error listing every problem (used by build:site and the dev server). */
export function assertFresh(root) {
  const result = checkFreshness(root)
  if (!result.ok) {
    throw new Error(`stale build artifacts:\n  - ${result.problems.join("\n  - ")}`)
  }
  return result
}
