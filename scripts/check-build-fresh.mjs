import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { checkFreshness } from "./lib/build-stamp.mjs"

const rootArg = process.argv.slice(2).find((arg) => arg.startsWith("--root="))
const root = rootArg ? resolve(rootArg.slice("--root=".length)) : resolve(dirname(fileURLToPath(import.meta.url)), "..")

const result = checkFreshness(root)
for (const note of result.notes) console.log(`check:build-fresh: ${note}`)
if (!result.ok) {
  console.error(`check:build-fresh failed -- stale build artifacts:\n  - ${result.problems.join("\n  - ")}`)
  process.exit(1)
}
console.log("check:build-fresh passed: every built artifact matches its sources.")
