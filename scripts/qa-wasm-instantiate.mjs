#!/usr/bin/env node
// Task 6 QA (happy path): instantiate the wasm module in Playwright Chromium
// WITHOUT running main, inspect exported bridge/FS symbols, write JSON evidence.
//
// Usage:
//   node scripts/qa-wasm-instantiate.mjs [--wasm-dir=<dir>] [--out=<json>] [--label=<str>]
//
// Defaults point at the good release artifact and the plan-mandated evidence path:
//   --wasm-dir=build/wasm-release
//   --out=.omo/evidence/ultima-web/task-6/wasm-instantiate.json
//
// The same script doubles as the failure-path checker: point --wasm-dir at a
// deliberately broken (no-FORCE_FILESYSTEM) artifact and it exits 1 with the
// missing symbols recorded. Exit code: 0 when all required symbols present,
// 1 otherwise.
//
// Notes:
//  - The build uses -sENVIRONMENT=web, so the glue refuses to run under Node.
//    That is why this check runs inside real Chromium via Playwright.
//  - wasm bytes are fetched and passed inline as `wasmBinary` (same pattern as
//    tests/unit/wasm-symbols.test.ts) so no .wasm path resolution is needed.
//  - main/callMain are NEVER invoked: factory is called with noInitialRun:true.
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, "..")

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const wasmDir = resolve(repoRoot, arg("wasm-dir", "build/wasm-release"))
const outPath = resolve(
  repoRoot,
  arg("out", ".omo/evidence/ultima-web/task-6/wasm-instantiate.json"),
)
const label = arg(
  "label",
  "happy path: instantiate wasm in Playwright without running main, inspect bridge/FS symbols",
)

const CHECK_KEYS = [
  "FS",
  "IDBFS",
  "callMain",
  "_u4_web_enqueue_key",
  "u4_web_enqueue_key",
  "_u4_web_submit_text",
  "u4_web_submit_text",
  "_main",
]
// A symbol counts when either its plain or underscore-prefixed spelling exists.
const REQUIRED = ["FS", "IDBFS", "callMain", "u4_web_enqueue_key", "u4_web_submit_text", "_main"]

function serve(dir) {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const path = (req.url || "/").split("?")[0]
      if (path === "/" || path === "/qa.html") {
        resp.writeHead(200, { "content-type": "text/html" })
        resp.end("<!doctype html><html><body>wasm qa</body></html>")
      } else if (path === "/xu4.mjs") {
        resp.writeHead(200, { "content-type": "text/javascript" })
        resp.end(readFileSync(join(dir, "xu4.mjs")))
      } else if (path === "/xu4.wasm") {
        resp.writeHead(200, { "content-type": "application/wasm" })
        resp.end(readFileSync(join(dir, "xu4.wasm")))
      } else {
        resp.writeHead(404)
        resp.end("not found")
      }
    })
    server.listen(0, "127.0.0.1", () => res(server))
  })
}

async function main() {
  for (const f of ["xu4.mjs", "xu4.wasm"]) {
    if (!existsSync(join(wasmDir, f))) {
      console.error(`[qa-wasm] missing artifact: ${join(wasmDir, f)}`)
      process.exit(2)
    }
  }
  const server = await serve(wasmDir)
  const port = server.address().port
  const base = `http://127.0.0.1:${port}/`
  console.log(`[qa-wasm] serving ${wasmDir} at ${base}`)

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(base)
    const observed = await page.evaluate(async (baseUrl) => {
      const keys = [
        "FS",
        "IDBFS",
        "callMain",
        "_u4_web_enqueue_key",
        "u4_web_enqueue_key",
        "_u4_web_submit_text",
        "u4_web_submit_text",
        "_main",
      ]
      const presence = {}
      const types = {}
      const errors = []
      let instantiated = false
      try {
        const ns = await import(`${baseUrl}xu4.mjs`)
        const wasmResp = await fetch(`${baseUrl}xu4.wasm`)
        if (!wasmResp.ok) throw new Error(`wasm fetch failed: HTTP ${wasmResp.status}`)
        const wasmBinary = await wasmResp.arrayBuffer()
        // noInitialRun:true -> main/callMain are never invoked here.
        const Module = await ns.default({ noInitialRun: true, wasmBinary })
        instantiated = true
        for (const k of keys) {
          presence[k] = Module[k] !== undefined
          types[k] = typeof Module[k]
        }
      } catch (e) {
        errors.push(String((e && e.stack) || e))
      }
      return { instantiated, presence, types, errors }
    }, base)

    const aliasOf = (sym) => (sym.startsWith("_") ? sym.slice(1) : `_${sym}`)
    const required = {}
    for (const sym of REQUIRED) {
      required[sym] = !!(
        observed.presence[sym] || observed.presence[aliasOf(sym)]
      )
    }
    const pass =
      observed.instantiated &&
      observed.errors.length === 0 &&
      Object.values(required).every(Boolean)

    const evidence = {
      scenario: label,
      timestamp: new Date().toISOString(),
      wasmDir,
      artifacts: {
        "xu4.mjs": statSync(join(wasmDir, "xu4.mjs")).size,
        "xu4.wasm": statSync(join(wasmDir, "xu4.wasm")).size,
      },
      startup: {
        noInitialRun: true,
        mainInvocation: "never invoked (factory called with noInitialRun:true; callMain/_main not called)",
      },
      presence: observed.presence,
      types: observed.types,
      required,
      instantiated: observed.instantiated,
      pass,
      errors: observed.errors,
    }
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n")

    for (const k of CHECK_KEYS) {
      console.log(`[qa-wasm] ${k}: ${observed.presence[k] ? `present (${observed.types[k]})` : "MISSING"}`)
    }
    if (observed.errors.length > 0) {
      console.log(`[qa-wasm] ERRORS:\n${observed.errors.join("\n")}`)
    }
    console.log(`[qa-wasm] pass=${pass} evidence=${outPath}`)
    process.exitCode = pass ? 0 : 1
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(`[qa-wasm] fatal: ${e && e.stack ? e.stack : e}`)
  process.exit(2)
})
