import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, cpSync, symlinkSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const buildBoron = process.env.BORON_HOST_DIR ?? resolve(repoRoot, "build/host/boron")
const buildFaun = process.env.FAUN_HOST_DIR ?? resolve(repoRoot, "build/host/faun")
const vendorXu4 = resolve(repoRoot, "vendor/xu4")
const buildXu4Src = resolve(repoRoot, "build/host/xu4-src")
const shimDir = resolve(buildXu4Src, "vendor-shim/boron")

function requireBuilt(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`${path} not found -- run "${hint}" first`)
  }
}

function main() {
  requireBuilt(resolve(buildBoron, "libboron.a"), "npm run deps:host")
  requireBuilt(resolve(buildFaun, "libfaun.a"), "npm run deps:host")

  // xu4's own Makefile builds in-place (object files and the `xu4` binary
  // land in src/ next to the Makefile). vendor/xu4 is a pinned export
  // verified by tree hash, so we build from a disposable copy under build/
  // instead, same rationale as Boron/Faun in deps-host.mjs.
  rmSync(buildXu4Src, { recursive: true, force: true })
  cpSync(vendorXu4, buildXu4Src, { recursive: true })
  console.log(`Copied vendor/xu4 -> ${buildXu4Src}`)

  // module.h and friends do `#include <boron/urlan.h>`, but
  // vendor/boron/include/ has no "boron" subdirectory (make install-dev
  // creates that layout under /usr/local, which we don't have write access
  // to and don't want to depend on). Build the same kind of shim used by
  // native/CMakeLists.txt (Todo 2), scoped to this disposable copy.
  mkdirSync(shimDir, { recursive: true })
  for (const header of ["urlan.h", "boron.h", "urlan_atoms.h"]) {
    const dest = resolve(shimDir, header)
    if (!existsSync(dest)) {
      symlinkSync(resolve(buildBoron, "include", header), dest)
    }
  }

  // UI=glfw / SOUND=faun select the GLFW backend and Faun audio backend
  // (see vendor/xu4/src/Makefile). Boron+pthread are linked unconditionally
  // by that Makefile. CPATH/LIBRARY_PATH let gcc/g++ find the boron/faun
  // headers and libraries without fighting the Makefile's own CXXFLAGS
  // assignment (a command-line CXXFLAGS override would replace it wholesale
  // and break the UI/GPU conditionals). LIBS is overridden directly because
  // Faun was built --static (libfaun.a only): its own transitive
  // dependencies (pulse/vorbisfile/FLAC) don't get pulled in automatically
  // the way linking a shared libfaun.so would, so they must be listed
  // explicitly, after -lfaun, on the xu4 link line.
  const env = {
    ...process.env,
    // CPATH entries are search roots, so this must be vendor-shim/ (the
    // directory containing the "boron" subfolder), not vendor-shim/boron/
    // itself -- #include <boron/urlan.h> needs "boron/urlan.h" to resolve
    // under one of the CPATH roots.
    CPATH: [dirname(shimDir), buildFaun].join(":"),
    LIBRARY_PATH: [buildBoron, buildFaun].join(":")
  }

  execFileSync(
    "make",
    [
      "-C", resolve(buildXu4Src, "src"),
      "-f", "Makefile",
      "UI=glfw",
      "SOUND=faun",
      `LDFLAGS=-L${buildBoron} -L${buildFaun}`,
      "LIBS=-lglfw -lfaun -lboron -lpthread -lGL -lpng -lz -lpulse -lvorbisfile -lFLAC"
    ],
    { env, stdio: "inherit" }
  )

  const xu4Bin = resolve(buildXu4Src, "src/xu4")
  if (!existsSync(xu4Bin)) {
    throw new Error(`build did not produce ${xu4Bin}`)
  }
  console.log(`Built native xu4: ${xu4Bin}`)
}

try {
  main()
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown build:native error"
  console.error(`build:native failed: ${reason}`)
  process.exitCode = 1
}
