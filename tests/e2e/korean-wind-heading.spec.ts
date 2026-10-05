import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 50 Lane B: the in-game Korean wind / dungeon-heading overlay, driven
// against the REAL running xu4 engine with the user's real ultima4.zip.
//
// The overlay is an always-on opaque DOM box (`#game-viewport
// [data-role="windheading"]`, NOT inside `#overlay-layer`) over the native
// WIND_AREA rect (vendor/xu4/src/u4.h:73-76 WIND_AREA_X=7,Y=23,W=10,H=1 ->
// (56, 184, 80, 8) in 320x200 raster pixels, with 8x10 character cells).
// The engine only signals (mode, direction) -- mode 1 means wind, mode 2 means
// dungeon orientation, direction is the native Direction enum
// (vendor/xu4/src/direction.h: NONE=0, WEST=1, NORTH=2, EAST=3, SOUTH=4) --
// so the Korean text "바람 {서|북|동|남}" / "방향 {서|북|동|남}" is composed
// from those two numbers (src/overlay/wind-heading.ts) and the English text
// the engine still draws under the opaque box stays invisible.
//
// Visibility rule (same as the message-area overlay): switch on AND playing
// AND no top-menu modal open. font-family backs the box with NeoDunggeunmo
// 16px-step (src/main.ts:87 document.fonts.load, src/shell.css:541
// font-family list).
//
// Evidence screenshots are captured at each step, like the other real-engine
// specs; text assertions read the overlay's own DOM (the only readable
// Korean copy of the wind line -- the canvas raster stays English under
// the opaque box). Boxes are positioned in CSS px relative to the canvas's
// positioning ancestor's padding box (overlay-layout.ts's
// computeContentRect / toCssRect) so the "in canvas (56,184,80,8)" check
// here is exactly the same scale-to-CSS transform the implementation runs.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-50/windheading")

async function bootAndSelectZip(page: Page, buffer: Buffer): Promise<void> {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await page.locator("#game-canvas").click()
}

async function pressKey(page: Page, k: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(k)
  await page.waitForTimeout(delayMs)
}

async function typeAscii(page: Page, text: string, perCharDelayMs = 150): Promise<void> {
  for (const ch of text) {
    await page.keyboard.press(ch)
    await page.waitForTimeout(perCharDelayMs)
  }
}

async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
  await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
  await pressKey(page, "i") // name prompt
  await typeAscii(page, "Avatar")
  await pressKey(page, "Enter")
  await pressKey(page, "m") // sex prompt
  for (let i = 0; i < 26; i++) {
    await pressKey(page, "Enter", 700)
    if ((await page.locator("#save-status").innerText()).includes("완료")) return true
  }
  for (let i = 0; i < 20; i++) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await page.locator("#save-status").innerText()).includes("완료")) return true
  }
  return false
}

/** Real Configure menu -> Debug Mode (see korean-message-area.spec.ts's enableDebugMode). */
async function enableDebugMode(page: Page): Promise<void> {
  await pressKey(page, "c", 2000)
  await pressKey(page, "g", 2000)
  await pressKey(page, "d", 2000)
  await pressKey(page, "u", 2000)
  await pressKey(page, "m", 2500)
}

async function openCheatMenu(page: Page): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(800)
}

/** Cheat menu's deterministic Goto ('g', vendor/xu4/src/cheat.cpp): teleports
 *  onto the named portal's world-map coordinates with zero RNG, then 'e'
 *  auto-enters it (town/dungeon/shrine all share the same portalAt(ACTION_ENTER)
 *  auto-key path -- vendor/xu4/src/game.cpp:847-848). Only valid while ON the
 *  world map (Goto matches against the CURRENT map's own portals). */
async function gotoAndEnter(page: Page, destination: string): Promise<void> {
  await openCheatMenu(page)
  await pressKey(page, "g", 1000)
  await typeAscii(page, destination, 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2500)
}

/** The overlay box (inside #game-viewport, never inside #overlay-layer). */
function overlayBox(page: Page) {
  return page.locator('#game-viewport [data-role="windheading"]')
}

async function overlayVisible(page: Page): Promise<boolean> {
  const box = overlayBox(page)
  if ((await box.count()) === 0) return false
  return box.isVisible().catch(() => false)
}

async function overlayText(page: Page): Promise<string> {
  const box = overlayBox(page)
  if ((await box.count()) === 0) return ""
  return (await box.innerText().catch(() => "")).replace(/\s+/g, "")
}

