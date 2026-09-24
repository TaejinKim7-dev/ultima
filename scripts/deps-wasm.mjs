#!/usr/bin/env node
// Step 6: build Boron static library for WASM using the proven PATH-wrapper approach.
//
// Strategy:
//   1. Copy vendor/boron -> build/wasm-deps/boron (never build in vendor/ in place).
//   2. Create build/wasm-deps/bin with wrappers named cc/gcc/c++/ar/ranlib that
//      forward "$@" to emcc/em++/emar/emranlib, prepend it to PATH.
//   3. Run ./configure --static && make libboron.a in the copy with
//      CFLAGS carrying -O2 -sUSE_ZLIB=1 (zlib.h comes from the emcc port).
//      The Boron Makefile hardcodes `cc`/`ar`/`ranlib`, which the wrappers intercept.
//   4. Verify the objects inside libboron.a are WebAssembly (not native ELF).
//      If they are still ELF (wrappers were ignored), fall back to a hand-listed
//      direct emcc compile using the OBJ_FN source list from vendor/boron/Makefile.
import { spawnSync } from "node:child_process"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, "..")
const boronSrc = resolve(repoRoot, "vendor/boron")
const depsRoot = resolve(repoRoot, "build/wasm-deps")
const boronBuild = resolve(depsRoot, "boron")
const wrapperBin = resolve(depsRoot, "bin")
const evidenceDir = resolve(repoRoot, ".omo/evidence/ultima-web/task-6")
const logFile = resolve(evidenceDir, "deps-wasm.log")

function log(msg) {
  const line = `[deps-wasm] ${msg}`
  console.log(line)
  appendFileSync(logFile, line + "\n")
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  })
  return result
}

// Correct Boron sources derived from OBJ_FN in vendor/boron/Makefile:
//   urlan: env array binary block coord date path string context gc serialize
//          tokenize vector parse_block parse_string (+ hashmap if _HASHMAP)
//   support: str mem_util quickSortIndex fpconv (+ well512 if _RANDOM)
//   unix/os.c -> os.o ; eval: boron random port_file wait (+ port_socket if _SOCKET)
function boronSourcesForConfig(configOpt) {
  const sources = [
    "urlan/env.c",
    "urlan/array.c",
    "urlan/binary.c",
    "urlan/block.c",
    "urlan/coord.c",
    "urlan/date.c",
    "urlan/path.c",
    "urlan/string.c",
    "urlan/context.c",
    "urlan/gc.c",
    "urlan/serialize.c",
    "urlan/tokenize.c",
    "urlan/vector.c",
    "urlan/parse_block.c",
    "urlan/parse_string.c",
    "support/str.c",
    "support/mem_util.c",
    "support/quickSortIndex.c",
    "support/fpconv.c",
    "unix/os.c",
    "eval/boron.c",
  ]
  if (configOpt.includes("_HASHMAP")) sources.push("urlan/hashmap.c")
  if (configOpt.includes("_RANDOM")) sources.push("support/well512.c", "eval/random.c")
  sources.push("eval/port_file.c", "eval/wait.c")
  if (configOpt.includes("_SOCKET")) sources.push("eval/port_socket.c")
  return sources
}

