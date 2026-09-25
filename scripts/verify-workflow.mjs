import { resolve } from "node:path"
import { verifyWorkflow } from "./workflow-verifier.mjs"

const workflowPath = resolve(process.argv[2] ?? ".github/workflows/pages.yml")

try {
  verifyWorkflow(workflowPath)
  console.log(`Pages workflow verification passed for ${workflowPath}.`)
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown verification error"
  console.error(`Pages workflow verification failed: ${reason}`)
  process.exitCode = 1
}
