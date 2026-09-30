import { test as base, expect, type Page } from "@playwright/test"

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
