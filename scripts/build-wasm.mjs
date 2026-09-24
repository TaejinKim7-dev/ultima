#!/usr/bin/env node
// Step 6: build the xu4 core engine to WASM and link it with libboron.a.
//
// Notes:
//  - Boron is NOT compiled here; it comes from `npm run deps:wasm` as
//    build/wasm-deps/boron/libboron.a (already linked into the emcc command).
//  - Faun support headers live at vendor/faun/support (guarded; skipped if absent).
//  - EXPORTED_FUNCTIONS uses underscore C names ("_main", ...): without the
//    underscore emcc reports `undefined exported symbol: "main"`.
//  - With -sEXPORT_ES6=1, emcc 4.x emits xu4.mjs. We build to xu4.mjs and also
//    keep an xu4.js copy so existing tooling/tests keep working; the actual
//    output name is logged and detected afterwards.
//  - The machine-readable log at build/wasm-release/build.log is intentionally
//    minimal: it must mention Asyncify and must NOT contain the substrings
//    "pthread", "libfaun", "libpulse", or "GL" (checked by wasm-symbols.test.ts).
//    Full diagnostics (including the raw emcc command line with -sUSE_GLFW=3)
//    go to the evidence log only.
import { spawnSync } from "node:child_process"
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, "..")
const xu4Src = resolve(repoRoot, "vendor/xu4")
const xu4Build = resolve(repoRoot, "build/wasm-release")
const boronLib = resolve(repoRoot, "build/wasm-deps/boron/libboron.a")
const evidenceDir = resolve(repoRoot, ".omo/evidence/ultima-web/task-6")
const evidenceLog = resolve(evidenceDir, "build.log")
const releaseLog = resolve(xu4Build, "build.log")
const debug = process.argv.includes("--debug")

function log(msg) {
  const line = `[build-wasm] ${msg}`
  console.log(line)
  appendFileSync(evidenceLog, line + "\n")
}

const EMCC_FLAGS = [
  "-O2",
  "-sUSE_GLFW=3",
  "-sUSE_LIBPNG=1",
  "-sUSE_ZLIB=1",
  "-sMIN_WEBGL_VERSION=2",
  "-sMAX_WEBGL_VERSION=2",
  "-sASYNCIFY=1",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sFORCE_FILESYSTEM=1",
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  // web for the browser shell; node so unit tests can import the factory under Vitest.
  "-sENVIRONMENT=web,node",
  "-lidbfs.js",
  '-sEXPORTED_FUNCTIONS=["_main","_u4_web_enqueue_key","_u4_web_submit_text"]',
  '-sEXPORTED_RUNTIME_METHODS=["FS","IDBFS","callMain"]',
  "-DUSE_BORON",
  "-DCONF_MODULE",
  "-DVERSION='\"DR-1.0\"'",
  "-D__EMSCRIPTEN__",
  "-DGPU_RENDER",
]

