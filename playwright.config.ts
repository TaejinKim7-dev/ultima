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
  //
  // F3 (real browser QA, plan requirement "Chromium/Firefox/WebKit 계열의
  // 현재 데스크톱 버전") also runs the suite on Firefox and WebKit, so a
  // single-engine regression on any of the three is visible without
  // editing per-spec skip lists. These are extra projects, NOT a widening
  // of the default gate: every existing gate/verification command names
  // `--project=chromium` explicitly (docs/WEB_PORT.md, scripts/
  // verify-integration.mjs, and each Todo's acceptance criteria in
  // .omo/plans/ultima-web.md), so `npm run verify:integration` still runs
  // Chromium only.
  //
  // The projects deliberately differ ONLY in browserName. testDir, baseURL,
  // outputDir, webServer and every `use` option are inherited from the
  // top level, so each engine exercises the identical `/ultima/`-based
  // `vite preview` artifact; retries and workers stay unset (Playwright
  // defaults: 0 retries, host-core-count workers), which is the same policy
  // the Chromium-only config had -- the multi-engine runs pass
  // `--workers=1` on the CLI so a failure is never masked by parallelism.
  projects: [
    { name: "chromium" },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ],
})
