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
  // F3 (real-browser QA; plan Must-have 2: "지원 검증은 Chromium(Chrome/Edge
  // 계열), Firefox, WebKit 계열의 현재 데스크톱 버전이다") runs the whole
  // suite on all three engines, so an engine-specific regression is visible
  // without editing per-spec skip lists.
  //
  // NOT a widening of the default gate. Every gate/verification entry point
  // names `--project=chromium` explicitly, so they still run Chromium only:
  //   - scripts/verify-integration.mjs:32  e2e step
  //   - scripts/verify-release.mjs:55      test:e2e step
  //   - docs/WEB_PORT.md:68, docs/ULTIMA_WEB_PLAN.md's per-Todo acceptance
  //     criteria (which are byte-identical to .omo/plans/ultima-web.md)
  // A bare `npm run test:e2e` (no --project) is the ONLY invocation that
  // widens, and that is intentional: it is the F3 multi-engine entry point.
  //
  // Per-project settings: browserName is the ONLY difference. testDir,
  // baseURL, outputDir, webServer and every other `use` option are inherited
  // from the top level, so all three engines exercise the identical
  // `/ultima/`-based `vite preview` artifact built from the same dist/. This
  // matches the central integration gate's proven-working Chromium settings;
  // no timeout, viewport, device-scale-factor or launch-flag override was
  // needed for Firefox/WebKit (each engine inherits Chromium's 30 s default
  // and the per-test `test.setTimeout()` budgets the specs already set).
  //
  // Deliberately NOT set per project:
  //   - `retries`: left at Playwright's default 0, same as before F3, so a
  //     flaky-on-another-engine result is reported rather than papered over.
  //   - `workers`: left unset. The gate passes `--workers=1` on the CLI, and
  //     so does the F3 run, so a failure is never masked by parallelism.
  //   - GPU flags: the repo never passes `--enable-unsafe-swiftshader`,
  //     `--use-gl=swiftshader` or `--disable-gpu` to Chromium; all three
  //     engines resolve their own software WebGL2 (measured: chromium
  //     ANGLE/SwiftShader, firefox "Generic Renderer", webkit software) so
  //     adding per-engine GPU flags would only make the three runs
  //     non-comparable.
  projects: [
    { name: "chromium" },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } }
  ],
})
