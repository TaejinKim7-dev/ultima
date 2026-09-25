import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, extname, basename } from "node:path"

// Files that must never appear in a static GitHub Pages build artifact --
// they are development/tooling inputs, not something a static host serves.
// Exported so other Pages-artifact checks (e.g. scripts/audit-dist.mjs) can
// reuse the same list instead of drifting from it.
export const FORBIDDEN_BASENAMES = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vite.config.js",
  "tsconfig.json",
  "playwright.config.ts",
  ".env",
  ".env.local"
])
export const FORBIDDEN_EXTENSIONS = new Set([".ts", ".tsx"])

function normalizeBase(base) {
  let normalized = base.startsWith("/") ? base : `/${base}`
  if (!normalized.endsWith("/")) {
    normalized += "/"
  }
  return normalized
}

function collectRootRelativeReferences(html) {
  const references = []
  const pattern = /\b(?:src|href)="([^"]+)"/g
  let match
  while ((match = pattern.exec(html)) !== null) {
    const value = match[1]
    if (value !== undefined && value.startsWith("/")) {
      references.push(value)
    }
  }
  return references
}

function collectDistFiles(distDir) {
  const files = []
  const stack = [distDir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) {
      continue
    }
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry)
      if (statSync(fullPath).isDirectory()) {
        stack.push(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }
  return files
}

/**
 * Verifies a Vite static build artifact matches the GitHub Pages asset
 * contract for `expectedBase`:
 *   - `dist/index.html` exists at the artifact root.
 *   - every root-relative asset reference in it starts with the expected
 *     base path (catches a build that silently used the wrong `--base`).
 *   - no server-only / build-tooling files leaked into the artifact.
 *
 * Throws with a descriptive message on any violation; never exits the
 * process itself so it can be reused from both a CLI wrapper and tests.
 */
export function checkBasePath(distDir, expectedBase) {
  const indexPath = join(distDir, "index.html")
  let html
  try {
    html = readFileSync(indexPath, "utf8")
  } catch {
    throw new Error(`expected ${indexPath} to exist at the artifact root`)
  }

  const normalizedBase = normalizeBase(expectedBase)
  const references = collectRootRelativeReferences(html)
  if (references.length === 0) {
    // A build that emits only relative references (e.g. `--base=./`) would
    // otherwise make the check below pass vacuously, having verified
    // nothing about the GitHub Pages project-site base contract.
    throw new Error(
      `dist/index.html has no root-relative asset references to verify against base "${normalizedBase}"`
    )
  }
  const mismatched = references.filter((reference) => !reference.startsWith(normalizedBase))
  if (mismatched.length > 0) {
    throw new Error(
      `dist/index.html has ${mismatched.length} asset reference(s) that do not start with base "${normalizedBase}": ${mismatched.join(", ")}`
    )
  }

  const files = collectDistFiles(distDir)
  const leaked = files.filter((filePath) => {
    const name = basename(filePath)
    return FORBIDDEN_BASENAMES.has(name) || FORBIDDEN_EXTENSIONS.has(extname(name))
  })
  if (leaked.length > 0) {
    throw new Error(`dist artifact contains server-only/tooling file(s): ${leaked.join(", ")}`)
  }

  return { checkedReferenceCount: references.length, checkedFileCount: files.length }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
}

if (isMainModule()) {
  const args = process.argv.slice(2)
  const baseArg = args.find((arg) => arg.startsWith("--base="))
  const dirArg = args.find((arg) => arg.startsWith("--dir="))
  const base = baseArg !== undefined ? baseArg.slice("--base=".length) : "/"
  const dir = dirArg !== undefined ? dirArg.slice("--dir=".length) : "dist"

  try {
    const result = checkBasePath(dir, base)
    console.log(
      `base-path check passed for base "${base}" (${result.checkedReferenceCount} asset reference(s), ${result.checkedFileCount} file(s) scanned).`
    )
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown base-path check error"
    console.error(`base-path check failed: ${reason}`)
    process.exitCode = 1
  }
}
