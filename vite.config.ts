import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { configDefaults, defineConfig } from "vitest/config"

// Serves/copies the generated (git-ignored) wasm build output --
// build/wasm-release/{xu4.mjs, xu4.wasm, modules/*} -- under a fixed
// `/engine/` URL path, both in `vite dev`/`vite preview` (a middleware)
// and in `vite build` (a copy into dist/engine/ during closeBundle).
// These are Todo 6's build:wasm artifacts, never committed and never
// part of vendor/ -- this plugin only makes them fetchable by the
// browser shell's Todo 9 startup sequence (src/engine/startup.ts).
// IMPORTANT: build/wasm-release is build-wasm.mjs's *compile staging dir*
// -- it contains a full copy of vendor/xu4's source tree (Makefile, src/,
// module/, android/, ...) alongside the actual build output. Only the
// entries below are the real engine artifacts; everything else in that
// directory must never be served or copied into dist/.
const ENGINE_ASSET_ENTRIES = ["xu4.mjs", "xu4.js", "xu4.wasm", "modules"]

function wasmEngineAssets(): Plugin {
  const sourceDir = resolve(__dirname, "build/wasm-release")
  const urlPrefix = "/engine/"

  function resolveAllowedPath(relative: string): string | null {
    const segments = relative.split("/").filter((s) => s.length > 0)
    const [first] = segments
    if (first === undefined || !ENGINE_ASSET_ENTRIES.includes(first)) {
      return null
    }
    const filePath = resolve(sourceDir, ...segments)
    if (!filePath.startsWith(resolve(sourceDir, first))) {
      return null // guards ".." traversal within an allowed top-level entry
    }
    return filePath
  }

  function copyRecursive(from: string, to: string): void {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from)) {
      const fromPath = resolve(from, entry)
      const toPath = resolve(to, entry)
      if (statSync(fromPath).isDirectory()) {
        copyRecursive(fromPath, toPath)
      } else {
        copyFileSync(fromPath, toPath)
      }
    }
  }

  return {
    name: "wasm-engine-assets",
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const relative = (req.url ?? "").replace(/^\/+/, "").split("?")[0] ?? ""
        const filePath = resolveAllowedPath(relative)
        if (filePath === null || !existsSync(filePath) || statSync(filePath).isDirectory()) {
          next()
          return
        }
        if (filePath.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm")
        else if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) res.setHeader("Content-Type", "text/javascript")
        createReadStream(filePath).pipe(res)
      })
    },
    closeBundle() {
      if (!existsSync(sourceDir)) {
        this.warn(`${sourceDir} not found -- skipping wasm engine asset copy (run "npm run build:wasm" first)`)
        return
      }
      const outDir = resolve(__dirname, "dist/engine")
      for (const entry of ENGINE_ASSET_ENTRIES) {
        const fromPath = resolve(sourceDir, entry)
        if (!existsSync(fromPath)) continue
        const toPath = resolve(outDir, entry)
        if (statSync(fromPath).isDirectory()) {
          copyRecursive(fromPath, toPath)
        } else {
          mkdirSync(outDir, { recursive: true })
          copyFileSync(fromPath, toPath)
        }
      }
    }
  }
}

export default defineConfig({
  plugins: [wasmEngineAssets()],
  test: {
    exclude: [...configDefaults.exclude],
    include: ["tests/unit/**/*.test.ts"]
  }
})
