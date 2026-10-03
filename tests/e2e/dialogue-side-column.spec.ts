import { expect, test, type Page } from "./fixtures.ts"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

// Todo 47 (user request 2026-10-03): the Korean dialogue panel and the
// Korean keyword input move from below the game screen into a right-hand
// column on wide windows, and arrow keys stop scrolling the page or the
// panel. Emscripten's GLFW port only prevents the default action of
// Backspace/Tab, so before this change every arrow press while walking also
// scrolled the page, and the Korean text below the canvas slid in and out of
// view. No engine is needed here: the scrolling is the browser's default
// action for the key, which happens with or without the game running.

const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-47/", import.meta.url))

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function ready(page: Page): Promise<void> {
  await page.goto("/ultima/")
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
}

async function dispatch(page: Page, event: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((e) => window.ultimaBridge?.dispatch({ abiVersion: 1, ...e }) ?? false, event)
}

async function box(page: Page, selector: string): Promise<Box> {
  const found = await page.locator(selector).boundingBox()
  expect(found, `${selector} has no layout box`).not.toBeNull()
  return found as Box
}

async function fillPanel(page: Page, lines: number): Promise<void> {
  for (let i = 0; i < lines; i++) {
    await dispatch(page, { type: "message", text: `${i + 1}번째 한국어 대화 줄입니다.\n` })
  }
}

test.describe("Todo 47: Korean dialogue in a right-hand column", () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test("wide window: the dialogue panel and Korean input sit to the right of the game, top-aligned, no taller than it", async ({
    page
  }) => {
    await ready(page)
    await fillPanel(page, 5)

    const game = await box(page, "#game-viewport")
    const panel = await box(page, "#dialogue-panel")
    const input = await box(page, "#korean-keyword-input")
    const side = await box(page, "#side-column")

    expect(panel.x, "dialogue panel is not to the right of the game").toBeGreaterThanOrEqual(game.x + game.width - 1)
    expect(input.x, "Korean input is not to the right of the game").toBeGreaterThanOrEqual(game.x + game.width - 1)
    expect(Math.abs(panel.y - game.y), "dialogue panel top is not aligned with the game top").toBeLessThanOrEqual(2)
    expect(Math.abs(side.y + side.height - (game.y + game.height)), "right column bottom does not match the game bottom").toBeLessThanOrEqual(2)
    expect(input.y + input.height).toBeLessThanOrEqual(game.y + game.height + 2)
    expect(panel.height, "dialogue panel collapsed").toBeGreaterThan(150)

    // Both the game and the Korean text are on screen at once in a 720px-tall window.
    expect(game.y + game.height).toBeLessThanOrEqual(720)

    mkdirSync(evidenceDir, { recursive: true })
    await page.screenshot({ path: `${evidenceDir}side-column-1280x720.png` })
  })

  test("a long history scrolls inside the panel, not the page, and the newest line stays in view", async ({ page }) => {
    await ready(page)
    await fillPanel(page, 60)

    const game = await box(page, "#game-viewport")
    const side = await box(page, "#side-column")
    expect(Math.abs(side.y + side.height - (game.y + game.height)), "60 lines stretched the column past the game").toBeLessThanOrEqual(2)

    const last = await box(page, "#dialogue-history > .dialogue-line:last-child")
    const panel = await box(page, "#dialogue-panel")
    expect(last.y + last.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
  })
})

test.describe("Todo 47: arrow keys never scroll the page or the panel", () => {
  // Short enough that the page itself is taller than the window.
  test.use({ viewport: { width: 1280, height: 480 } })

  test("arrow keys on the page leave window.scrollY alone and still reach window keydown listeners", async ({ page }) => {
    await ready(page)
    const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
    expect(scrollable, "test precondition: the page must be scrollable at this window size").toBe(true)

    await page.evaluate(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      window.scrollTo(0, 0)
      const w = window as unknown as { __arrowKeydowns: number }
      w.__arrowKeydowns = 0
      window.addEventListener("keydown", (e) => {
        if (e.key.startsWith("Arrow")) w.__arrowKeydowns += 1
      })
    })

    for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]) {
      await page.keyboard.press(key)
    }
    await page.waitForTimeout(300)

    expect(await page.evaluate(() => window.scrollY), "an arrow key scrolled the page").toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __arrowKeydowns: number }).__arrowKeydowns)).toBe(4)
  })

  test("arrow keys with focus in the dialogue panel do not scroll the panel", async ({ page }) => {
    await ready(page)
    await fillPanel(page, 60)
    expect(await dispatch(page, { type: "prompt", promptId: "req-47", kind: "text" })).toBe(true)
    await expect(page.locator("#dialogue-prompt-marker")).toBeFocused()

    const before = await page.evaluate(() => document.querySelector("#dialogue-panel")!.scrollTop)
    expect(before, "test precondition: the panel must have scrolled history").toBeGreaterThan(0)
    for (const key of ["ArrowUp", "ArrowUp", "ArrowUp"]) {
      await page.keyboard.press(key)
    }
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.querySelector("#dialogue-panel")!.scrollTop), "an arrow key scrolled the panel").toBe(before)
  })

  test("inside the Korean keyword input, arrow keys still move the text caret", async ({ page }) => {
    await ready(page)
    const input = page.locator("#korean-keyword-input")
    await input.click()
    await input.fill("가나다")
    await input.press("End")
    await input.press("ArrowLeft")
    await input.press("ArrowLeft")
    expect(await input.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(1)
  })
})

test.describe("Todo 47: narrow windows keep the stacked layout", () => {
  test.use({ viewport: { width: 960, height: 640 } })

  test("below the two-column width the dialogue panel stays under the game", async ({ page }) => {
    await ready(page)
    const game = await box(page, "#game-viewport")
    const panel = await box(page, "#dialogue-panel")
    expect(panel.y).toBeGreaterThanOrEqual(game.y + game.height - 1)
  })
})