async function main() {
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(logFile, "")

  log("Building Boron for WASM (static library) via PATH-wrapper + configure/make...")

  // 1. Copy vendor/boron out to the build tree (copy-out build only).
  rmSync(boronBuild, { recursive: true, force: true })
  mkdirSync(depsRoot, { recursive: true })
  {
    const r = run("cp", ["-a", boronSrc, boronBuild])
    if (r.status !== 0) {
      log(`Failed to copy ${boronSrc} -> ${boronBuild}: ${r.stderr}`)
      process.exit(1)
    }
  }
  log(`Copied vendor/boron -> ${boronBuild}`)

  // 2. PATH wrappers: cc/gcc -> emcc, c++ -> em++, ar -> emar, ranlib -> emranlib.
  rmSync(wrapperBin, { recursive: true, force: true })
  mkdirSync(wrapperBin, { recursive: true })
  const wrappers = { cc: "emcc", gcc: "emcc", "c++": "em++", ar: "emar", ranlib: "emranlib" }
  for (const [name, target] of Object.entries(wrappers)) {
    const p = resolve(wrapperBin, name)
    writeFileSync(p, `#!/bin/sh\nexec ${target} "$@"\n`)
    chmodSync(p, 0o755)
  }
  log(`Wrote compiler wrappers in ${wrapperBin}: ${Object.keys(wrappers).join(", ")}`)

  const wasmEnv = {
    ...process.env,
    PATH: `${wrapperBin}:${process.env.PATH}`,
    CFLAGS: "-O2 -sUSE_ZLIB=1",
  }

  // 3a. ./configure --static in the copy.
  log("Running ./configure --static ...")
  {
    const r = run("./configure", ["--static"], { cwd: boronBuild, env: wasmEnv })
    log(`configure stdout:\n${r.stdout}`)
    if (r.status !== 0) {
      log(`configure failed (exit ${r.status}):\n${r.stderr}`)
      process.exit(1)
    }
  }

  // NOTE: the Boron Makefile assigns CFLAGS itself, so the environment CFLAGS
  // above do NOT take effect on the make step. Pass the full compile flags on
  // the make command line (command-line variables override the Makefile).
  const makeCflags =
    "-pipe -O2 -sUSE_ZLIB=1 -std=gnu99 -Iinclude -Iurlan -Ieval -Isupport"

  // 3b. make libboron.a (library only; the `boron` executable target would try
  // to link readline/history natively, which cannot work under emcc).
  log("Running make libboron.a ...")
  {
    const r = run("make", ["libboron.a", `CFLAGS=${makeCflags}`], {
      cwd: boronBuild,
      env: wasmEnv,
    })
    log(`make stdout (tail):\n${(r.stdout || "").slice(-4000)}`)
    if (r.status !== 0) {
      log(`make failed (exit ${r.status}):\n${r.stderr}`)
      process.exit(1)
    }
  }

  const libPath = resolve(boronBuild, "libboron.a")
  if (!existsSync(libPath)) {
    log(`make reported success but ${libPath} is missing`)
    process.exit(1)
  }

  // 4. Verify objects are WebAssembly, not native ELF.
  let needFallback = false
  {
    const t = run("ar", ["t", libPath], { encoding: "utf8" })
    const firstObj = (t.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean)[0]
    log(`First object in libboron.a: ${firstObj}`)
    if (!firstObj) {
      log("libboron.a is empty; falling back to direct emcc compile")
      needFallback = true
    } else {
      const p = run("sh", ["-c", `ar p "${libPath}" "${firstObj}" | file -`], {
        encoding: "utf8",
      })
      const fileOut = (p.stdout || "").trim()
      log(`file output for ${firstObj}: ${fileOut}`)
      if (/ELF/i.test(fileOut)) {
        log("Objects are native ELF - PATH wrappers were ignored; falling back to direct emcc compile")
        needFallback = true
      } else if (/WebAssembly/i.test(fileOut)) {
        log("Objects verified as WebAssembly.")
      } else {
        log(`Unrecognized file output; assuming fallback is safer: ${fileOut}`)
        needFallback = true
      }
    }
  }

  if (needFallback) {
    buildDirectFallback(wasmEnv, libPath)
  }

  log(`libboron.a built: ${libPath}`)
}

function buildDirectFallback(wasmEnv, libPath) {
  log("Fallback: direct emcc compilation with hand-listed sources...")
  let configOpt = ""
  try {
    configOpt = readFileSync(resolve(boronBuild, "config.opt"), "utf8")
  } catch {
    configOpt = ""
  }
  log(`config.opt contents: ${configOpt.trim()}`)
  const sources = boronSourcesForConfig(configOpt)
  log(`Fallback sources (${sources.length}): ${sources.join(", ")}`)

  const objDir = resolve(boronBuild, "obj-fallback")
  rmSync(objDir, { recursive: true, force: true })
  mkdirSync(objDir, { recursive: true })
  rmSync(libPath, { force: true })

  const objectFiles = []
  for (const src of sources) {
    const srcPath = resolve(boronBuild, src)
    if (!existsSync(srcPath)) {
      log(`Warning: fallback source not found: ${srcPath}`)
      continue
    }
    const objPath = resolve(objDir, src.replace(/\//g, "_").replace(/\.c$/, ".o"))
    // NOTE: no -sSIDE_MODULE here; plain relocatable objects for a static archive.
    const args = [
      "-O2",
      "-sUSE_ZLIB=1",
      "-std=gnu99",
      "-Iinclude",
      "-Iurlan",
      "-Ieval",
      "-Isupport",
      "-c",
      srcPath,
      "-o",
      objPath,
    ]
    log(`Compiling ${src}...`)
    const r = run("emcc", args, { cwd: boronBuild, env: wasmEnv })
    if (r.status !== 0) {
      log(`Failed to compile ${src}:\n${r.stderr}\n${r.stdout}`)
      process.exit(1)
    }
    objectFiles.push(objPath)
  }

  if (objectFiles.length === 0) {
    log("Fallback compiled zero objects; aborting.")
    process.exit(1)
  }
  log(`Creating static library: ${libPath}`)
  const ar = run("emar", ["rcs", libPath, ...objectFiles], {
    cwd: boronBuild,
    env: wasmEnv,
  })
  if (ar.status !== 0) {
    log(`emar failed:\n${ar.stderr}`)
    process.exit(1)
  }
  log(`Fallback libboron.a created with ${objectFiles.length} objects.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
