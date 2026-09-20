import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, rmSync, cpSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const vendorBoron = resolve(repoRoot, "vendor/boron")
const buildBoron = resolve(repoRoot, "build/host/boron")

const REQUIRED_TOOLS = ["cc", "ar", "ranlib"]

function requireTool(tool) {
  const result = spawnSync(tool, ["--version"], { stdio: "ignore" })
  if (result.error !== undefined) {
    throw new Error(`required host build tool not found: ${tool}`)
  }
}

function main() {
  for (const tool of REQUIRED_TOOLS) {
    requireTool(tool)
  }
  console.log(`Host toolchain present: ${REQUIRED_TOOLS.join(", ")}`)

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
  // binary from build:modules' own working directory.
  execFileSync("bash", ["./configure", "--static"], { cwd: buildBoron, stdio: "inherit" })
  execFileSync("make", [], { cwd: buildBoron, stdio: "inherit" })

  const boronBin = resolve(buildBoron, "boron")
  if (!existsSync(boronBin)) {
    throw new Error(`build did not produce ${boronBin}`)
  }

  const helpOutput = execFileSync(boronBin, ["-h"], {
    cwd: buildBoron,
    encoding: "utf8"
  })
  const versionLine = helpOutput.split("\n")[0].trim()
  console.log(`Built host boron: ${boronBin}`)
  console.log(`boron reports: ${versionLine}`)
}

try {
  main()
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown deps:host error"
  console.error(`deps:host failed: ${reason}`)
  process.exitCode = 1
}
