import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { FORBIDDEN_BASENAMES, FORBIDDEN_EXTENSIONS } from "./check-base-path.mjs"

// Todo 19 (`.github/workflows/pages.yml`) scope: catch the two ways a
// built `dist/` artifact can leak something it must never serve --
// (1) original Ultima IV game data (AGENTS.md's absolute ban) and
// (2) dev/build-tooling files that were never meant to be static assets.
// Todo 18 ("harden failure, privacy, and regression boundaries") adds the
// content checks below: XSS sinks, non-allowlisted test hooks, cheat
// tokens, network egress, noisy console methods, and storage/secret use.

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
 * Audits a built GitHub Pages artifact directory (e.g. `dist/`) for leaks
 * Todo 19 must catch (original Ultima IV game data, dev/build-tooling
 * files) plus the Todo 18 content boundaries below (XSS sinks,
 * non-allowlisted test hooks, cheat tokens, network egress, noisy console
 * methods, storage/secret use). Throws a `DistAuditError` describing the
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

  auditShippedContent(distDir, files)

  return files.length
}

// --- Todo 18 shipped-content checks --------------------------------------

// Only executable/markup artifact files are content-scanned: bundled JS
// (including Emscripten's `.mjs` glue) and HTML with possible inline
// scripts. Assets like `.css`/`.wasm`/images carry no script.
const SCANNED_CONTENT_EXTENSIONS = new Set([".js", ".mjs", ".html"])

