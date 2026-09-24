import { describe, expect, it, beforeAll } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const wasmDir = join(projectRoot, "build/wasm-release")
const wasmJsPath = join(wasmDir, "xu4.js")
const wasmWasmPath = join(wasmDir, "xu4.wasm")

// Required exports per plan.md Verification strategy
const REQUIRED_EXPORTS = [
  // Emscripten runtime
  "FS",
  "IDBFS",
  "callMain",
  // Bridge symbols (plan.md bridge contract)
  "u4_web_enqueue_key",
  "u4_web_submit_text",
  // Module init
  "_main",
]

describe("wasm: required exports exist in release build", () => {
  let wasmModule: any
  let wasmExports: Set<string>

  beforeAll(async () => {
    if (!existsSync(wasmJsPath)) {
      throw new Error(`WASM not built: ${wasmJsPath} missing. Run "npm run build:wasm" first.`)
    }
    if (!existsSync(wasmWasmPath)) {
      throw new Error(`WASM not built: ${wasmWasmPath} missing. Run "npm run build:wasm" first.`)
    }
    // Dynamic import of the ESM factory
    const factory = (await import(wasmJsPath.replace(".js", ".mjs"))).default
    // The build uses -sENVIRONMENT=web (per plan), so the glue fetches the
    // .wasm over HTTP. Under Node there is no HTTP server for the absolute
    // locateFile path, so feed the binary directly (standard Node approach).
    const wasmBinary = readFileSync(wasmWasmPath)
    const Module = await factory({
      noInitialRun: true,
      wasmBinary,
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith(".wasm")) return join(wasmDir, "xu4.wasm")
        return prefix + path
      },
    })
    wasmModule = Module
    wasmExports = new Set(Object.keys(Module).filter(k => typeof Module[k] === "function"))
  })

  for (const sym of REQUIRED_EXPORTS) {
    it(`exports ${sym}`, () => {
      // Emscripten exposes C exports on Module with a leading underscore
      // (e.g. _u4_web_enqueue_key); accept both spellings.
      const alias = sym.startsWith("_") ? sym.slice(1) : `_${sym}`
      expect(
        wasmExports.has(sym) || sym in wasmModule || wasmExports.has(alias) || alias in wasmModule,
      ).toBe(true)
    })
  }

  it("wasm binary exists and is valid wasm", () => {
    expect(existsSync(wasmWasmPath)).toBe(true)
    const buf = readFileSync(wasmWasmPath)
    // WASM magic: \0asm
    expect(buf[0]).toBe(0x00)
    expect(buf[1]).toBe(0x61)
    expect(buf[2]).toBe(0x73)
    expect(buf[3]).toBe(0x6d)
  })

  it("build log includes Asyncify diagnostics (no native leakage)", () => {
    const logPath = join(wasmDir, "build.log")
    if (!existsSync(logPath)) return // skip if log not present
    const log = readFileSync(logPath, "utf8")
    expect(log).toContain("Asyncify")
    // Native libraries that must NOT appear
    for (const bad of ["pthread", "libfaun", "libpulse", "GL"]) {
      expect(log).not.toContain(bad)
    }
  })
})