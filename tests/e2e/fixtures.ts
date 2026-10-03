import { test as base, expect, type Page } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

export { expect, type Page }

// Todo 28: on every failing test, record what the page actually showed --
// the dialogue panel text, which element had focus, and a screenshot --
// as test attachments (under the run's outputDir, never committed). The
// focused element is recorded because a focus left on #korean-keyword-input
// once silently diverted every later key away from the game.
export const test = base.extend<{ failureCapture: void }>({
  failureCapture: [
    async ({ page }, use, testInfo) => {
      await use()
      // Todo 38: always attach the i18n coverage snapshot (hashes and ids only,
      // never text). A page where the shell never booted has no hook.
      const coverage = await page
        .evaluate(() => window.ultimaI18nCoverage?.snapshot() ?? null)
        .catch(() => null)
      const coverageJson = JSON.stringify(coverage ?? { unavailable: true })
      await testInfo.attach("i18n-coverage.json", { body: coverageJson, contentType: "application/json" })
      // Measurement runs (I18N_COVERAGE_DIR set) also leave the snapshot in a deterministic place.
      const coverageDir = process.env["I18N_COVERAGE_DIR"]
      if (coverageDir !== undefined && coverageDir !== "") {
        const spec = testInfo.file.replace(/^.*[\\/]/, "").replace(/\.spec\.ts$/, "")
        const id = createHash("sha256").update(testInfo.titlePath.join("\u0000")).digest("hex").slice(0, 8)
        mkdirSync(coverageDir, { recursive: true })
        writeFileSync(join(coverageDir, `${spec}-${id}-r${testInfo.retry}.coverage.json`), coverageJson)
      }
      if (testInfo.status === testInfo.expectedStatus) {
        return
      }
      const panel = await page
        .locator("#dialogue-history")
        .innerText({ timeout: 2000 })
        .catch(() => "(dialogue panel unavailable)")
      const focused = await page
        .evaluate(() => {
          const el = document.activeElement
          return el === null ? "(none)" : el.id !== "" ? `#${el.id}` : el.tagName
        })
        .catch(() => "(page unavailable)")
      await testInfo.attach("failure-panel.txt", {
        body: `activeElement: ${focused}\n\n${panel}\n`,
        contentType: "text/plain"
      })
      const shot = await page.screenshot().catch(() => null)
      if (shot !== null) {
        await testInfo.attach("failure-screen.png", { body: shot, contentType: "image/png" })
      }
    },
    { auto: true }
  ]
})
