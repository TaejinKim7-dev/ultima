import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, extname, join, relative, sep } from "node:path"
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

// Files under `dist/engine/` are EMCC-GENERATED glue (copied by
// vite.config.ts's wasmEngineAssets from build/wasm-release): Emscripten's
// SOCKFS backend ships WebSocket helpers, spec-reference comment URLs, and
// a `file://` diagnostic string that this offline single-player build never
// invokes (the game issues no socket syscalls). They get a narrowly-scoped
// reading of the egress check below -- never a skip: every other content
// check still applies to them in full, and unknown helpers/URLs still fail.
function isEngineGlueFile(distDir, filePath) {
  const rel = relative(distDir, filePath)
  return rel !== "" && !rel.startsWith("..") && rel.split(sep)[0] === "engine"
}

export const ENGINE_GLUE_ALLOWLIST = [
  {
    token: "WebSocketConstructor",
    kind: "identifier",
    // Emscripten SOCKFS `createPeer` constructor alias -- `require('ws')`
    // under Node, the browser `WebSocket` global otherwise
    // (emscripten src/library_sockfs.js; dist/engine/xu4.js:4250-4257).
    reason: "Emscripten SOCKFS createPeer constructor alias, dead without socket syscalls"
  },
  {
    token: "WebSocketServer",
    kind: "identifier",
    // Emscripten SOCKFS `listen()` helper (`require('ws').Server`;
    // emscripten src/library_sockfs.js; dist/engine/xu4.js:4530-4532).
    reason: "Emscripten SOCKFS listen() helper, never reached by the offline game"
  },
  {
    token: "WebSocketConstructor = WebSocket",
    kind: "statement",
    // The single browser-fallback assignment inside `createPeer`
    // (dist/engine/xu4.js:4255), matched whitespace-tolerantly. A bare
    // `new WebSocket(` anywhere -- app code or glue -- still fails.
    reason: "Emscripten SOCKFS browser fallback assignment, exact statement only"
  },
  {
    token:
      "https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing",
    kind: "url",
    // Static `file://` diagnostic text inside preamble's `err(...)` call
    // (emscripten src/preamble.js; dist/engine/xu4.js:617): displayed, never
    // fetched.
    reason: "Emscripten preamble file:// diagnostic string, never fetched"
  }
]
const ENGINE_GLUE_IDENTIFIERS = new Set(
  ENGINE_GLUE_ALLOWLIST.filter((entry) => entry.kind === "identifier").map((entry) => entry.token)
)
const ENGINE_GLUE_URLS = new Set(
  ENGINE_GLUE_ALLOWLIST.filter((entry) => entry.kind === "url").map((entry) => entry.token)
)
const ENGINE_GLUE_FALLBACK_STATEMENT = /\bWebSocketConstructor\s*=\s*WebSocket\b/g
const WEBSOCKET_IDENTIFIER = /[A-Za-z0-9_$]*WebSocket[A-Za-z0-9_$]*/g

// Splits generated-glue source into two audit views without ever treating
// string/comment text as code (a naive `//`-strip would eat `'ws://'`
// literals and the code after them on the same line):
// - `codeOnly`: comments and string literals removed (a space keeps token
//   boundaries so removal never fuses adjacent identifiers).
// - `noComments`: only comments removed (strings kept for URL analysis -- a
//   raw `https://` cannot appear in JS code outside a string/comment, since
//   the `//` would start a comment).
function splitGlueViews(content) {
  let codeOnly = ""
  let noComments = ""
  let index = 0
  while (index < content.length) {
    const char = content[index]
    const two = content.slice(index, index + 2)
    if (two === "//") {
      const end = content.indexOf("\n", index + 2)
      index = end === -1 ? content.length : end
    } else if (two === "/*") {
      const end = content.indexOf("*/", index + 2)
      index = end === -1 ? content.length : end + 2
    } else if (char === "'" || char === '"' || char === "`") {
      const end = scanStringEnd(content, index)
      noComments += content.slice(index, end)
      codeOnly += " "
      index = end
    } else {
      codeOnly += char
      noComments += char
      index += 1
    }
  }
  return { codeOnly, noComments }
}

function scanStringEnd(content, start) {
  const quote = content[start]
  let index = start + 1
  while (index < content.length) {
    const char = content[index]
    if (char === "\\") {
      index += 2
    } else if (char === quote) {
      return index + 1
    } else {
      index += 1
    }
  }
  return content.length
}

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

    if (isEngineGlueFile(distDir, filePath)) {
      auditEngineGlueEgress(filePath, content)
    } else {
      auditAppEgress(filePath, content)
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

function auditAppEgress(filePath, content) {
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
  assertAllowedUrls(filePath, content.match(ABSOLUTE_URL) ?? [])
}

function assertAllowedUrls(filePath, urls) {
  for (const url of urls) {
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
}

// Emscripten-glue reading of the egress check: POST/PUT, beacons, and event
// streams stay strictly banned, but WebSocket-family identifiers are judged
// against ENGINE_GLUE_ALLOWLIST (comments/strings excluded, so the sockfs
// spec comments and error-message literals cannot trip it), and absolute
// URLs are judged with comments excluded (spec-reference comment URLs
// cannot exfiltrate) plus the exact diagnostic-URL allowlist.
function auditEngineGlueEgress(filePath, content) {
  const { codeOnly, noComments } = splitGlueViews(content)

  const methodMatch = codeOnly.match(EGRESS_FETCH_METHOD)
  if (methodMatch !== null) {
    throw new DistAuditError(
      `dist artifact performs network egress with fetch method "${methodMatch[1].toUpperCase()}" in ${filePath}`
    )
  }
  for (const primitive of EGRESS_PRIMITIVES) {
    if (primitive.label === "WebSocket") {
      continue
    }
    if (primitive.pattern.test(codeOnly)) {
      throw new DistAuditError(
        `dist artifact contains network egress primitive "${primitive.label}" in ${filePath}`
      )
    }
  }

  const codeWithoutFallback = codeOnly.replace(ENGINE_GLUE_FALLBACK_STATEMENT, " ")
  const helpers = new Set(codeWithoutFallback.match(WEBSOCKET_IDENTIFIER) ?? [])
  for (const helper of helpers) {
    if (!ENGINE_GLUE_IDENTIFIERS.has(helper)) {
      throw new DistAuditError(
        `dist artifact contains non-allowlisted WebSocket helper "${helper}" in ${filePath} (engine glue may only use: ${[...ENGINE_GLUE_IDENTIFIERS].join(", ")})`
      )
    }
  }

  assertAllowedUrls(
    filePath,
    (noComments.match(ABSOLUTE_URL) ?? []).filter((url) => !ENGINE_GLUE_URLS.has(url))
  )
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
