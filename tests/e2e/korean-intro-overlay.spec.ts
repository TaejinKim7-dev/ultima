import { expect, test, type Page } from "@playwright/test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 26: the intro (main menu, Configure menus, name/sex prompts, story)
// shown in Korean in the DOM overlays over the real running engine's
// canvas, with an opaque backing hiding the English raster underneath
// (user decision, 2026-09-27). Driven with the user's real ultima4.zip.
//
// Expected Korean text comes from this project's own translation data:
// code literals by the sha256 of the xu4 source literal (the same
// `sourceHash` locales/ko/ui.json records), TITLE.EXE story text by its
// `title.exe:introText:<n>` id in locales/ko/binary.json -- never from the
// original English data.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = "/home/taejin/ultima/.omo/evidence/ultima-web/task-26"

type Entry = { sourceHash?: string; sourceFile?: string; translation: string }
function entries(file: string): Record<string, Entry> {
  return (JSON.parse(readFileSync(join(repoRoot, "locales/ko", file), "utf8")) as { entries: Record<string, Entry> })
    .entries
}
const uiEntries = entries("ui.json")
const binaryEntries = entries("binary.json")

function koreanForIntroLiteral(literal: string): string {
  const hash = `sha256:${createHash("sha256").update(literal, "utf8").digest("hex")}`
  const found = Object.entries(uiEntries).find(
    ([id, entry]) => id.startsWith("ui:intro:") && entry.sourceHash === hash
  )
  if (found === undefined) {
    throw new Error(`fixture: intro literal not inventoried: ${JSON.stringify(literal)}`)
  }
  return found[1].translation
}

/** Visible text only: control glyphs (\b, \x0f, \t) and whitespace removed. */
function squash(text: string): string {
  return text.replace(/[\s\x00-\x1f▸◂©]+/g, "")
}

async function pressKey(page: Page, key: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(key)
  await page.waitForTimeout(delayMs)
}

async function overlayText(page: Page, role: string): Promise<string> {
  const locator = page.locator(`#overlay-layer [data-role="${role}"]`)
  if ((await locator.count()) === 0) return ""
  return squash(await locator.innerText())
}

async function selectedRow(page: Page, role: string): Promise<string> {
  const locator = page.locator(`#overlay-layer [data-role="${role}"] .overlay-row-label.selected`)
  if ((await locator.count()) === 0) return ""
  return squash(await locator.first().innerText())
}

async function isOpaque(page: Page, role: string): Promise<boolean> {
  return page.evaluate((r) => {
    const element = document.querySelector(`#overlay-layer [data-role="${r}"]`)
    if (element === null) return false
    const color = getComputedStyle(element).backgroundColor
    const match = /rgba?\(([^)]+)\)/.exec(color)
    if (match === null) return false
    const parts = match[1]!.split(",").map((part) => Number(part.trim()))
    return parts.length === 3 || parts[3] === 1
  }, role)
}