// (1) XSS sinks: game/bridge text must only ever reach the DOM via
// `textContent`/`createElement` (see src/shell.ts), never these.
const XSS_SINKS = [
  { label: "dangerouslySetInnerHTML", pattern: /dangerouslySetInnerHTML/ },
  { label: "insertAdjacentHTML", pattern: /insertAdjacentHTML/ },
  { label: "innerHTML", pattern: /innerHTML/ },
  { label: "outerHTML", pattern: /outerHTML/ },
  { label: "document.write", pattern: /document\.write\s*\(/ },
  { label: "eval(", pattern: /\beval\s*\(/ },
  { label: "new Function(", pattern: /\bnew\s+Function\s*\(/ }
]

// (2) Test-hook markers. Anything matching these patterns fails unless it
// is exactly one of the deliberate, documented QA/e2e hooks below --
// unknown `window.ultima*` handles, `__test__` globals, or extra
// `data-bridge-ready*` scaffolding are leftover test seams, not product.
const TEST_HOOK_OCCURRENCE = /window\.ultima[A-Za-z0-9_$]*|[A-Za-z0-9_$]*__test__[A-Za-z0-9_$]*|data-bridge-ready[A-Za-z0-9_-]*/g
export const TEST_HOOK_ALLOWLIST = [
  {
    hook: "window.ultimaBridge",
    reason: "src/main.ts deliberate Todo-16 e2e/QA bridge handle (bridge.dispatch/attachSaveHandlers)"
  },
  {
    hook: "window.ultimaInput",
    reason: "src/main.ts deliberate input-queue handle for QA/e2e key-event injection"
  },
  {
    hook: "window.ultimaAudio",
    reason: "src/main.ts deliberate Todo-16 audio observability hook (window.ultimaAudio.stats())"
  },
  {
    hook: "data-bridge-ready",
    reason: "src/main.ts shell-ready signal consumed by QA/e2e tooling and the engine startup sequence"
  }
]
const TEST_HOOK_ALLOWED = new Set(TEST_HOOK_ALLOWLIST.map((entry) => entry.hook))

// (3) Cheat/debug affordances must never ship to the static artifact.
const CHEAT_TOKENS = ["godmode", "teleport", "noclip", "giveAll", "setGold", "debugBridge"].map(
  (label) => ({ label, pattern: new RegExp(label, "i") })
)

// (4) Network egress: the static shell only ever same-origin GETs its own
// engine assets (see src/main.ts's fetchModuleAsset). POST/PUT uploads,
// beacons, sockets, event streams, and absolute cross-origin URLs fail.
const EGRESS_FETCH_METHOD = /\bmethod\s*:\s*["']?(POST|PUT)\b/i
const EGRESS_PRIMITIVES = [
  { label: "sendBeacon", pattern: /sendBeacon\s*\(/ },
  { label: "WebSocket", pattern: /\bWebSocket\b/ },
  { label: "EventSource", pattern: /\bEventSource\b/ }
]
const ABSOLUTE_URL = /https?:\/\/[^\s"'`<>(){}|\\^]+/g
export const SAME_ORIGIN_ALLOWLIST = [
  // Production Pages origin (see .github/workflows/pages.yml): absolute
  // links back to the site itself are same-origin by construction.
  "https://taejinkim7-dev.github.io"
]

// (5) Noisy console methods; `console.error`/`console.warn` stay allowed
// for the shell's failure-signalling contract.
const NOISY_CONSOLE = ["log", "debug", "info", "table"].map((method) => ({
  label: `console.${method}`,
  pattern: new RegExp(`console\\.${method}\\s*\\(`)
}))

// (6) Web Storage access and secret-like names must never ship.
const STORAGE_ACCESS = [
  { label: "localStorage", pattern: /\blocalStorage\b/ },
  { label: "sessionStorage", pattern: /\bsessionStorage\b/ }
]
const SECRET_NAMES = ["apiKey", "privateKey", "passwd", "bearer"].map((label) => ({
  label,
  pattern: new RegExp(`\\b${label}\\b`, "i")
}))

function readScannedContent(filePath) {
  try {
    return readFileSync(filePath, "utf8")
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown read error"
    throw new DistAuditError(`cannot read shipped artifact file ${filePath}: ${reason}`)
  }
}

function auditShippedContent(distDir, files) {
  const scanned = files
    .filter((filePath) => SCANNED_CONTENT_EXTENSIONS.has(extname(basename(filePath)).toLowerCase()))
    .sort()
  for (const filePath of scanned) {
    const content = readScannedContent(filePath)

    for (const sink of XSS_SINKS) {
      if (sink.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact contains XSS sink "${sink.label}" in ${filePath}`
        )
      }
    }

    const hookOccurrences = new Set(content.match(TEST_HOOK_OCCURRENCE) ?? [])
    for (const occurrence of hookOccurrences) {
      if (!TEST_HOOK_ALLOWED.has(occurrence)) {
        throw new DistAuditError(
          `dist artifact contains test-hook marker beyond the explicit allowlist: "${occurrence}" in ${filePath}`
        )
      }
    }

    for (const cheat of CHEAT_TOKENS) {
      if (cheat.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact contains cheat token "${cheat.label}" in ${filePath}`
        )
      }
    }

    const methodMatch = content.match(EGRESS_FETCH_METHOD)
    if (methodMatch !== null) {
      throw new DistAuditError(
        `dist artifact performs network egress with fetch method "${methodMatch[1].toUpperCase()}" in ${filePath}`
      )
    }
    for (const primitive of EGRESS_PRIMITIVES) {
      if (primitive.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact contains network egress primitive "${primitive.label}" in ${filePath}`
        )
      }
    }
    for (const url of content.match(ABSOLUTE_URL) ?? []) {
      let origin = null
      try {
        origin = new URL(url).origin
      } catch {
        origin = null
      }
      if (origin === null || !SAME_ORIGIN_ALLOWLIST.includes(origin)) {
        throw new DistAuditError(
          `dist artifact contains non-same-origin URL "${url}" in ${filePath} (only relative and same-origin URLs are allowed)`
        )
      }
    }

    for (const noisy of NOISY_CONSOLE) {
      if (noisy.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact contains noisy console call "${noisy.label}" in ${filePath} (only console.error/console.warn are allowed)`
        )
      }
    }

    for (const storage of STORAGE_ACCESS) {
      if (storage.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact accesses Web Storage via "${storage.label}" in ${filePath}`
        )
      }
    }
    for (const secret of SECRET_NAMES) {
      if (secret.pattern.test(content)) {
        throw new DistAuditError(
          `dist artifact contains secret-like name "${secret.label}" in ${filePath}`
        )
      }
    }
  }
}

function isMainModule() {
  return process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], "file:").href
}

if (isMainModule()) {
  const dirArg = process.argv.slice(2).find((arg) => arg.startsWith("--dir="))
  const dir = dirArg !== undefined ? dirArg.slice("--dir=".length) : "dist"

  try {
    const fileCount = auditDist(dir)
    console.log(`audit:dist passed for "${dir}" (${fileCount} file(s) scanned, no leaks or shipped-content violations).`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown dist audit error"
    console.error(`audit:dist failed: ${reason}`)
    process.exitCode = 1
  }
}
