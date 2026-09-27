import { resolve } from "node:path"
import { verifyReleaseDocs } from "./release-docs-verifier.mjs"

const rootArg = process.argv.slice(2).find((arg) => arg.startsWith("--root="))
const root = resolve(rootArg !== undefined ? rootArg.slice("--root=".length) : ".")

try {
  const result = verifyReleaseDocs(root)
  console.log(
    `Release docs verification passed for ${root} (${result.docs} doc(s), ${result.components} source pin(s)).`
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown verification error"
  console.error(`Release docs verification failed: ${reason}`)
  process.exitCode = 1
}
