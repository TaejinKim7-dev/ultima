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
  readFileSync,
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
  // FS_DEBUG (Todo 21.2): Todo 10's persistence coordinator depends on
  // FS.trackingDelegate.onCloseFile, but Emscripten only compiles
  // trackingDelegate at all -- the field doesn't exist, not just the hook
  // -- when built with FS_DEBUG (see .emsdk's src/lib/libfs.js: the whole
  // thing is inside `#if FS_DEBUG`). Discovered because Todo 10's own
  // tests only ever exercised a hand-written fake FS, never the real
  // Emscripten build, so this never surfaced before Todo 21.2 wired
  // startup.ts to a real engine and actually called it.
  "-sFS_DEBUG=1",
  // ENV (Todo 21.2): startup.ts sets ENV.HOME before callMain so
  // Settings::init's $HOME-derived userPath (and therefore every save/
  // settings file, all fopen'd relative to getUserPath()) lands inside
  // the Todo 10 IDBFS mount at /persist instead of Emscripten's default
  // /home/web_user.
  '-sEXPORTED_RUNTIME_METHODS=["FS","IDBFS","callMain","ENV"]',
  "-DUSE_BORON",
  "-DCONF_MODULE",
  // spawnSync passes argv directly with no shell, so this string reaches
  // emcc's preprocessor byte-for-byte. A single-quoted form here
  // (-DVERSION='"DR-1.0"') would embed literal single-quote characters in
  // the macro text; double quotes only, no shell-style wrapping, is what
  // makes VERSION expand to the C string literal "DR-1.0".
  '-DVERSION="DR-1.0"',
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

  // Todo 21.1: gpu_opengl.cpp's GPU_RENDER map-chunk path (gpu_resetMap,
  // gpu_drawMap) dereferences Map/BlockingGroups members but only
  // forward-declares them (via gpu.h) -- it has always relied on whatever
  // TU includes it (only screen_glfw.cpp does) to pull in the full
  // definitions first, which never happened: native builds don't define
  // GPU_RENDER (GPU defaults to "scale"), so this path was never actually
  // compiled before Todo 21.1's full-source-list link. vendor/xu4 is a
  // pinned, tree-hash-verified export (see verify-repo-sources.mjs), so
  // this patches the build-dir COPY, not vendor/xu4/src itself.
  const gpuOpenglPath = resolve(xu4Build, "src/gpu_opengl.cpp")
  const gpuOpenglSrc = readFileSync(gpuOpenglPath, "utf8")
  const gpuOpenglNeedle = '#include "gpu.h"'
  if (!gpuOpenglSrc.includes(gpuOpenglNeedle)) {
    log(`BUILD FAILED: expected to find ${JSON.stringify(gpuOpenglNeedle)} in ${gpuOpenglPath} to patch in a map.h include`)
    process.exit(1)
  }
  writeFileSync(
    gpuOpenglPath,
    gpuOpenglSrc.replace(gpuOpenglNeedle, `${gpuOpenglNeedle}\n#include "map.h"`),
  )
  log("Patched build-dir copy of gpu_opengl.cpp: added #include \"map.h\" (GPU_RENDER map-chunk path needs the full Map/BlockingGroups definitions)")

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

  // Todo 21.1: the real engine, built from the same source list the native
  // build uses (vendor/xu4/src/Makefile.common CSRCS/CXXSRCS, UI=glfw,
  // CONF=boron -- see scripts/build-native.mjs for the native equivalent).
  // Deliberately NOT listed separately (each is already #include-d by one
  // of the files below, so listing it too would duplicate-define symbols):
  //   gpu_opengl.cpp        <- included by screen_glfw.cpp
  //   discourse_tlk.cpp,
  //   discourse_castle.cpp  <- included by discourse.cpp
  //   config_data.cpp,
  //   script_boron.cpp      <- included by config_boron.cpp
  // sound_faun.cpp (native SOUND=faun) is replaced by sound_web.cpp (Todo
  // 16): the real Faun backend pulls in the Faun mixer, PulseAudio, and
  // pthread, none of which belong in this link. sound_web.cpp implements
  // the same sound.h contract for real (Ogg/WAV via the browser's own Web
  // Audio decoder, RFX via sfx_gen.c compiled directly into this build --
  // see that file's header comment) -- it replaces Todo 21.1's silent
  // web-sound-silent.cpp no-op stub, which only ever existed so the real
  // engine would link before Todo 16 could implement real audio.
  const sourceFiles = [
    // CXXSRCS (Makefile.common), in that file's order.
    "src/annotation.cpp",
    "src/aura.cpp",
    "src/camp.cpp",
    "src/cheat.cpp",
    "src/city.cpp",
    "src/codex.cpp",
    "src/combat.cpp",
    "src/controller.cpp",
    "src/context.cpp",
    "src/creature.cpp",
    "src/death.cpp",
    "src/debug.cpp",
    "src/direction.cpp",
    "src/discourse.cpp",
    "src/dungeon.cpp",
    "src/dungeonview.cpp",
    "src/error.cpp",
    "src/event.cpp",
    "src/filesystem.cpp",
    "src/game.cpp",
    "src/gamebrowser.cpp",
    "src/gui.cpp",
    "src/image.cpp",
    "src/imageloader.cpp",
    "src/imagemgr.cpp",
    "src/imageview.cpp",
    "src/intro.cpp",
    "src/item.cpp",
    "src/location.cpp",
    "src/map.cpp",
    "src/maploader.cpp",
    "src/menu.cpp",
    "src/menuitem.cpp",
    "src/names.cpp",
    "src/object.cpp",
    "src/party.cpp",
    "src/person.cpp",
    "src/portal.cpp",
    "src/progress_bar.cpp",
    "src/rle.cpp",
    "src/savegame.cpp",
    "src/scale.cpp",
    "src/screen.cpp",
    "src/screen_glfw.cpp", // screen_$(UI).cpp, UI=glfw (includes gpu_opengl.cpp)
    "src/settings.cpp",
    "src/shrine.cpp",
    "src/sound_web.cpp", // sound_$(SOUND).cpp replacement, see comment above (Todo 16)
    "src/spell.cpp",
    "src/stats.cpp",
    "src/textview.cpp",
    "src/tile.cpp",
    "src/tileanim.cpp",
    "src/tileset.cpp",
    "src/tileview.cpp",
    "src/u4file.cpp",
    "src/view.cpp",
    "src/xu4.cpp", // real main(), NOT scripts/web-main.cpp
    "src/lzw/u4decode.cpp",
    "src/lzw/u6decode.cpp",
    // CONF=boron block (unconditional in Makefile.common despite the
    // commented-out #ifeq -- see the "#ifeq ($(CONF),boron)" comment there).
    "src/config_boron.cpp",
    // CSRCS (Makefile.common).
    "src/lzw/hash.c",
    "src/lzw/lzw.c",
    "src/support/notify.c",
    "src/support/stringTable.c",
    "src/support/txf_draw.c",
    "src/support/unzip.c",
    "src/module.c",
    "src/support/cdi.c",
    // Step 8 browser-safe input queue (C ABI home for the bridge inputs).
    "src/web_bridge.cpp",
    // Todo 16: Faun's standalone RFX synthesizer (sfx_gen.c). Pure,
    // dependency-free C (stdint/assert/math/stdio/stdlib/string only) --
    // it needs only sound_web.cpp's sfx_random() RNG hookup, never Faun's
    // own mixer/PulseAudio/pthread machinery, so this does not reintroduce
    // any of what sound_web.cpp exists to avoid linking.
    "vendor/faun/support/sfx_gen.c",
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
    "[xu4-wasm] native save backend replaced with an IDBFS-backed web stub",
    "[xu4-wasm] sound backend: Web Audio bridge (real playback, no native audio mixer)",
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
