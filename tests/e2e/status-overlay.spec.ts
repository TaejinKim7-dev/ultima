import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

// Todo 12: status/menu/short in-game text as DOM overlays. Exactly like
// Todo 11's dialogue panel, the real xu4 engine emits no C++->JS bridge
// events for status/menu text today -- `screenMessage`/`StatsArea`/
// `TextView` all still draw straight into the WebGL2 raster canvas (see
// src/overlay/overlay-layout.ts's doc comment for the exact grep that
// verified this: zero EM_JS/EM_ASM/emscripten_run_script/ccall/
// ultimaBridge occurrences in vendor/xu4/src or scripts/). So this spec
// drives the overlay system through synthetic `window.ultimaBridge
// .dispatch(...)` "view" events, structurally modeled on real native call
// sites (StatsArea's HP/MP fields, Intro's Options menu items) but with
// text authored for this test, never extracted from original game data.
const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-12/", import.meta.url))

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function rectsOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function dispatch(page: Page, event: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((e) => window.ultimaBridge?.dispatch({ abiVersion: 1, ...e }) ?? false, event)
}

async function goReady(page: Page): Promise<void> {
  await page.goto("/ultima/")
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
}

const ALIGNMENT_TOLERANCE_PX = 1 // sub-pixel rounding at non-integer scale factors

// Todo 12's acceptance criteria explicitly asks for 1x/2x/DPR variants.
// "2x-scale" here means the CANVAS's own CSS display scale (independent of
// devicePixelRatio, which the second/third variants vary instead) -- a
// 960-wide viewport keeps the canvas comfortably above its 640px
// (`.viewport { min-width: 640px }`) floor.
const variants = [
  { label: "1x-dpr (desktop, deviceScaleFactor 1)", viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 },
  { label: "2x-dpr (desktop, deviceScaleFactor 2)", viewport: { width: 960, height: 640 }, deviceScaleFactor: 2 },
  {
    label: "narrower desktop window, deviceScaleFactor 1.5 (non-round canvas scale)",
    viewport: { width: 700, height: 500 },
    deviceScaleFactor: 1.5
  }
]

for (const variant of variants) {
  test.describe(`Todo 12: status/menu overlays (${variant.label})`, () => {
    test.use({ viewport: variant.viewport, deviceScaleFactor: variant.deviceScaleFactor })

    test("status and menu overlays align with the canvas, never overlap each other, and keep the avatar-aura glyph cell uncovered", async ({
      page
    }) => {
      await goReady(page)

      expect(
        await dispatch(page, {
          type: "view",
          region: "status",
          text: "",
          rows: [
            { label: "체력", value: "99/99" },
            { label: "정신력", value: "12" },
            { label: "골드", value: "200" }
          ]
        })
      ).toBe(true)
      expect(
        await dispatch(page, {
          type: "view",
          region: "menu",
          text: "",
          rows: [{ label: "돌아가기" }, { label: "여정 계속" }, { label: "새 게임" }],
          selectedIndex: 1
        })
      ).toBe(true)

      const canvasBox = (await page.locator("#game-canvas").boundingBox()) as Box
      const statusBox = (await page.locator('[data-role="status"]').boundingBox()) as Box
      const menuBox = (await page.locator('[data-role="menu"]').boundingBox()) as Box
      expect(canvasBox).not.toBeNull()
      expect(statusBox).not.toBeNull()
      expect(menuBox).not.toBeNull()

      // Both overlays stay within the canvas's own displayed box.
      for (const box of [statusBox, menuBox]) {
        expect(box.x).toBeGreaterThanOrEqual(canvasBox.x - ALIGNMENT_TOLERANCE_PX)
        expect(box.y).toBeGreaterThanOrEqual(canvasBox.y - ALIGNMENT_TOLERANCE_PX)
        expect(box.x + box.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + ALIGNMENT_TOLERANCE_PX)
        expect(box.y + box.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + ALIGNMENT_TOLERANCE_PX)
      }

      // status persists during gameplay while a menu opens over the map --
      // the one realistic concurrently-visible pair -- and they must not
      // visually overlap (tests/unit/overlay-layout.test.ts proves this in
      // logical space; this proves it in real, rendered CSS px).
      expect(rectsOverlap(statusBox, menuBox)).toBe(false)

      // The avatar-aura glyph cell (stats.cpp:198/205, logical (248,80,8,8))
      // must stay uncovered -- it is raster-drawn, not DOM overlay text.
      const scaleX = canvasBox.width / 320
      const scaleY = canvasBox.height / 200
      const glyphBox: Box = {
        x: canvasBox.x + 248 * scaleX,
        y: canvasBox.y + 80 * scaleY,
        width: 8 * scaleX,
        height: 8 * scaleY
      }
      expect(rectsOverlap(statusBox, glyphBox)).toBe(false)

      // Structured rows (Todo 12's "no fixed-space English column math"):
      // the value column's right/left edges line up across every row even
      // though "체력"/"정신력"/"골드" are different lengths in Korean.
      const valueLefts = await page
        .locator('[data-role="status"] .overlay-row-value')
        .evaluateAll((elements) => elements.map((el) => Math.round(el.getBoundingClientRect().left)))
      expect(valueLefts.length).toBe(3)
      expect(new Set(valueLefts).size).toBe(1)

      // selectedIndex highlights one menu row by item index, not a text
      // character offset (see ViewBridgeEvent's doc comment).
      const menuRowLabels = page.locator('[data-role="menu"] .overlay-row-label')
      await expect(menuRowLabels.nth(1)).toHaveClass(/selected/)
      await expect(menuRowLabels.nth(0)).not.toHaveClass(/selected/)

      mkdirSync(evidenceDir, { recursive: true })
      await page.screenshot({ path: `${evidenceDir}status-overlay.png` })
    })
  })
}