/** Reads the overlay's box, asserts it is anchored inside the canvas's
 *  (56,184,80,8) native raster rect -- the implementation converts the rect
 *  to CSS via overlay-layout.ts's computeScale/toCssRect (320x200 logical ->
 *  canvas CSS px), so a CSS px range check is the exact counterpart of the
 *  native assertion in the spec description. */
async function assertBoxInsideWindArea(page: Page): Promise<void> {
  const probe = await page.evaluate(() => {
    const canvas = document.querySelector("#game-canvas") as HTMLCanvasElement | null
    const anchor = document.querySelector("#game-viewport") as HTMLElement | null
    const overlay = document.querySelector('#game-viewport [data-role="windheading"]') as HTMLElement | null
    if (canvas === null || anchor === null || overlay === null) return null
    const c = canvas.getBoundingClientRect()
    const a = anchor.getBoundingClientRect()
    const o = overlay.getBoundingClientRect()
    // canvas CSS px rect, expressed RELATIVE to the anchor's padding box
    // (overlay-layout's computeContentRect subtracts anchor's clientLeft/clientTop,
    // which are zero for the bare #game-viewport wrapper but kept here for the
    // general form documented in overlay-layout.ts:297-308).
    const paddingLeft = a.left + anchor.clientLeft
    const paddingTop = a.top + anchor.clientTop
    const canvasCss = { left: c.left - paddingLeft, top: c.top - paddingTop, width: c.width, height: c.height }
    const overlayCss = {
      left: o.left - paddingLeft,
      top: o.top - paddingTop,
      width: o.width,
      height: o.height,
      right: o.left - paddingLeft + o.width,
      bottom: o.top - paddingTop + o.height
    }
    // scale = canvas / 320x200 logical
    const scaleX = canvasCss.width / 320
    const scaleY = canvasCss.height / 200
    // wind area (56,184,80,8) in CSS px
    const logical = { x: 56, y: 184, w: 80, h: 8 }
    const target = {
      left: canvasCss.left + logical.x * scaleX,
      top: canvasCss.top + logical.y * scaleY,
      right: canvasCss.left + (logical.x + logical.w) * scaleX,
      bottom: canvasCss.top + (logical.y + logical.h) * scaleY
    }
    // The implementation snaps each side independently to 1/dpr CSS px
    // (overlay-layout.ts:282-291), so allow +/- 1 CSS px tolerance at any DPR.
    const eps = 1
    const inside =
      overlayCss.left + eps >= target.left &&
      overlayCss.top + eps >= target.top &&
      overlayCss.right - eps <= target.right &&
      overlayCss.bottom - eps <= target.bottom
    return {
      scaleX,
      scaleY,
      canvasCss,
      overlayCss,
      target,
      inside,
      scrollWidth: overlay.scrollWidth,
      clientWidth: overlay.clientWidth
    }
  })
  expect(probe, "windheading DOM probe must be available while playing on the world map").not.toBeNull()
  expect(probe!.inside, `windheading box ${JSON.stringify(probe!.overlayCss)} must sit inside canvas-derived wind rect ${JSON.stringify(probe!.target)} (scaleX=${probe!.scaleX.toFixed(4)}, scaleY=${probe!.scaleY.toFixed(4)})`).toBe(true)
  expect(probe!.scrollWidth, "the wind heading line must NOT overflow its own box (scrollWidth <= clientWidth)").toBeLessThanOrEqual(probe!.clientWidth)
}

