import { expect, test, type Page } from "@playwright/test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 27: the in-game status column (party overview, Ztats details,
// weapons/armour/equipment/items) shown in Korean in the "status" DOM
// overlay over the real running engine's canvas, with an opaque backing
// hiding the English raster underneath. Driven with the user's real
// ultima4.zip and a test-chosen character name ("Avatar" -- the player name
// is user data and must reach the overlay untranslated).
//
// Expected Korean text comes from this project's own translation data:
// stats.cpp literals by the sha256 of the xu4 source literal (the same
// `sourceHash` locales/ko/ui.json records), weapon/armour names by their
// `module:Ultima-IV:config:<n>` ids -- never from original game data.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = "/home/taejin/ultima/.omo/evidence/ultima-web/task-27"

type Entry = { sourceHash?: string; translation: string }
function entries(file: string): Record<string, Entry> {
  return (JSON.parse(readFileSync(join(repoRoot, "locales/ko", file), "utf8")) as { entries: Record<string, Entry> })
    .entries
}
const uiEntries = entries("ui.json")
const moduleEntries = entries("module.json")

function koreanForStatsLiteral(literal: string): string {
  const hash = `sha256:${createHash("sha256").update(literal, "utf8").digest("hex")}`
  const found = Object.entries(uiEntries).find(([id, entry]) => id.startsWith("ui:stats:") && entry.sourceHash === hash)
  if (found === undefined) throw new Error(`fixture: stats literal not inventoried: ${JSON.stringify(literal)}`)
  return found[1].translation
}

function configTranslations(from: number, to: number, step = 1): string[] {
  const out: string[] = []
  for (let i = from; i <= to; i += step) out.push(moduleEntries[`module:Ultima-IV:config:${i}`]!.translation)
  return out
}

/** Visible text only: whitespace, control glyphs and the title arrows removed. */
function squash(text: string): string {
  return text.replace(/[\s\x00-\x1f▸◂●]+/g, "")
}

async function pressKey(page: Page, key: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(key)
  await page.waitForTimeout(delayMs)
}

async function statusText(page: Page): Promise<string> {
  const locator = page.locator('#overlay-layer [data-role="status"]')
  if ((await locator.count()) === 0) return ""
  return squash(await locator.innerText())
}

async function isOpaque(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const element = document.querySelector('#overlay-layer [data-role="status"]')
    if (element === null) return false
    const match = /rgba?\(([^)]+)\)/.exec(getComputedStyle(element).backgroundColor)
    if (match === null) return false
    const parts = match[1]!.split(",").map((part) => Number(part.trim()))
    return parts.length === 3 || parts[3] === 1
  })
}

