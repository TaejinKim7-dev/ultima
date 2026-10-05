import { appendFileSync, copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { configDefaults, defineConfig } from "vitest/config"
// @ts-expect-error -- plain .mjs build helper, no type declarations
import { assertFresh } from "./scripts/lib/build-stamp.mjs"

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
      // Todo 28: `vite dev` serves build/ directly, so enforce freshness here
      // too (build:site enforces it for `vite build`/preview/e2e).
      if (process.env["VITEST"] === undefined) assertFresh(__dirname)
      const serveEngineAsset = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, next: () => void) => {
        const relative = (req.url ?? "").replace(/^\/+/, "").split("?")[0] ?? ""
        const filePath = resolveAllowedPath(relative)
        if (filePath === null || !existsSync(filePath) || statSync(filePath).isDirectory()) {
          next()
          return
        }
        if (filePath.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm")
        else if (filePath.endsWith(".mjs") || filePath.endsWith(".js")) res.setHeader("Content-Type", "text/javascript")
        createReadStream(filePath).pipe(res)
      }
      server.middlewares.use(urlPrefix, serveEngineAsset)
      // With `--base=/ultima/` the app requests `/ultima/engine/...`; without
      // this mount the SPA fallback answered with index.html (2026-10-05).
      const base = server.config.base ?? "/"
      if (base !== "/") server.middlewares.use(`${base.replace(/\/$/, "")}${urlPrefix}`, serveEngineAsset)
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

// Local dev/preview-only convenience: auto-selects the user's original
// ultima4.zip (path from the ULTIMA4_DATA env var -- the same convention
// every e2e spec already uses) so a developer replaying this project
// locally doesn't have to click the file picker on every reload. This
// must NEVER reach the production bundle or the GitHub Pages artifact --
// guaranteed structurally, not just by convention:
//   - `apply: "serve"` means Vite skips every hook of this plugin entirely
//     during `vite build` (the command that produces dist/); there is no
//     closeBundle/generateBundle hook here at all, unlike
//     wasmEngineAssets() above, which needs one to copy real engine
//     assets into dist/.
//   - The injected script only ever fetches a fixed, non-secret URL
//     (`/__dev-original-data__.zip`) that this plugin's own middleware
//     serves; on GitHub Pages (static hosting, no middleware at all) that
//     path simply 404s, so real end users see no different behavior and
//     no path/filename is exposed that isn't already public in this
//     repo's own e2e spec source.
//   - The middleware itself only serves a file when ULTIMA4_DATA is set
//     to an existing path in the developer's own environment -- it never
//     reads or serves anything from inside the repo.
//   - It reuses the exact real `#rom-picker` <input type=file> + its real
//     `change` listener (src/shell.ts, src/main.ts) via a synthesized
//     DataTransfer + a real `change` Event, never a separate/shortcut
//     code path into the engine.
function devAutoLoadOriginalData(): Plugin {
  const devDataUrl = "/__dev-original-data__.zip"

  return {
    name: "dev-auto-load-original-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(devDataUrl, (_req, res) => {
        const zipPath = process.env["ULTIMA4_DATA"]
        if (!zipPath || !existsSync(zipPath) || statSync(zipPath).isDirectory()) {
          res.statusCode = 404
          res.end()
          return
        }
        res.setHeader("Content-Type", "application/zip")
        createReadStream(zipPath).pipe(res)
      })
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module" },
          // Must run AFTER the real app entry module script (which attaches
          // #rom-picker's real `change` listener) -- module scripts execute
          // in document order after parsing, and `injectTo: "body"` appends
          // this tag at the end of <body>, after that entry script tag.
          // Confirmed empirically: without `type: "module"` here, this
          // plain/synchronous script ran BEFORE the deferred module entry
          // script attached its listener, so the synthesized `change`
          // event fired into an empty void and the engine never started.
          injectTo: "body",
          children: `
            (async () => {
              try {
                const res = await fetch(${JSON.stringify(devDataUrl)})
                if (!res.ok) return
                const buf = await res.arrayBuffer()
                const picker = document.querySelector("#rom-picker")
                if (!picker) return
                const file = new File([buf], "ultima4.zip", { type: "application/zip" })
                const transfer = new DataTransfer()
                transfer.items.add(file)
                picker.files = transfer.files
                picker.dispatchEvent(new Event("change", { bubbles: true }))
              } catch {
                // No ULTIMA4_DATA configured, or not running under this
                // dev server at all -- fall back to the real manual
                // file-picker UI, silently.
              }
            })()
          `
        }
      ]
    }
  }
}

// Local dev only (`apply: "serve"`, never part of `vite build`): the page
// POSTs its key-point debug log (src/debug-log.ts) here and the lines are
// appended to U4_DEBUG_LOG (default /tmp/u4-debug.log), so a developer
// watching a play session can read what happened. Truncated at server start.
function devDebugLogSink(): Plugin {
  return {
    name: "dev-debug-log-sink",
    apply: "serve",
    configureServer(server) {
      const file = process.env["U4_DEBUG_LOG"] ?? "/tmp/u4-debug.log"
      writeFileSync(file, "")
      const handler = (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on("data", (chunk: Buffer) => chunks.push(chunk))
        req.on("end", () => {
          try {
            const lines = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown[]
            appendFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n")
            res.statusCode = 204
          } catch {
            res.statusCode = 400
          }
          res.end()
        })
      }
      server.middlewares.use("/__dev-log", handler)
      const base = server.config.base ?? "/"
      if (base !== "/") server.middlewares.use(`${base.replace(/\/$/, "")}/__dev-log`, handler)
    }
  }
}

export default defineConfig({
  plugins: [wasmEngineAssets(), devAutoLoadOriginalData(), devDebugLogSink()],
  test: {
    exclude: [...configDefaults.exclude],
    include: ["tests/unit/**/*.test.ts"]
  }
})