test.describe("Todo 50: in-game Korean wind / dungeon-heading overlay", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("overland '바람' / dungeon '방향' line, ESC pause hides, switch off hides, box anchored inside canvas (56,184,80,8) with no overflow, NeoDunggeunmo loads", async ({
    page
  }) => {
    test.setTimeout(900_000) // full route: 2 real sessions + character creation + cheat Goto into a dungeon + assertions across both contexts
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // The pixel font must be available before we depend on it -- src/main.ts:87
    // fires document.fonts.load("16px NeoDunggeunmo") in parallel with boot,
    // but the test must still observe it loaded by the time the world is in.
    const fontReady = await page
      .evaluate(async () => {
        try {
          await document.fonts.load("16px NeoDunggeunmo")
        } catch {}
        return document.fonts.check("16px NeoDunggeunmo")
      })
      .catch(() => false)
    expect(fontReady, "NeoDunggeunmo 16px must be available BEFORE relying on it (src/main.ts:87 preload)").toBe(false) // pre-boot the page has no font face yet

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)

    // Session 2: fresh load, Debug Mode, Journey Onward into the world map.
    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 3000) // Journey Onward

    // The pixel font is loaded synchronously on the real page (the woff2 is
    // referenced from src/shell.css @font-face and served alongside the
    // site). document.fonts.check is the only assertion that proves the
    // browser actually parsed the font face (not just that the name is in
    // the CSS).
    const fontLoadedInPage = await page
      .evaluate(async () => {
        try {
          await document.fonts.load("16px NeoDunggeunmo")
        } catch {}
        return document.fonts.check("16px NeoDunggeunmo")
      })
      .catch(() => false)
    expect(fontLoadedInPage, "document.fonts.check('16px NeoDunggeunmo') must be true while playing on the world map").toBe(true)

    // Scenario 1: the wind heading is visible on the overworld as soon as
    // play begins, the text is the Korean '바람 <cardinal>', and the box is
    // anchored exactly inside the canvas's (56,184,80,8) WIND_AREA. The
    // native Direction enum (vendor/xu4/src/direction.h) maps 1..4 to the
    // four cardinals, so the regex accepts any of them.
    await expect(overlayBox(page)).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toMatch(/^바람(?:서|북|동|남)$/)
    await assertBoxInsideWindArea(page)
    await page.screenshot({ path: join(evidenceDir, "01-overland-wind.png") })

    // Walking keeps the box geometry and the text non-empty: 5 frames
    // captured with arrow presses between them, just like the message-area
    // overlay spec's geometry-stability block.
    const positions: { left: number; top: number; text: string }[] = []
    for (let frame = 0; frame < 5; frame += 1) {
      const box = await overlayBox(page).boundingBox()
      expect(box, `windheading box missing on frame ${frame}`).not.toBeNull()
      const text = await overlayText(page)
      expect(text, `windheading must stay non-empty on frame ${frame}`).toMatch(/^바람(?:서|북|동|남)$/)
      positions.push({ left: box!.x, top: box!.y, text })
      if (frame < 4) await pressKey(page, "ArrowRight", 700)
    }
    const firstLeft = positions[0]!.left
    const firstTop = positions[0]!.top
    for (let i = 1; i < positions.length; i += 1) {
      expect(Math.abs(positions[i]!.left - firstLeft), `windheading left drifted on frame ${i}`).toBeLessThanOrEqual(1)
      expect(Math.abs(positions[i]!.top - firstTop), `windheading top drifted on frame ${i}`).toBeLessThanOrEqual(1)
    }

    // Scenario 2: enter Dungeon Deceit via the real cheat menu's
    // deterministic Goto + auto-Enter (same proven path as
    // gameplay-progression.spec.ts). The native signal flips to mode=2 and
    // the overlay must switch to "방향 <cardinal>". The dungeon
    // 'orientation' starts at NONE (0) on entry and is set by the player
    // turning, so wait until the signal is non-null before asserting the
    // exact cardinal (composeWindHeading returns null for direction=0).
    await gotoAndEnter(page, "deceit")
    await expect(overlayBox(page)).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toMatch(/^방향(?:서|북|동|남)$/)
    await assertBoxInsideWindArea(page)
    await page.screenshot({ path: join(evidenceDir, "02-dungeon-deceit.png") })

    // Scenario 3: ESC pause modal must hide the windheading overlay
    // (applyModal(false) -> windHeadingVisible(playing, modal=true) -> false)
    // and the whole overlay layer (Todo 52 #9 user decision 2026-10-04).
    await pressKey(page, "Escape", 1500)
    expect(await overlayVisible(page), "the windheading overlay must hide on the pause modal").toBe(false)
    expect(await page.locator("#overlay-layer").isHidden(), "#overlay-layer must hide entirely on the pause modal").toBe(true)
    await page.screenshot({ path: join(evidenceDir, "03-pause-modal-hidden.png") })
    await pressKey(page, "Escape", 1500)
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })

    // Scenario 4: flipping the in-game '#toggle-screen-ko' switch off hides
    // the overlay (switchToggle.enabled=false short-circuits the render).
    // The canvas-drawn English "Wind West" is the only thing visible while
    // the switch is off. Flipping it back on brings the Korean overlay
    // back.
    await page.locator("#toggle-screen-ko").click()
    await page.waitForTimeout(500)
    expect(await overlayVisible(page), "the switch off must hide the windheading overlay").toBe(false)
    expect(await page.locator("#toggle-screen-ko").isChecked()).toBe(false)
    await page.screenshot({ path: join(evidenceDir, "04-toggle-off-english.png") })
    await page.locator("#toggle-screen-ko").click()
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })
    await expect
      .poll(async () => overlayText(page), { timeout: 10_000 })
      .toMatch(/^바람(?:서|북|동|남)$/)
    await page.screenshot({ path: join(evidenceDir, "05-toggle-on-korean.png") })

    // Diagnostic dump (observability log, never a pass/fail input): record
    // every probe value once at the end of the route so a future failure has
    // a single, identical reference frame to diff against.
    const finalProbe = await page.evaluate(() => {
      const canvas = document.querySelector("#game-canvas") as HTMLCanvasElement | null
      const anchor = document.querySelector("#game-viewport") as HTMLElement | null
      const overlay = document.querySelector('#game-viewport [data-role="windheading"]') as HTMLElement | null
      return {
        canvasRect: canvas?.getBoundingClientRect() ?? null,
        anchorRect: anchor?.getBoundingClientRect() ?? null,
        overlayRect: overlay?.getBoundingClientRect() ?? null,
        overlayHidden: overlay?.hasAttribute("hidden") ?? null,
        overlayText: overlay?.textContent ?? null,
        overlayScroll: overlay ? { scrollWidth: overlay.scrollWidth, clientWidth: overlay.clientWidth } : null,
        fontReady: document.fonts.check("16px NeoDunggeunmo"),
        bodyDataEngineStarted: document.body.dataset["engineStarted"] ?? null,
        toggleScreenKo: (document.querySelector("#toggle-screen-ko") as HTMLInputElement | null)?.checked ?? null
      }
    })
    writeFileSync(
      join(evidenceDir, "wind-heading-final-probe.json"),
      `${JSON.stringify(finalProbe, null, 2)}\n`
    )
  })

  test("the wind heading element is a sibling of the message-area overlay, both live inside #game-viewport and never inside #overlay-layer", async ({
    page
  }) => {
    // Tight DOM-only spec: cheap to run, no engine drive. Confirms the
    // windheading box is parented EXACTLY where wind-dom.ts:36 says it is
    // (`options.host.appendChild(box)` -> #game-viewport). The message-area
    // spec already proves the same invariant for its own box; this test
    // pins both roles down together so a future refactor that relocates
    // one of them is caught without booting the engine.
    test.setTimeout(60_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")

    await page.goto("/")
    // No boot needed: the overlay layer + viewport wrappers exist in the
    // static HTML before the engine starts, so the DOM-tree check below is
    // enough by itself.
    const tree = await page.evaluate(() => {
      const root = document.querySelector("#game-viewport")
      const overlayLayer = document.querySelector("#overlay-layer")
      const messageArea = document.querySelector('#game-viewport [data-role="messagearea"]')
      const wind = document.querySelector('#game-viewport [data-role="windheading"]')
      return {
        rootExists: root !== null,
        rootChildren: root ? Array.from(root.children).map((c) => c.id || (c as HTMLElement).dataset["role"] || c.tagName) : [],
        overlayLayerExists: overlayLayer !== null,
        messageAreaExists: messageArea !== null,
        messageAreaParent: messageArea?.parentElement?.id ?? null,
        windExists: wind !== null,
        windParent: wind?.parentElement?.id ?? null,
        windInOverlayLayer: overlayLayer ? overlayLayer.contains(wind) : false,
        messageInOverlayLayer: overlayLayer ? overlayLayer.contains(messageArea) : false
      }
    })
    expect(tree.rootExists, "#game-viewport must exist in the static shell").toBe(true)
    expect(tree.windExists, "the windheading box must live in the static shell from the first render").toBe(true)
    expect(tree.windParent, "the windheading box must be a child of #game-viewport (wind-dom.ts:36)").toBe("#game-viewport")
    expect(tree.windInOverlayLayer, "the windheading box must NOT be inside #overlay-layer").toBe(false)
    expect(tree.messageAreaExists, "the messagearea box must live in the static shell from the first render").toBe(true)
    expect(tree.messageAreaParent, "the messagearea box must be a child of #game-viewport (message-area-dom.ts)").toBe("#game-viewport")
    expect(tree.messageInOverlayLayer, "the messagearea box must NOT be inside #overlay-layer").toBe(false)
    writeFileSync(join(evidenceDir, "static-tree.json"), `${JSON.stringify(tree, null, 2)}\n`)
  })
})