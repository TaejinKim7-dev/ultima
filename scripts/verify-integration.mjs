// `npm run verify:integration` (Todo 28): the whole integration gate as ONE
// ordered script, so no step can be forgotten when it is typed by hand. The
// 2026-09-30 incident ran e2e after build:wasm but without build:modules.
//
//   npm run verify:integration                  # everything, e2e last
//   npm run verify:integration -- --skip=e2e    # quick gate
//
// Each step's command and exit code are appended to
// .omo/evidence/ultima-web/integration/verify-integration.log.
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const npm = (script, ...args) => ["npm", "run", script, ...(args.length > 0 ? ["--", ...args] : [])]

export const INTEGRATION_STEPS = [
  { name: "build:modules", cmd: npm("build:modules") },
  { name: "build:wasm", cmd: npm("build:wasm") },
  { name: "check:build-fresh", cmd: npm("check:build-fresh") },
  { name: "test:unit", cmd: npm("test:unit") },
  { name: "verify:repo-sources", cmd: npm("verify:repo-sources") },
  { name: "typecheck", cmd: npm("typecheck") },
  { name: "build", cmd: npm("build") },
  { name: "i18n:check", cmd: npm("i18n:check", "--strict") },
  { name: "build:site", cmd: npm("build:site", "--base=/ultima/") },
  { name: "audit:dist", cmd: npm("audit:dist", "--require-engine") },
  { name: "plan cmp", cmd: ["cmp", ".omo/plans/ultima-web.md", "docs/ULTIMA_WEB_PLAN.md"] },
  { name: "git diff --check", cmd: ["git", "diff", "--check"] },
  { name: "e2e", cmd: ["npx", "playwright", "test", "--project=chromium", "--workers=1"], needsData: true }
]

/** Runs `steps` in order via `runner(step) -> exitCode`, stopping at the first nonzero exit. */
export async function runSteps(steps, runner, { skip = [] } = {}) {
  const log = []
  for (const step of steps) {
    if (skip.includes(step.name)) {
      log.push(`${step.name}: SKIPPED`)
      continue
    }
    const exitCode = await runner(step)
    log.push(`${step.name}: exit ${exitCode}`)
    if (exitCode !== 0) {
      return { ok: false, failedStep: step.name, exitCode, log }
    }
  }
  return { ok: true, log }
}

function spawnStep(step) {
  return new Promise((resolvePromise) => {
    console.log(`\n=== verify:integration: ${step.name} (${step.cmd.join(" ")}) ===`)
    const child = spawn(step.cmd[0], step.cmd.slice(1), { cwd: repoRoot, stdio: "inherit" })
    child.on("exit", (code) => resolvePromise(code ?? 1))
    child.on("error", () => resolvePromise(1))
  })
}

async function main() {
  const skipArg = process.argv.slice(2).find((arg) => arg.startsWith("--skip="))
  const skip = skipArg ? skipArg.slice("--skip=".length).split(",") : []
  const data = process.env["ULTIMA4_DATA"]
  if (!skip.includes("e2e") && (!data || !existsSync(data))) {
    console.error("verify:integration: set ULTIMA4_DATA to a verified original ultima4.zip (or pass --skip=e2e)")
    process.exit(1)
  }
  const evidenceDir = resolve(repoRoot, ".omo/evidence/ultima-web/integration")
  mkdirSync(evidenceDir, { recursive: true })
  const result = await runSteps(INTEGRATION_STEPS, spawnStep, { skip })
  const header = `# verify:integration ${new Date().toISOString()} ${result.ok ? "PASS" : `FAIL at ${result.failedStep}`}`
  appendFileSync(resolve(evidenceDir, "verify-integration.log"), [header, ...result.log, ""].join("\n"))
  console.log(`\n${header}\n${result.log.join("\n")}`)
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
