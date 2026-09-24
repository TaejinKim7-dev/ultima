import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173"
  },
  // Build the GitHub Pages artifact with the real project-site base and
  // serve it with `vite preview` under that same base, so e2e tests
  // actually exercise `/ultima/` asset resolution rather than root `/`.
  webServer: {
    command:
      "node scripts/build-site.mjs --base=/ultima/ && node node_modules/vite/bin/vite.js preview --base=/ultima/ --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: false,
    timeout: 60_000
  },
  // Step 7: the WebGL2 renderer test selects this project explicitly
  // (`--project=chromium`); headless Chromium renders via SwiftShader.
  projects: [{ name: "chromium" }],
})
