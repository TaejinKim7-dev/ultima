import { spawnSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const buildDir = resolve(repoRoot, "build/native")

const [command, ...extraArgs] = process.argv.slice(2)

function run(bin, args) {
  const result = spawnSync(bin, args, { stdio: "inherit", cwd: repoRoot })

  if (result.error !== undefined) {
    console.error(`Unable to execute ${bin}: ${result.error.message}`)
    process.exitCode = 127
  } else {
    process.exitCode = result.status ?? 1
  }
}

if (command === "version") {
  run("cmake", ["--version"])
} else if (command === "configure") {
  run("cmake", ["-S", repoRoot, "-B", buildDir, ...extraArgs])
} else if (command === "build") {
  run("cmake", ["--build", buildDir, ...extraArgs])
} else if (command === "test") {
  run("ctest", ["--test-dir", buildDir, "--output-on-failure", ...extraArgs])
} else {
  console.error("Usage: node scripts/cmake-wrapper.mjs <version|configure|build|test> [-- extra args]")
  process.exitCode = 1
}