test.describe("Todo 26: the intro in Korean via DOM overlays", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: main menu, Configure/gameplay menu with a moving selection, name/sex prompts and the first story page show Korean overlays, and they are gone once the game starts", async ({
    page
  }) => {
    test.setTimeout(420_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")

    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({
      name: "ultima4.zip",
      mimeType: "application/zip",
      buffer: readFileSync(zipPath!)
    })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    await page.locator("#game-canvas").click()
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter", 1500) // INTRO_MAP -> INTRO_MENU

    const log: string[] = []

    // Main menu.
    const mainMenu = await overlayText(page, "menu")
    log.push(`main menu overlay: ${mainMenu.length} chars, opaque=${await isOpaque(page, "menu")}`)
    await page.screenshot({ path: join(evidenceDir, "intro-overlay.png") })
    expect(mainMenu).toContain(squash(koreanForIntroLiteral("Journey Onward")))
    expect(mainMenu).toContain(squash(koreanForIntroLiteral("Initiate New Game")))
    expect(await isOpaque(page, "menu"), "the Korean menu overlay must hide the English canvas text").toBe(true)

    // Configure -> Enhanced Gameplay Options, then move the selection.
    await pressKey(page, "c", 2000)
    // The Configure menus draw in the extended menu area -> the "textview" role.
    const confMenu = await overlayText(page, "textview")
    expect(confMenu).toContain(squash(koreanForIntroLiteral("XU4 Configuration:")))
    expect(confMenu).toContain(squash(koreanForIntroLiteral("\x08 Video Options")))
    expect(await isOpaque(page, "textview"), "the Korean Configure overlay must hide the English canvas text").toBe(true)
    expect(await overlayText(page, "menu"), "the main-menu overlay must be gone under Configure").toBe("")
    await pressKey(page, "g", 2000)
    const gameplayMenu = await overlayText(page, "textview")
    await page.screenshot({ path: join(evidenceDir, "intro-gameplay-menu.png") })
    expect(gameplayMenu).toContain(squash(koreanForIntroLiteral("Debug Mode (Cheats)        %s").replace("%s", "")))
    const before = await selectedRow(page, "textview")
    await pressKey(page, "ArrowDown", 1200)
    const after = await selectedRow(page, "textview")
    log.push(`gameplay menu selection: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
    expect(before).not.toBe("")
    expect(after).not.toBe("")
    expect(after).not.toBe(before)
    await pressKey(page, "c", 2000) // gameplay menu: Cancel
    await pressKey(page, "m", 2500) // Configure: Main Menu

    // New game: name prompt, sex prompt, first story page.
    await pressKey(page, "i", 1500)
    const namePrompt = await overlayText(page, "menu")
    expect(namePrompt).toContain(squash(koreanForIntroLiteral("By what name shalt thou be known")))
    // The opaque name-prompt overlay must not cover the typed name (native
    // row 7 = logical y 160): its bottom edge has to sit above that row.
    const geometry = await page.evaluate(() => {
      const overlay = document.querySelector('#overlay-layer [data-role="menu"]')!.getBoundingClientRect()
      const canvas = document.querySelector("#game-canvas")!.getBoundingClientRect()
      return { overlayBottom: overlay.bottom - canvas.top, rowSevenTop: (160 * canvas.height) / 200 }
    })
    log.push(`name prompt overlay bottom ${geometry.overlayBottom.toFixed(1)}px < typed-name row top ${geometry.rowSevenTop.toFixed(1)}px`)
    expect(geometry.overlayBottom).toBeLessThanOrEqual(geometry.rowSevenTop)
    for (const ch of "Avatar") await pressKey(page, ch, 150)
    await pressKey(page, "Enter", 1200)
    const sexPrompt = await overlayText(page, "menu")
    expect(sexPrompt).toContain(squash(koreanForIntroLiteral("Art thou Male or Female?")))
    await pressKey(page, "m", 2500)
    const story = await overlayText(page, "textview")
    await page.screenshot({ path: join(evidenceDir, "intro-story-page.png") })
    log.push(`story page overlay: ${story.length} chars, opaque=${await isOpaque(page, "textview")}`)
    expect(story).toContain(squash(binaryEntries["title.exe:introText:0"]!.translation))
    expect(await overlayText(page, "menu"), "the name/sex menu overlay must be gone during the story").toBe("")

    // Finish character creation. "#save-status" already reads 저장 완료 from
    // the Configure menu's settings write, so count FRESH saved transitions.
    await page.evaluate(() => {
      const w = window as unknown as { __freshSaves: number }
      w.__freshSaves = 0
      new MutationObserver(() => {
        if (document.querySelector("#save-status")!.textContent!.includes("완료")) w.__freshSaves += 1
      }).observe(document.querySelector("#save-status")!, { childList: true, characterData: true, subtree: true })
    })
    const freshSaves = () => page.evaluate(() => (window as unknown as { __freshSaves: number }).__freshSaves)
    let saved = false
    let sawCards = false
    let sawQuestion = false
    const observeScene = async () => {
      const text = await overlayText(page, "textview")
      if (!sawCards && text.includes(squash(koreanForIntroLiteral('"Consider this:"')))) {
        sawCards = true
        await page.screenshot({ path: join(evidenceDir, "intro-gypsy-cards.png") })
        log.push(`gypsy card scene overlay: ${text.length} chars`)
      }
      if (!sawQuestion && text.includes("A)") && text.includes("B)")) {
        sawQuestion = true
        await page.screenshot({ path: join(evidenceDir, "intro-gypsy-question.png") })
        log.push(`gypsy question overlay: ${text.length} chars`)
      }
    }
    for (let i = 0; i < 26 && !saved; i++) {
      await pressKey(page, "Enter", 700)
      await observeScene()
      saved = (await freshSaves()) > 0
    }
    for (let i = 0; i < 20 && !saved; i++) {
      await pressKey(page, "Enter", 2600)
      await observeScene()
      await pressKey(page, "a", 1500)
      await observeScene()
      saved = (await freshSaves()) > 0
    }
    expect(sawCards, "the gypsy card scene never showed its Korean overlay").toBe(true)
    expect(sawQuestion, "no gypsy virtue question showed its Korean overlay").toBe(true)
    expect(saved, "character creation never produced a fresh 저장 완료").toBe(true)
    // Somewhere in the gypsy card scene the overlay showed the virtue cards' Korean text.
    await pressKey(page, "Enter", 2000) // segue 1
    await pressKey(page, "Enter", 3000) // segue 2 -> StagePlay
    const leftover = await page.locator('#overlay-layer [data-role="menu"], #overlay-layer [data-role="textview"]').count()
    await page.screenshot({ path: join(evidenceDir, "intro-overlay-cleared-in-game.png") })
    log.push(`intro overlays left after the game started: ${leftover}`)
    writeFileSync(join(evidenceDir, "intro-overlay-observation.log"), `${log.join("\n")}\n`)
    expect(leftover).toBe(0)
  })
})
