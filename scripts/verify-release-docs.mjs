import { resolve } from "node:path"
import { verifyReleaseDocs } from "./release-docs-verifier.mjs"

const rootArg = process.argv.slice(2).find((arg) => arg.startsWith("--root="))
const root = resolve(rootArg !== undefined ? rootArg.slice("--root=".length) : ".")

try {
  const result = verifyReleaseDocs(root)
  // Two different outcomes, printed as two different things so a reader can
  // tell a satisfied TRACKED requirement from skipped LOCAL-ONLY evidence.
  console.log(`Release docs verification passed for ${root}.`)
  console.log(`  tracked requirements (hard, satisfied):`)
  console.log(`    tracked artifacts   : ${result.tracked.present}/${result.tracked.required} present`)
  console.log(`    plan byte-identical : ${result.planMirror ? "yes" : "no"}`)
  console.log(`    package scripts     : ${result.scripts} (every documented \`npm run\` resolves)`)
  console.log(`    release docs        : ${result.docs}`)
  console.log(`    source pins         : ${result.components}`)
  console.log(
    `  local-only evidence (soft, \`.omo/evidence/\` is git-ignored): ` +
      `${result.evidence.documented} documented, ${result.evidence.present} present locally, ` +
      `${result.evidence.skipped} skipped`
  )
  if (result.warnings.length > 0) {
    console.log(`  SKIPPED (not a pass, not a failure -- no local evidence for these paths):`)
    for (const warning of result.warnings) {
      console.log(`    - ${warning}`)
    }
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown verification error"
  console.error(`Release docs verification failed: ${reason}`)
  process.exitCode = 1
}