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

async function selectedRow(page: Page): Promise<string> {
  const locator = page.locator('#overlay-layer [data-role="menu"] .overlay-row-label.selected')
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
    const confMenu = await overlayText(page, "menu")
    expect(confMenu).toContain(squash(koreanForIntroLiteral("\x08 Video Options")))
    await pressKey(page, "g", 2000)
    const gameplayMenu = await overlayText(page, "menu")
    await page.screenshot({ path: join(evidenceDir, "intro-gameplay-menu.png") })
    expect(gameplayMenu).toContain(squash(koreanForIntroLiteral("Debug Mode (Cheats)        %s").replace("%s", "")))
    const before = await selectedRow(page)
    await pressKey(page, "ArrowDown", 1200)
    const after = await selectedRow(page)
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

    // Finish character creation; once the game starts no intro overlay may remain.
    let saved = false
    for (let i = 0; i < 26 && !saved; i++) {
      await pressKey(page, "Enter", 700)
      saved = (await page.locator("#save-status").innerText()).includes("완료")
    }
    for (let i = 0; i < 20 && !saved; i++) {
      await pressKey(page, "Enter", 2600)
      await pressKey(page, "a", 1500)
      saved = (await page.locator("#save-status").innerText()).includes("완료")
    }
    expect(saved, "character creation never reported 저장 완료").toBe(true)
    await pressKey(page, "Enter", 2000) // segue 1
    await pressKey(page, "Enter", 3000) // segue 2 -> StagePlay
    const leftover = await page.locator('#overlay-layer [data-role="menu"], #overlay-layer [data-role="textview"]').count()
    await page.screenshot({ path: join(evidenceDir, "intro-overlay-cleared-in-game.png") })
    log.push(`intro overlays left after the game started: ${leftover}`)
    writeFileSync(join(evidenceDir, "intro-overlay-observation.log"), `${log.join("\n")}\n`)
    expect(leftover).toBe(0)
  })
})
