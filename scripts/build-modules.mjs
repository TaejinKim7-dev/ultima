import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const boronBin = process.env.BORON_BIN ?? resolve(repoRoot, "build/host/boron/boron")
const packScript = resolve(repoRoot, "vendor/xu4/tools/pack-xu4.b")
const outDir = resolve(repoRoot, "build/host/modules")

const MODULES = [
  {
    // render.pak is a "file package" (-f): raw shader/font assets, not a
    // Boron-scripted module, so it needs an explicit -o output path.
    label: "render.pak",
    args: ["-s", packScript, "-f", resolve(repoRoot, "vendor/xu4/module/render"), "-o", "render.pak"]
  },
  {
    // Scripted modules default their output filename to <dir-basename>.mod
    // written relative to boron's cwd, which we set to outDir below.
    label: "Ultima-IV.mod",
    args: ["-s", packScript, resolve(repoRoot, "vendor/xu4/module/Ultima-IV")]
  },
  {
    label: "U4-Upgrade.mod",
    args: ["-s", packScript, resolve(repoRoot, "vendor/xu4/module/U4-Upgrade")]
  }
]

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function main() {
  if (!existsSync(boronBin)) {
    throw new Error(`host boron binary not found at ${boronBin} -- run "npm run deps:host" first`)
  }

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  for (const module of MODULES) {
    console.log(`Packing ${module.label}...`)
    execFileSync(boronBin, module.args, { cwd: outDir, stdio: "inherit" })

    const outputPath = resolve(outDir, module.label)
    if (!existsSync(outputPath) || statSync(outputPath).size === 0) {
      throw new Error(`packing did not produce a non-empty ${module.label} at ${outputPath}`)
    }
    console.log(`  ${module.label}: ${statSync(outputPath).size} bytes, sha256 ${sha256(outputPath)}`)
  }

  console.log(`Modules written to ${outDir}`)
}

try {
  main()
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown build:modules error"
  console.error(`build:modules failed: ${reason}`)
  process.exitCode = 1
}
