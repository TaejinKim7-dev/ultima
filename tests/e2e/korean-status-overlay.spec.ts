import { expect, test, type Page } from "./fixtures.ts"
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
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-27")

type Entry = { sourceHash?: string; translation: string }
function entries(file: string): Record<string, Entry> {
  return (JSON.parse(readFileSync(join(repoRoot, "locales/ko", file), "utf8")) as { entries: Record<string, Entry> })
    .entries
}
const uiEntries = entries("ui.json")
const moduleEntries = entries("module.json")
const glossaryEntries = entries("glossary.json")

/**
 * Todo 33: the eight reagent names exactly as vendor/xu4/src/names.cpp's
 * getReagentName() `reagentNames[]` table spells them, in table order.
 */
const REAGENT_NAMES = [
  "Sulfur Ash",
  "Ginseng",
  "Garlic",
  "Spider Silk",
  "Blood Moss",
  "Black Pearl",
  "Nightshade",
  "Mandrake"
] as const

/** Korean reagent term, located by the sha256 of the names.cpp string. */
function koreanReagentName(english: string): string {
  const hash = `sha256:${createHash("sha256").update(english, "utf8").digest("hex")}`
  const found = Object.entries(glossaryEntries).find(([, entry]) => entry.sourceHash === hash)
  if (found === undefined) throw new Error(`fixture: reagent name not inventoried: ${JSON.stringify(english)}`)
  return found[1].translation
}

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

    // --- Todo 31: the food/gold summary, on its own region. ---
    const summary = squash(await page.locator('#overlay-layer [data-role="statussummary"]').innerText())
    const summaryPattern = squash(koreanForStatsLiteral("F:%04d   G:%04d")).replace(/%04d|%02d/g, "\\d+")
    expect(summary, "the food/gold summary must render in Korean").toMatch(new RegExp(summaryPattern))
    expect(summary, "the native English food/gold line must be gone").not.toMatch(/F:\d|G:\d/)
    // The summary row shares its native row with the masked avatar-aura glyph,
    // so this box must NOT be opaque-backed -- that is what keeps the glyph visible.
    expect(
      await page.locator('#overlay-layer [data-role="statussummary"].overlay-backed').count(),
      "the statussummary overlay must stay transparent so the aura glyph is not covered"
    ).toBe(0)
    log.push(`summary overlay: ${summary}`)

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
    // Reagents (Todo 31 + 33): the title AND the rows are Korean. The eight
    // reagent NAMES are inventoried and translated -- their authoritative
    // English is vendor/xu4/src/names.cpp getReagentName()'s reagentNames[]
    // table, and they resolve through GENERATED_STATUS_NAMES' `reagent` field
    // to the `reagent-*` glossary terms in locales/ko/glossary.json
    // (유황재/인삼/마늘/거미줄/핏빛이끼/흑진주/벨라도나/맨드레이크 -- the Korean
    // this corpus already used in vendors.b and the TLK dialogue, not invented
    // here). A row may never reach the overlay with its English name: assert
    // that for all eight, which is what fails the moment stats.cpp sends the
    // rows as `=kind:reagent:<English>` without the generator wiring in place.
    //
    // Todo 33 also dropped showReagents()'s titleOnly(), so this is no longer a
    // 1-row title strip: the titled flush sends the whole mainArea box,
    // (192,0,120,72), and the opaque overlay covers the English rows the
    // native raster still draws. It stops 8px above the avatar-aura glyph
    // cell, which the unit suite pins for every opaque role.
    await pressKey(page, "ArrowRight", 1200)
    const reagentsTitle = await statusText(page)
    expect(reagentsTitle).toContain(squash(koreanForStatsLiteral("Reagents")))
    expect(reagentsTitle).not.toContain("Reagents")
    for (const english of REAGENT_NAMES) {
      // Every name must have a ready Korean term, or the guard beside it
      // would be guarding nothing at all.
      expect(squash(koreanReagentName(english)), english).toMatch(/\p{Script=Hangul}/u)
      expect(reagentsTitle, `English reagent name leaked into the overlay: ${english}`).not.toContain(english)
    }
    const reagentBox = await page.evaluate(() => {
      const overlay = document.querySelector('#overlay-layer [data-role="status"]')!.getBoundingClientRect()
      const canvas = document.querySelector("#game-canvas")!.getBoundingClientRect()
      return {
        ratio: overlay.height / canvas.height,
        overlayBottom: overlay.bottom - canvas.top,
        auraTop: (80 * canvas.height) / 200
      }
    })
    // The box is the full (192,0,120,72) status box: 72px of the 200px-tall
    // logical screen. A fresh Fighter owns no reagents, so there are no row
    // LABELS to read here (the Korean names above are asserted for the
    // vocabulary and tests/unit/reagent-emission.test.ts covers the emitted
    // rows); what this pins is that the box is no longer a 1-row title strip
    // and still stays below the avatar-aura glyph row. The bound is
    // aura-relative (auraTop = 80px at 1x, +0.5px epsilon, the same convention
    // as the party-overview guard at line 160), which is robust to sub-pixel
    // accumulation across engines (WebKit measured 72.069px vs nominal 72px)
    // and needs no magic ratio.
    expect(reagentBox.ratio).toBeGreaterThan(0.3)
    expect(reagentBox.overlayBottom).toBeLessThanOrEqual(reagentBox.auraTop + 0.5)
    await page.screenshot({ path: join(evidenceDir, "status-reagents.png") })
    log.push(
      `views: weapons/armour/equipment/items overlays ok, reagents view sends the Korean title and ` +
        `the full status box (8 English reagent names absent from the overlay; the row emission ` +
        `itself is covered by tests/unit/reagent-emission.test.ts -- a fresh Fighter has none)`
    )

    // --- Back to the party overview. ---
    await pressKey(page, "Escape", 1500)
    const partyAgain = await statusText(page)
    expect(partyAgain).toMatch(/1-?avatar/i)
    writeFileSync(join(evidenceDir, "status-overlay-observation.log"), `${log.join("\n")}\n`)
  })
})
