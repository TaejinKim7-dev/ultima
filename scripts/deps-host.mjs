import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, rmSync, cpSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const REQUIRED_TOOLS = ["cc", "ar", "ranlib"]

function requireTool(tool) {
  const result = spawnSync(tool, ["--version"], { stdio: "ignore" })
  if (result.error !== undefined) {
    throw new Error(`required host build tool not found: ${tool}`)
  }
}

function buildBoron() {
  const vendorBoron = resolve(repoRoot, "vendor/boron")
  const buildBoron = resolve(repoRoot, "build/host/boron")

  // Boron's Makefile builds in-place (.obj/, config.opt, boron, libboron.*
  // land next to the Makefile). vendor/boron is a pinned export verified by
  // tree hash in vendor/source-manifest.json, so we build from a disposable
  // copy under build/ (gitignored) instead of building in vendor/ itself.
  rmSync(buildBoron, { recursive: true, force: true })
  cpSync(vendorBoron, buildBoron, { recursive: true })
  console.log(`Copied vendor/boron -> ${buildBoron}`)

  // Default configure options match the pinned Boron 2.0.8 behavior this
  // project relies on: bundled linenoise (no readline dev package needed),
  // zlib compress, and thread support left off (there is no --no-thread
  // flag in this version; --thread is simply omitted). --static avoids
  // needing LD_LIBRARY_PATH/rpath games to run the resulting `boron`
  // binary from a different working directory (build:modules, native xu4).
  execFileSync("bash", ["./configure", "--static"], { cwd: buildBoron, stdio: "inherit" })
  execFileSync("make", [], { cwd: buildBoron, stdio: "inherit" })

  const boronBin = resolve(buildBoron, "boron")
  const boronLib = resolve(buildBoron, "libboron.a")
  if (!existsSync(boronBin) || !existsSync(boronLib)) {
    throw new Error(`boron build did not produce ${boronBin} and ${boronLib}`)
  }

  const helpOutput = execFileSync(boronBin, ["-h"], { cwd: buildBoron, encoding: "utf8" })
  console.log(`Built host boron: ${boronBin}`)
  console.log(`boron reports: ${helpOutput.split("\n")[0].trim()}`)
}

function buildFaun() {
  const vendorFaun = resolve(repoRoot, "vendor/faun")
  const buildFaun = resolve(repoRoot, "build/host/faun")

  // Same rationale as Boron: never build inside vendor/faun.
  rmSync(buildFaun, { recursive: true, force: true })
  cpSync(vendorFaun, buildFaun, { recursive: true })
  console.log(`Copied vendor/faun -> ${buildFaun}`)

  // Faun's Makefile hardcodes DEP_LIB = -lpulse -lvorbisfile -lpthread -lm
  // (+ -lFLAC for the default FLAC=1). These need libpulse-dev,
  // libvorbis-dev, and libflac-dev installed on the host -- xu4's module
  // packaging (Todo 2) never needed Faun, but the native GLFW+Faun
  // baseline (Todo 3) links it directly (see vendor/xu4/src/Makefile,
  // SOUND=faun -> -lfaun). --static avoids runtime linking games, same as
  // Boron above.
  try {
    execFileSync("bash", ["./configure", "--static"], { cwd: buildFaun, stdio: "inherit" })
    execFileSync("make", [], { cwd: buildFaun, stdio: "inherit" })
  } catch (error) {
    throw new Error(
      "faun build failed -- this usually means libpulse-dev, libvorbis-dev, " +
      "or libflac-dev is missing. Install them and re-run: " +
      "sudo apt-get install -y libpulse-dev libvorbis-dev libflac-dev " +
      `(original error: ${error instanceof Error ? error.message : String(error)})`
    )
  }

  const faunLib = resolve(buildFaun, "libfaun.a")
  if (!existsSync(faunLib)) {
    throw new Error(`faun build did not produce ${faunLib}`)
  }
  console.log(`Built host faun: ${faunLib}`)
}

function main() {
  for (const tool of REQUIRED_TOOLS) {
    requireTool(tool)
  }
  console.log(`Host toolchain present: ${REQUIRED_TOOLS.join(", ")}`)

  buildBoron()
  buildFaun()
}

try {
  main()
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown deps:host error"
  console.error(`deps:host failed: ${reason}`)
  process.exitCode = 1
}
