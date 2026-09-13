import { spawnSync } from "node:child_process"

const [command] = process.argv.slice(2)

if (command === "version") {
  const result = spawnSync("cmake", ["--version"], { stdio: "inherit" })

  if (result.error !== undefined) {
    console.error(`Unable to execute cmake --version: ${result.error.message}`)
    process.exitCode = 127
  } else {
    process.exitCode = result.status ?? 1
  }
} else if (command === "configure" || command === "build" || command === "test") {
  console.error(`cmake:${command} is unavailable until the future native workflow is implemented.`)
  process.exitCode = 1
} else {
  console.error("Usage: node scripts/cmake-wrapper.mjs <version|configure|build|test>")
  process.exitCode = 1
}