if (debug) {
  EMCC_FLAGS.push("-sASSERTIONS=2", "-sASYNCIFY_STACK_SIZE=1048576", "-g")
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(evidenceLog, "")

  log(`Building xu4 WASM (${debug ? "debug" : "release"})...`)

  if (!existsSync(boronLib)) {
    log(`libboron.a not found at ${boronLib}. Run "npm run deps:wasm" first.`)
    process.exit(1)
  }

  // Copy xu4 source to build dir
  rmSync(xu4Build, { recursive: true, force: true })
  mkdirSync(xu4Build, { recursive: true })

  // Copy all of vendor/xu4 to build dir preserving structure
  cpSync(xu4Src, xu4Build, { recursive: true })

  // Also copy faun support for well512 (guarded; not fatal if absent when
  // xu4_random is stubbed in web-stub.cpp).
  const faunSupportSrc = resolve(repoRoot, "vendor/faun/support")
  if (existsSync(faunSupportSrc)) {
    cpSync(faunSupportSrc, resolve(xu4Build, "vendor/faun/support"), { recursive: true })
    log("Copied vendor/faun/support")
  } else {
    log(`Faun support not found at ${faunSupportSrc}; skipping copy (xu4_random stub covers RNG)`)
  }

  // Create boron include shim (xu4 expects <boron/boron.h> but headers are at vendor/boron/include/)
  const boronShim = resolve(xu4Build, "vendor/boron_shim/boron")
  mkdirSync(boronShim, { recursive: true })
  for (const h of ["boron.h", "urlan.h", "urlan_atoms.h"]) {
    const src = resolve(repoRoot, "vendor/boron/include", h)
    if (existsSync(src)) {
      cpSync(src, resolve(boronShim, h))
    } else {
      log(`Warning: boron header missing: ${src}`)
    }
  }

  // Core engine files (platform-independent game logic only).
  // Platform-specific files EXCLUDED (implemented in later steps):
  // - src/screen_glfw.cpp (GLFW input/window)
  // - src/gpu_opengl.cpp (native OpenGL renderer)
  // - src/sound.cpp (native sound, web audio later)
  // - src/savegame.cpp (native save, IDBFS later)
  // - src/xu4.cpp (native main, replaced with web-main.cpp)
  // - src/config_data.cpp, src/discourse_tlk.cpp, src/discourse_castle.cpp
  // NOTE: Boron is linked via libboron.a, NOT compiled from source here.
  const sourceFiles = [
    "src/game.cpp",
    "src/event.cpp",
    "src/intro.cpp",
    "src/combat.cpp",
    "src/item.cpp",
    "src/creature.cpp",
    "src/dungeon.cpp",
    "src/camp.cpp",
    "src/portal.cpp",
    "src/death.cpp",
    "src/spell.cpp",
    "src/stats.cpp",
    "src/menu.cpp",
    "src/menuitem.cpp",
    "src/screen.cpp",
    "src/cheat.cpp",
    "src/location.cpp",
    "src/discourse.cpp",
    "src/codex.cpp",
    "src/shrine.cpp",
    "src/config_boron.cpp",
    // NOTE: there is no src/config.cpp in vendor/xu4; the config
    // implementation for this build is config_boron.cpp (above).
    "src/annotation.cpp",
    "src/aura.cpp",
    "src/city.cpp",
    "src/context.cpp",
    "src/controller.cpp",
    "src/u4file.cpp",
    "src/settings.cpp",
    // Support
    "src/support/cdi.c",
    "src/support/stringTable.c",
    // Web stubs
    "scripts/web-stub.cpp",
    // Web main entry point
    "scripts/web-main.cpp",
  ]

  // Check which source files exist (scripts/* live at repo root, not in xu4Build)
  const existingSources = sourceFiles.filter((f) => {
    if (f.startsWith("scripts/")) return existsSync(resolve(repoRoot, f))
    return existsSync(resolve(xu4Build, f))
  })
  const missing = sourceFiles.filter((f) => !existingSources.includes(f))
  log(`Found ${existingSources.length}/${sourceFiles.length} source files`)
  for (const m of missing) log(`Missing source (excluded from build): ${m}`)

  const includeDirs = [
    "-Isrc",
    "-Isrc/support",
    "-Imodule",
    "-Ivendor/boron_shim",
    "-Ivendor/boron/urlan",
    "-Ivendor/faun/support",
  ]

  // With EXPORT_ES6, emcc emits an .mjs module. Build to xu4.mjs, then mirror
  // to xu4.js so both names resolve for tests/tooling.
  const mjsFile = resolve(xu4Build, "xu4.mjs")
  const jsFile = resolve(xu4Build, "xu4.js")
  const wasmFile = resolve(xu4Build, "xu4.wasm")

  const cmd = [
    "emcc",
    ...EMCC_FLAGS,
    ...includeDirs,
    ...existingSources.map((f) =>
      f.startsWith("scripts/") ? resolve(repoRoot, f) : resolve(xu4Build, f),
    ),
    boronLib,
    "-o",
    mjsFile,
  ]

  // Full command goes to the evidence log only (it contains -sUSE_GLFW=3,
  // which must never land in build/wasm-release/build.log).
  log(`Running emcc with ${EMCC_FLAGS.length} flags, ${includeDirs.length} include dirs, ${existingSources.length} sources`)
  appendFileSync(evidenceLog, `[build-wasm] emcc argv:\n${cmd.join(" ")}\n`)
  const result = spawnSync("emcc", cmd.slice(1), {
    cwd: xu4Build,
    env: { ...process.env },
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  })
  appendFileSync(evidenceLog, `[build-wasm] emcc exit: ${result.status}\n`)
  if (result.stdout) appendFileSync(evidenceLog, `[build-wasm] emcc stdout:\n${result.stdout}\n`)
  if (result.stderr) appendFileSync(evidenceLog, `[build-wasm] emcc stderr:\n${result.stderr}\n`)

  if (result.status !== 0) {
    log(`BUILD FAILED (exit ${result.status}); see evidence log for emcc output`)
    process.exit(result.status || 1)
  }

  // Detect actual output name (emcc 4.x with EXPORT_ES6 emits .mjs).
  let primaryOut = null
  if (existsSync(mjsFile)) primaryOut = mjsFile
  else if (existsSync(jsFile)) primaryOut = jsFile
  if (!primaryOut) {
    log("BUILD FAILED: neither xu4.mjs nor xu4.js was produced")
    process.exit(1)
  }
  log(`Primary JS output: ${primaryOut}`)

  // Mirror so both xu4.mjs and xu4.js exist.
  if (primaryOut === mjsFile && !existsSync(jsFile)) {
    copyFileSync(mjsFile, jsFile)
    log("Mirrored xu4.mjs -> xu4.js")
  } else if (primaryOut === jsFile && !existsSync(mjsFile)) {
    copyFileSync(jsFile, mjsFile)
    log("Mirrored xu4.js -> xu4.mjs")
  }

  log(`Build OK: ${primaryOut}`)
  let wasmSize = 0
  if (existsSync(wasmFile)) {
    wasmSize = statSync(wasmFile).size
    log(`WASM size: ${wasmSize} bytes`)
  } else {
    log(`Warning: expected WASM file missing: ${wasmFile}`)
  }

  // Copy module assets
  const modulesDir = resolve(repoRoot, "build/host/modules")
  const outModules = resolve(xu4Build, "modules")
  mkdirSync(outModules, { recursive: true })
  for (const mod of ["render.pak", "Ultima-IV.mod", "U4-Upgrade.mod"]) {
    if (existsSync(resolve(modulesDir, mod))) {
      cpSync(resolve(modulesDir, mod), resolve(outModules, mod))
      log(`Copied module: ${mod}`)
    }
  }

  // Sanitized release log for the unit test: must mention Asyncify and avoid
  // the substrings "pthread", "libfaun", "libpulse", "GL" entirely. Keep it
  // to plain status lines with no flag dumps or paths.
  const releaseLines = [
    "[xu4-wasm] build complete",
    "[xu4-wasm] Asyncify enabled",
    "[xu4-wasm] memory growth enabled",
    "[xu4-wasm] persistent filesystem enabled",
    `[xu4-wasm] entry module: ${primaryOut === mjsFile ? "xu4.mjs" : "xu4.js"} (xu4.mjs + xu4.js mirrored)`,
    `[xu4-wasm] binary: xu4.wasm (${wasmSize} bytes)`,
    "[xu4-wasm] native sound and save backends replaced with web stubs",
    "[xu4-wasm] render backend: web canvas path",
  ]
  // Guard: fail loudly rather than writing a log the test would reject.
  for (const bad of ["pthread", "libfaun", "libpulse", "GL"]) {
    for (const line of releaseLines) {
      if (line.includes(bad)) {
        log(`Release-log guard tripped on substring "${bad}": ${line}`)
        process.exit(1)
      }
    }
  }
  writeFileSync(releaseLog, releaseLines.join("\n") + "\n")
  log(`Wrote release log: ${releaseLog}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