test.describe("Todo 12: overlay lifecycle", () => {
  test("an empty-text/no-rows view event removes that role's overlay element; a bridge 'clear' event removes every role at once", async ({
    page
  }) => {
    await goReady(page)

    expect(await dispatch(page, { type: "view", region: "status", text: "", rows: [{ label: "체력", value: "1" }] })).toBe(
      true
    )
    expect(await dispatch(page, { type: "view", region: "menu", text: "", rows: [{ label: "돌아가기" }] })).toBe(true)
    await expect(page.locator('[data-role="status"]')).toHaveCount(1)
    await expect(page.locator('[data-role="menu"]')).toHaveCount(1)

    // Empty content hides just the "status" role -- "menu" stays.
    expect(await dispatch(page, { type: "view", region: "status", text: "" })).toBe(true)
    await expect(page.locator('[data-role="status"]')).toHaveCount(0)
    await expect(page.locator('[data-role="menu"]')).toHaveCount(1)

    // A full stage transition ('clear') removes every remaining role.
    expect(await dispatch(page, { type: "clear" })).toBe(true)
    await expect(page.locator('[data-role="menu"]')).toHaveCount(0)
  })
})

test.describe("Todo 12: narrow viewport", () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test("failure path: a very narrow window scrolls the page instead of clipping overlay/dialogue text", async ({
    page
  }) => {
    await goReady(page)

    expect(
      await dispatch(page, {
        type: "view",
        region: "status",
        text: "",
        rows: [
          { label: "체력", value: "99/99" },
          { label: "정신력", value: "12" }
        ]
      })
    ).toBe(true)
    expect(
      await dispatch(page, {
        type: "message",
        text: "이 문장은 아주 좁은 화면에서도 읽을 수 있어야 하는 한국어 대화 예시 문장입니다.\n"
      })
    ).toBe(true)

    // The game area holds its >=2x floor (plan.md line 119: "desktop 기본
    // 최소 2× 표시") instead of shrinking below readability, so the PAGE
    // scrolls horizontally rather than the canvas/overlays clipping.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }))
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.innerWidth)

    // The status overlay itself never internally clips its own text --
    // `overflow: hidden` would silently cut off a Korean value string that
    // doesn't fit the box, which fixed-space column math might otherwise
    // hide as a "successful" layout.
    const statusOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-role="status"]')
      if (el === null) return null
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    })
    expect(statusOverflow).not.toBeNull()
    expect(statusOverflow!.scrollWidth).toBeLessThanOrEqual(statusOverflow!.clientWidth + 1)
    expect(statusOverflow!.scrollHeight).toBeLessThanOrEqual(statusOverflow!.clientHeight + 1)

    // The overlay's font stays at/above the readable floor
    // (OVERLAY_MIN_FONT_PX in src/overlay/overlay-layout.ts) instead of
    // shrinking to illegibility.
    const fontSizePx = await page.evaluate(() => {
      const el = document.querySelector('[data-role="status"]')
      return el === null ? null : parseFloat(getComputedStyle(el).fontSize)
    })
    expect(fontSizePx).not.toBeNull()
    expect(fontSizePx!).toBeGreaterThanOrEqual(10)

    // The dialogue panel below the canvas keeps wrapping Korean text
    // instead of overflowing it (Todo 11's own CJK-wrap guarantee, still
    // holding at this narrower width).
    const dialogueOverflow = await page.evaluate(() => {
      const line = document.querySelector("#dialogue-history > .dialogue-line:last-child")
      if (line === null) return null
      return { scrollWidth: line.scrollWidth, clientWidth: line.parentElement?.clientWidth ?? 0 }
    })
    expect(dialogueOverflow).not.toBeNull()
    expect(dialogueOverflow!.scrollWidth).toBeLessThanOrEqual(dialogueOverflow!.clientWidth + 1)

    mkdirSync(evidenceDir, { recursive: true })
    await page.screenshot({ path: `${evidenceDir}narrow-viewport.png`, fullPage: true })
  })
})