test.describe("Todo 27: the status column in Korean via the status overlay", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("party overview, Ztats details (weapon/armour), weapons, armour, equipment, items and reagents views", async ({
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
    await pressKey(page, "i", 1500) // Initiate New Game: name prompt
    for (const ch of "Avatar") await pressKey(page, ch, 150)
    await pressKey(page, "Enter", 1200)
    await pressKey(page, "m", 2500)

    // Character creation (see korean-intro-overlay.spec.ts); count FRESH saves.
    await page.evaluate(() => {
      const w = window as unknown as { __freshSaves: number }
      w.__freshSaves = 0
      new MutationObserver(() => {
        if (document.querySelector("#save-status")!.textContent!.includes("완료")) w.__freshSaves += 1
      }).observe(document.querySelector("#save-status")!, { childList: true, characterData: true, subtree: true })
    })
    const freshSaves = () => page.evaluate(() => (window as unknown as { __freshSaves: number }).__freshSaves)
    let saved = false
    for (let i = 0; i < 26 && !saved; i++) {
      await pressKey(page, "Enter", 700)
      saved = (await freshSaves()) > 0
    }
    for (let i = 0; i < 20 && !saved; i++) {
      await pressKey(page, "Enter", 2600)
      await pressKey(page, "a", 1500)
      saved = (await freshSaves()) > 0
    }
    expect(saved, "character creation never produced a fresh 저장 완료").toBe(true)
    await pressKey(page, "Enter", 2000) // segue 1
    await pressKey(page, "Enter", 4000) // segue 2 -> StagePlay

    const log: string[] = []

    // --- Party overview. ---
    const party = await statusText(page)
    await page.screenshot({ path: join(evidenceDir, "status-overlay.png") })
    log.push(`party overlay: ${party.length} chars, opaque=${await isOpaque(page)}`)
    expect(party, "the party overview never showed the status overlay").not.toBe("")
    // number + marker + the untranslated player name (the engine stores the typed letters as-is, case aside)
    expect(party).toMatch(/1-?avatar\d+양호/i)
        expect(await isOpaque(page), "the Korean status overlay must hide the English canvas text").toBe(true)
    const geometry = await page.evaluate(() => {
      const overlay = document.querySelector('#overlay-layer [data-role="status"]')!.getBoundingClientRect()
      const canvas = document.querySelector("#game-canvas")!.getBoundingClientRect()
      return { overlayBottom: overlay.bottom - canvas.top, auraTop: (80 * canvas.height) / 200 }
    })
    log.push(`status overlay bottom ${geometry.overlayBottom.toFixed(1)}px <= aura glyph row top ${geometry.auraTop.toFixed(1)}px`)
    expect(geometry.overlayBottom).toBeLessThanOrEqual(geometry.auraTop + 0.5)

    // --- Ztats details (player 1). ---
    await pressKey(page, "z", 1500)
    const details = await statusText(page)
    await page.screenshot({ path: join(evidenceDir, "status-ztats-details.png") })
    const weaponNames = configTranslations(12, 42, 2).map(squash)
    const armorNames = configTranslations(3, 10).map(squash)
    const classNames = configTranslations(45, 52).map(squash)
    log.push(`ztats details overlay: ${details.length} chars`)
    expect(details.toLowerCase()).toContain("avatar") // title row: the name, untouched
    expect(details).toContain(squash(koreanForStatsLiteral(" MP:%02d  LV:%d")).replace(/%02d|%d/g, "").slice(0, 2))
    expect(details).not.toMatch(/MP:|STR:|DEX:|INT:/)
    expect(classNames.some((name) => details.includes(name)), "class name in Korean").toBe(true)
    const weaponLabel = squash(koreanForStatsLiteral("W:%s")).replace("%s", "")
    const armorLabel = squash(koreanForStatsLiteral("A:%s")).replace("%s", "")
    expect(weaponNames.some((name) => details.includes(`${weaponLabel}${name}`)), "weapon name in Korean").toBe(true)
    expect(armorNames.some((name) => details.includes(`${armorLabel}${name}`)), "armour name in Korean").toBe(true)

    // --- Views cycle with Right inside Ztats. ---
    await pressKey(page, "ArrowRight", 1200)
    const weapons = await statusText(page)
    await page.screenshot({ path: join(evidenceDir, "status-weapons.png") })
    expect(weapons).toContain(squash(koreanForStatsLiteral("Weapons")))
    expect(weapons).toContain(`A-${squash(configTranslations(12, 12)[0]!)}`) // A-<hands>
    await pressKey(page, "ArrowRight", 1200)
    const armor = await statusText(page)
    expect(armor).toContain(squash(koreanForStatsLiteral("Armour")))
    expect(armor).toContain(squash(koreanForStatsLiteral("A  -No Armour")))
    await pressKey(page, "ArrowRight", 1200)
    const equipment = await statusText(page)
    await page.screenshot({ path: join(evidenceDir, "status-equipment.png") })
    expect(equipment).toContain(squash(koreanForStatsLiteral("Equipment")))
    expect(equipment).toContain(squash(koreanForStatsLiteral("%2d Torches")).replace("%2d", "").replace("%d", ""))
    await pressKey(page, "ArrowRight", 1200)
    const items = await statusText(page)
    expect(items).toContain(squash(koreanForStatsLiteral("Items")))
    // Reagents keep the native raster (English): the overlay is removed, not stale.
    await pressKey(page, "ArrowRight", 1200)
    expect(await page.locator('#overlay-layer [data-role="status"]').count(), "the reagents view must drop the overlay").toBe(0)
    log.push("views: weapons/armour/equipment/items overlays ok, reagents view drops the overlay")

    // --- Back to the party overview. ---
    await pressKey(page, "Escape", 1500)
    const partyAgain = await statusText(page)
    expect(partyAgain).toMatch(/1-?avatar/i)
    writeFileSync(join(evidenceDir, "status-overlay-observation.log"), `${log.join("\n")}\n`)
  })
})
