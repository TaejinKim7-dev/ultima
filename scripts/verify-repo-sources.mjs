import { resolve } from "node:path"
import { verifyRepositorySources } from "./repo-source-verifier.mjs"

const repositoryRoot = resolve(process.argv[2] ?? process.cwd())

try {
  const componentCount = verifyRepositorySources(repositoryRoot)
  console.log(`Repository source verification passed for ${componentCount} pinned components.`)
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown verification error"
  console.error(`Repository source verification failed: ${reason}`)
  process.exitCode = 1
}
