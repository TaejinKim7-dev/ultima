import { defineConfig } from "@playwright/test"

// Todo 18: PLAYWRIGHT_PORT lets multiple e2e spec files run as SEPARATE
// `npx playwright test` invocations (separate background processes) at
// the same time, each with its own webServer instead of colliding on one
// fixed port -- confirmed empirically that two invocations sharing the
// same hardcoded port fail immediately ("port 4173 already used") since
// `reuseExistingServer: false` always tries to start a fresh server.
// Real-time-sensitive specs (any RNG-sweep approach that depends on
// wall-clock delays -- see e.g. tests/e2e/korean-npc-alias.spec.ts's
// approachNpc()) can still contend for CPU if run truly concurrently on
// a loaded machine; this only removes the PORT collision, not CPU
// contention, so still prefer running those specific specs one at a time
// even when using distinct ports.
const port = Number(process.env["PLAYWRIGHT_PORT"] ?? 4173)

export default defineConfig({
  testDir: "./tests/e2e",
  // Every invocation wipes its outputDir at startup, so concurrent runs
  // sharing the default `test-results/` delete each other's in-flight
  // trace artifacts (observed: `tracing.stop: ENOENT` in one run right
  // after another started). Separate it per port when running in parallel.
  outputDir: process.env["PLAYWRIGHT_PORT"] ? `test-results/port-${port}` : "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`
  },
  // Build the GitHub Pages artifact with the real project-site base and
  // serve it with `vite preview` under that same base, so e2e tests
  // actually exercise `/ultima/` asset resolution rather than root `/`.
  webServer: {
    command: `node scripts/build-site.mjs --base=/ultima/ && node node_modules/vite/bin/vite.js preview --base=/ultima/ --port ${port} --strictPort`,
    port,
    reuseExistingServer: false,
    timeout: 60_000
  },
  // Step 7: the WebGL2 renderer test selects this project explicitly
  // (`--project=chromium`); headless Chromium renders via SwiftShader.
  projects: [{ name: "chromium" }],
})
