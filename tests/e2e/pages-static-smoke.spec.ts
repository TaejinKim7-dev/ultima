import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 19: smoke the Pages artifact the way GitHub Pages serves it -- a
// plain static file server with the artifact mounted at the project-site
// prefix `/ultima/`, no SPA fallback, nothing served at `/`. This
// deliberately does NOT use `vite preview` (playwright.config.ts's
// webServer): vite.config.ts's wasmEngineAssets() middleware answers
// `/engine/*` straight from build/wasm-release in preview, so a Pages
// artifact missing dist/engine/ would still boot there. Here every engine
// file has to come out of the artifact directory itself.
//
// PAGES_DIST points at the artifact to smoke (default: the local dist/,
// which the webServer's `build-site --base=/ultima/` just rebuilt); CI's
// downloaded Pages artifact can be smoked the same way. PAGES_PREFIX
// (default "/ultima/") mounts it elsewhere -- e.g. "/" for a base-"/"
// `npm run build` output, the plan's "serve at `/`" half of Todo 19's QA.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-19")
const artifactDir = resolve(process.env["PAGES_DIST"] ?? join(repoRoot, "dist"))
const PREFIX = process.env["PAGES_PREFIX"] ?? "/ultima/"

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png"
}

function startStaticPagesServer(): Promise<Server> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname)
    if (!path.startsWith(PREFIX)) {
      response.writeHead(404).end("not found")
      return
    }
    let file = normalize(join(artifactDir, path.slice(PREFIX.length)))
    if (file !== artifactDir && !file.startsWith(artifactDir + sep)) {
      response.writeHead(404).end("not found")
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = join(file, "index.html")
    }
    if (!existsSync(file)) {
      response.writeHead(404).end("not found")
      return
    }
    response.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" })
    response.end(readFileSync(file))
  })
  return new Promise((resolveServer) => server.listen(0, "127.0.0.1", () => resolveServer(server)))
}

test.describe(`Todo 19: Pages artifact static smoke (plain static server at ${PREFIX})`, () => {
  let server: Server
  let origin: string

  test.beforeAll(async () => {
    mkdirSync(evidenceDir, { recursive: true })
    server = await startStaticPagesServer()
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  test.afterAll(async () => {
    await new Promise((resolveClose) => server.close(resolveClose))
  })

  test("happy path: the real engine boots from the artifact under its prefix, and nothing is requested outside it", async ({
    page,
    browser
  }) => {
    test.setTimeout(90_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")

    const requests: { path: string; status: number }[] = []
    page.on("response", (response) => {
      const url = new URL(response.url())
      if (url.origin === origin) {
        requests.push({ path: url.pathname, status: response.status() })
      }
    })

    // Given: the artifact served only under /ultima/, like GitHub Pages.
    const rootResponse = await page.request.get(`${origin}/`)
    await page.goto(`${origin}${PREFIX}`)
    await page.waitForFunction(() => document.body.dataset["bridgeReady"] === "true")

    // When: the user selects their own original data.
    await page.locator("#rom-picker").setInputFiles({
      name: "ultima4.zip",
      mimeType: "application/zip",
      buffer: readFileSync(zipPath!)
    })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 30_000 })
    const engineStarted = await page.evaluate(() => document.body.dataset["engineStarted"])
    const startReason = await page.evaluate(() => document.body.dataset["engineStartReason"] ?? null)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: join(evidenceDir, "pages-static-smoke.png") })

    const outsidePrefix = requests.filter((entry) => !entry.path.startsWith(PREFIX))
    const failed = requests.filter((entry) => entry.status >= 400)
    const engineRequests = requests.filter((entry) => entry.path.startsWith(`${PREFIX}engine/`))
    // Evidence records paths/statuses only -- never the user's data.
    writeFileSync(
      join(evidenceDir, "pages-static-smoke.json"),
      `${JSON.stringify(
        {
          artifactDir: process.env["PAGES_DIST"] ? "PAGES_DIST" : "dist",
          browser: `${browser.browserType().name()} ${browser.version()}`,
          prefix: PREFIX,
          rootStatus: rootResponse.status(),
          engineStarted,
          startReason,
          engineRequests,
          outsidePrefix,
          failed
        },
        null,
        2
      )}\n`
    )

    // Then: `/` is not ours when mounted under a project-site prefix,
    // every request stayed under the prefix and succeeded, and the real engine loaded from the
    // artifact's own engine/ directory and started.
    if (PREFIX !== "/") {
      expect(rootResponse.status()).toBe(404)
    }
    expect(outsidePrefix).toEqual([])
    expect(failed).toEqual([])
    for (const file of ["xu4.mjs", "xu4.wasm", "modules/render.pak", "modules/Ultima-IV.mod"]) {
      expect(engineRequests.map((entry) => entry.path)).toContain(`${PREFIX}engine/${file}`)
    }
    expect(startReason).toBeNull()
    expect(engineStarted).toBe("true")
  })
})
