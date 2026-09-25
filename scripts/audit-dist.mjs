import { readdirSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { FORBIDDEN_BASENAMES, FORBIDDEN_EXTENSIONS } from "./check-base-path.mjs"

// Todo 19 (`.github/workflows/pages.yml`) scope only: catch the two ways a
// built `dist/` artifact can leak something it must never serve --
// (1) original Ultima IV game data (AGENTS.md's absolute ban) and
// (2) dev/build-tooling files that were never meant to be static assets.
// Todo 18 ("harden failure, privacy, and regression boundaries") extends
// this with test-hook/cheat-API/XSS/memory checks; this script deliberately
// does not attempt those yet.

export class DistAuditError extends Error {}

// Same forbidden-original-game-data extensions as
// scripts/repo-source-verifier.mjs's rejectTrackedOriginalGameData, applied
// to the build artifact's files instead of the Git index.
const originalGameDataExtension = /\.(zip|sav|ega|map|tlk|exe)$/i

function collectFiles(rootDir) {
  const files = []
  const stack = [rootDir]
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
 * Audits a built GitHub Pages artifact directory (e.g. `dist/`) for the
 * two leaks Todo 19 must catch: original Ultima IV game data, and
 * development/build-tooling files. Throws a `DistAuditError` describing the
 * first violation found; returns the number of files scanned otherwise.
 */
export function auditDist(distDir) {
  let files
  try {
    files = collectFiles(distDir)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown read error"
    throw new DistAuditError(`cannot read dist artifact at ${distDir}: ${reason}`)
  }

  const hasIndexAtRoot = files.some((filePath) => filePath === join(distDir, "index.html"))
  if (!hasIndexAtRoot) {
    throw new DistAuditError(`expected ${join(distDir, "index.html")} to exist at the artifact root`)
  }

  const leakedOriginalData = files.find((filePath) => originalGameDataExtension.test(filePath))
  if (leakedOriginalData !== undefined) {
    throw new DistAuditError(
      `dist artifact contains what looks like original game data: ${leakedOriginalData}`
    )
  }

  const leakedTooling = files.find((filePath) => {
    const name = basename(filePath)
    return FORBIDDEN_BASENAMES.has(name) || FORBIDDEN_EXTENSIONS.has(extname(name))
  })
  if (leakedTooling !== undefined) {
    throw new DistAuditError(`dist artifact contains server-only/tooling file(s): ${leakedTooling}`)
  }

  return files.length
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
}

if (isMainModule()) {
  const dirArg = process.argv.slice(2).find((arg) => arg.startsWith("--dir="))
  const dir = dirArg !== undefined ? dirArg.slice("--dir=".length) : "dist"

  try {
    const fileCount = auditDist(dir)
    console.log(`audit:dist passed for "${dir}" (${fileCount} file(s) scanned, no original data or tooling leak).`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown dist audit error"
    console.error(`audit:dist failed: ${reason}`)
    process.exitCode = 1
  }
}
