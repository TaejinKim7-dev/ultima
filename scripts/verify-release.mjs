import { spawnSync } from "node:child_process"

// `npm run verify:release` -- the Verification strategy's one release gate
// (.omo/plans/ultima-web.md): builds every artifact the gate reads, then
// unit/native/e2e, i18n, and artifact checks, in order, stopping at the first
// nonzero exit and exiting with it.
//
// SELF-SUFFICIENCY (F1 follow-up): the gate now builds what it needs instead of
// inheriting a lucky pre-built tree. As first ported it could never pass in a
// fresh clone, because two of its steps read artifacts nothing in the list
// produced:
//   - `test:unit` -- tests/unit/wasm-symbols.test.ts throws "WASM not built"
//     unless build/wasm-release/{xu4.mjs,xu4.wasm} exists (from build:wasm,
//     which needs deps:wasm).
//   - `test:native` -- `ctest --test-dir build/native` needs the directory to
//     exist (cmake:configure + cmake:build), and its native-baseline-negative
//     case execs the GLFW binary from build:native, which FAILS rather than
//     skips when it is absent.
// `build:site` also copies the engine into dist/engine/ only when
// build/wasm-release exists, so `audit:dist --require-engine` needs build:wasm
// before it, and the e2e suite runs against dist/, so build:site must precede
// it. Those are the dependencies tests/unit/verify-release.test.ts pins.
//
// EXTERNAL PREREQUISITES (not buildable from a clone): the host C toolchain,
// the apt headers listed in docs/WEB_PORT.md, and emsdk 4.0.23 on PATH
// (`source .emsdk/emsdk_env.sh`). The first missing one to bite fails its
// step loudly rather than being skipped.
//
// Must be run WITH `ULTIMA4_DATA` pointing at a verified original
// ultima4.zip: without it every real-engine e2e spec skips and the gate
// would pass without ever booting the game. It therefore refuses to run
// unless `--allow-skip-real-data` is passed (then it warns loudly).
// `--dry-run` prints the steps and runs nothing.

export const RELEASE_STEPS = [
  // ---- artifacts every later step reads ----
  ["deps:host"],
  ["build:modules"],
  ["deps:wasm"],
  ["build:wasm"],
  ["build:native"],
  ["check:build-fresh"],
  ["cmake:configure"],
  ["cmake:build"],
  // ---- checks ----
  ["typecheck"],
  ["test:unit"],
  ["test:native"],
  ["i18n:check", "--strict"],
  ["verify:repo-sources"],
  ["build:site", "--base=/ultima/"],
  ["audit:dist", "--require-engine"],
  ["verify:workflow"],
  ["verify:release-docs"],
  ["test:e2e", "--project=chromium", "--workers=1"]
]

/** The release steps as `npm` argument lists plus a printable label. */
export function releaseSteps() {
  return RELEASE_STEPS.map(([script, ...extra]) => {
    const args = ["run", script, ...(extra.length > 0 ? ["--", ...extra] : [])]
    return { label: `npm ${args.join(" ")}`, args }
  })
}

function spawnRunner(step) {
  const result = spawnSync("npm", step.args, { stdio: "inherit" })
  return result.status ?? 1
}

/**
 * Runs the gate and returns the process exit code. `runner(step)` returns a
 * step's exit code (injected by unit tests; defaults to spawning npm).
 */
export function runRelease({ env = process.env, argv = [], runner = spawnRunner, log = console.log, error = console.error } = {}) {
  const steps = releaseSteps()

  if (argv.includes("--dry-run")) {
    log("verify:release (dry run) would run:")
    steps.forEach((step, index) => log(`  ${index + 1}. ${step.label}`))
    return 0
  }

  if (!env["ULTIMA4_DATA"]) {
    if (!argv.includes("--allow-skip-real-data")) {
      error(
        "verify:release refused: ULTIMA4_DATA is not set, so every real-engine e2e spec would skip. " +
          "Set ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip (or pass --allow-skip-real-data to run without it)."
      )
      return 2
    }
    error("WARNING: ULTIMA4_DATA is not set -- real-engine e2e specs will SKIP; this is not a full release verification.")
  }

  const results = []
  for (const step of steps) {
    log(`\n=== verify:release: ${step.label}`)
    const code = runner(step)
    results.push({ label: step.label, code })
    log(`=== ${step.label} -> exit ${code}`)
    if (code !== 0) {
      break
    }
  }

  log("\nverify:release summary:")
  for (const { label, code } of results) {
    log(`  ${code === 0 ? "ok  " : "FAIL"} ${label} (exit ${code})`)
  }
  const failed = results.find(({ code }) => code !== 0)
  if (failed !== undefined) {
    error(`verify:release failed at: ${failed.label} (exit ${failed.code})`)
    return failed.code
  }
  log(`verify:release passed (${results.length}/${steps.length} steps).`)
  return 0
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
}

if (isMainModule()) {
  process.exitCode = runRelease({ argv: process.argv.slice(2) })
}
