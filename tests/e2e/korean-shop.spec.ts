import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { extractBoronLiterals } from "../../scripts/lib/boron-strings.mjs"

// Todo 25: shop (vendor) conversations shown in Korean in the HTML dialogue
// panel, driven against the REAL running engine with the user's real
// ultima4.zip.
//
// vendors.b prints shop text through `=>` / `input-shop`, which substitute
// the shop (@) and owner (%) names before the text reaches screenMessage().
// The web build's `web-say` cfunc therefore announces the unsubstituted
// template (hash) plus the symbol/value pairs, and the shell composes the
// Korean line. Expected Korean text is this project's own translation data
// (locales/ko/module.json), located by the English vendors.b literals (open
// source module text, not original game data).
//
// Moonglow's healer ("The Healer" / "Harmony") is the NPC at (25,28), behind
// a counter; talking across the counter from (25,26) reaches it.
// Real-game helpers are duplicated from tests/e2e/korean-game-messages.spec.ts
// per this project's per-spec helper convention.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-25")

type Entry = { translation: string }
const moduleEntries = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/module.json"), "utf8")) as { entries: Record<string, Entry> }
).entries
const vendorLiterals = extractBoronLiterals(readFileSync(join(repoRoot, "vendor/xu4/module/Ultima-IV/vendors.b"), "utf8"))

/** Korean translation of the vendors.b literal whose text is exactly `english`. */
function korean(english: string): string {
  const index = vendorLiterals.findIndex((literal) => literal.text === english)
  const entry = moduleEntries[`module:Ultima-IV:vendors:${index}`]
  if (index < 0 || entry === undefined || entry.translation.trim() === "") {
    throw new Error(`fixture: no Korean translation for ${JSON.stringify(english)}`)
  }
  return entry.translation
}

// The panel renders each native line as its own <p>, so compare with all
// whitespace removed.
function squash(text: string): string {
  return text.replace(/\s+/g, "")
}

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

/** Real Configure menu -> Debug Mode (see korean-npc-alias.spec.ts's enableDebugMode doc comment). */
async function enableDebugMode(page: Page): Promise<void> {
  await pressKey(page, "c", 2000)
  await pressKey(page, "g", 2000)
  await pressKey(page, "d", 2000)
  await pressKey(page, "u", 2000)
  await pressKey(page, "m", 2500)
}

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}


/** Korean translation of the vendors.b literal whose text contains `fragment`. */
function koreanContaining(fragment: string): string {
  const literal = vendorLiterals.find((row) => row.text.includes(fragment))
  if (literal === undefined) {
    throw new Error(`fixture: no vendors.b literal contains ${JSON.stringify(fragment)}`)
  }
  return korean(literal.text)
}

/**
 * The parts of a Korean vendor template that are not substitution symbols or
 * their particles, whitespace-squashed: what must appear around the names.
 */
function fixedFragments(template: string): string[] {
  return squash(template.replace(/[{}]/g, ""))
    .split(/[@%$#=]/)
    .map((part) => part.replace(/^(\(이\)가|을\(를\)|이\(가\)|\(을\)를)/, ""))
    .filter((part) => part.length > 0)
}

const SLOW = squash(uiKorean("ui:game:118"))
const BLOCKED = squash(uiKorean("ui:game:121"))
const TALK_PROMPT = squash(uiKorean("ui:game:141"))
const NO_RESPONSE = squash(uiKorean("ui:game:143"))

function uiKorean(id: string): string {
  const ui = JSON.parse(readFileSync(join(repoRoot, "locales/ko/ui.json"), "utf8")) as { entries: Record<string, Entry> }
  const entry = ui.entries[id]
  if (entry === undefined) {
    throw new Error(`fixture: missing ${id}`)
  }
  return entry.translation.replace(/%c/g, "")
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/**
 * Walks `steps` tiles in `key`'s direction. Town movement is RNG-slowed
 * ("Slow progress!" costs the turn but not the move), so every press is
 * checked against the Korean slow/blocked lines the Todo 23 hook puts in the
 * panel and repeated until the wanted number of tiles was really walked.
 */
async function walk(page: Page, key: string, steps: number): Promise<void> {
  let moved = 0
  for (let attempt = 0; attempt < steps * 8 && moved < steps; attempt++) {
    const before = await panelText(page)
    await pressKey(page, key, 650)
    const after = await panelText(page)
    const lost = occurrences(after, SLOW) - occurrences(before, SLOW) + occurrences(after, BLOCKED) - occurrences(before, BLOCKED)
    if (lost === 0) {
      moved++
    }
  }
  expect(moved, `could not walk ${steps} tiles ${key}`).toBe(steps)
}

/** Walks until the engine reports "Blocked!" (a wall), returning how many tiles were really walked. */
async function walkUntilBlocked(page: Page, key: string, maxSteps: number): Promise<number> {
  let moved = 0
  let blockedInARow = 0
  for (let attempt = 0; attempt < maxSteps * 3; attempt++) {
    const before = await panelText(page)
    await pressKey(page, key, 650)
    const after = await panelText(page)
    if (occurrences(after, BLOCKED) > occurrences(before, BLOCKED)) {
      // A wandering townsperson can block the corridor too: only a wall blocks repeatedly.
      if (++blockedInARow >= 4) {
        return moved
      }
      continue
    }
    blockedInARow = 0
    if (occurrences(after, SLOW) === occurrences(before, SLOW)) {
      moved++
    }
  }
  throw new Error(`never blocked walking ${key}`)
}

/**
 * Moonglow's shopkeepers pace behind their counters, so a fixed tile is not
 * reliable: talk across the counter, and while nobody answers (the Korean
 * shop name never appears) sweep along the counter, bouncing at both ends.
 */
async function talkAcrossCounter(page: Page, talkKey: string, sweep: readonly [string, string], span: number, shopName: string): Promise<void> {
  const seen = occurrences(await panelText(page), shopName)
  let offset = 0
  let forward = true
  // Failure evidence: what each talk attempt actually printed, so a failure
  // tells "talked to nobody" (NO_RESPONSE) apart from "never got a talk
  // prompt" or "talked to someone else".
  const attempts: string[] = []
  for (let attempt = 0; attempt < 40; attempt++) {
    const before = await panelText(page)
    await pressKey(page, "t", 400)
    await pressKey(page, talkKey, 1500)
    const after = await panelText(page)
    if (occurrences(after, shopName) > seen) {
      return
    }
    attempts.push(`#${attempt} offset=${offset}: ${JSON.stringify(after.startsWith(before) ? after.slice(before.length) : after.slice(-160))}`)
    if (forward ? offset === span : offset === 0) {
      forward = !forward
    }
    await walk(page, forward ? sweep[0] : sweep[1], 1)
    offset += forward ? 1 : -1
  }
  const panel = await panelText(page)
  writeFileSync(
    join(evidenceDir, `shop-failure-${talkKey}.log`),
    [
      `talk prompt "${TALK_PROMPT}" occurrences: ${occurrences(panel, TALK_PROMPT)}`,
      `no-response "${NO_RESPONSE}" occurrences: ${occurrences(panel, NO_RESPONSE)}`,
      ...attempts
    ].join("\n") + "\n"
  )
  await page.screenshot({ path: join(evidenceDir, `shop-failure-${talkKey}.png`) })
  throw new Error(`nobody answered across the counter (${talkKey})`)
}

async function enterMoonglow(page: Page): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(1000)
  await pressKey(page, "g", 1000)
  await typeAscii(page, "moonglow", 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2500)
}

async function startRealGame(page: Page, buffer: Buffer): Promise<void> {
  await bootAndSelectZip(page, buffer)
  expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)
  await bootAndSelectZip(page, buffer)
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter")
  await pressKey(page, "Enter")
  await enableDebugMode(page)
  await pressKey(page, "j", 2500) // Journey Onward
}

test.describe("Todo 25: shop conversations shown in Korean in the dialogue panel", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  // Moonglow's corridor (row 15) runs east from the entrance and ends at a
  // wall: the food vendor's column is 4 tiles west of that end (observed on the real map), which
  // anchors dead reckoning without needing the entrance coordinates.
  async function reachMoonglowCorridorEnd(page: Page, buffer: Buffer): Promise<void> {
    await startRealGame(page, buffer)
    await enterMoonglow(page)
    // A townsperson standing in the corridor also reports "Blocked!": if the
    // walk stopped far short of the wall, wait for it to move and continue.
    let walked = 0
    for (let round = 0; round < 6 && walked <= 20; round++) {
      walked += await walkUntilBlocked(page, "ArrowRight", 40)
      if (walked <= 20) {
        await page.waitForTimeout(5000)
      }
    }
    await page.screenshot({ path: join(evidenceDir, "corridor-end.png") })
    expect(walked, "the corridor should be long").toBeGreaterThan(20)
  }

  test("healer (input-shop): welcome shows Korean shop and owner names", async ({ page }) => {
    test.setTimeout(900_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await reachMoonglowCorridorEnd(page, buffer) // now at the corridor's east end
    // Healer: 5 tiles west of the corridor end and 13 tiles south (one tile
    // west of the food vendor's column, behind the counter on row 27); go
    // down the north-south road 14 tiles west of the end, then east along row 26.
    await walk(page, "ArrowLeft", 14)
    await walk(page, "ArrowDown", 11)
    await walk(page, "ArrowRight", 7)
    await talkAcrossCounter(page, "ArrowDown", ["ArrowRight", "ArrowLeft"], 4, squash(korean("The Healer")))
    const healerPanel = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "shop-welcome.png") })

    const healerShop = squash(korean("The Healer"))
    const healerOwner = squash(korean("Harmony"))
    const welcome = koreanContaining("Peace and Joy be with you friend.")
    writeFileSync(
      join(evidenceDir, "shop-observation.log"),
      [
        `healer shop "${healerShop}" present: ${healerPanel.includes(healerShop)}`,
        `healer owner "${healerOwner}" present: ${healerPanel.includes(healerOwner)}`,
        ...fixedFragments(welcome).map((part) => `welcome fragment "${part}" present: ${healerPanel.includes(part)}`)
      ].join("\n") + "\n"
    )
    expect(healerPanel, "the healer's shop name was not shown in Korean").toContain(healerShop)
    expect(healerPanel, "the healer's owner name was not shown in Korean").toContain(healerOwner)
    for (const part of fixedFragments(welcome)) {
      expect(healerPanel, `Korean welcome fragment "${part}" missing`).toContain(part)
    }
    expect(pageErrors, "the vendor hook must never surface an uncaught error").toEqual([])
  })

  test("food vendor (=>): Korean welcome, priced offer with numbers, and the Korean farewell", async ({ page }) => {
    test.setTimeout(900_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await reachMoonglowCorridorEnd(page, buffer) // now at the corridor's east end
    // Food vendor at (26,13), across the counter from (26,15).
    await talkAcrossCounter(page, "ArrowUp", ["ArrowLeft", "ArrowRight"], 6, squash(korean("The Sage Deli")))
    const welcomePanel = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "food-welcome.png") })

    const shop = squash(korean("The Sage Deli"))
    const owner = squash(korean("Shaman"))
    const welcome = koreanContaining("Good day, and Welcome friend.")
    expect(welcomePanel, "shop name not shown in Korean").toContain(shop)
    expect(welcomePanel, "owner name not shown in Korean").toContain(owner)
    for (const part of fixedFragments(welcome)) {
      expect(welcomePanel, `Korean welcome fragment "${part}" missing`).toContain(part)
    }

    // 'y': "We have the best adventure rations, # for only $gp." -> numbers 25 and 25.
    await pressKey(page, "y", 2500)
    const offerPanel = await panelText(page)
    const offer = koreanContaining("We have the best adventure rations")
    for (const part of fixedFragments(offer)) {
      expect(offerPanel, `Korean offer fragment "${part}" missing`).toContain(part)
    }
    expect(offerPanel).toMatch(/25.*25/)
    await page.screenshot({ path: join(evidenceDir, "food-offer.png") })

    // An empty quantity ends the visit: "Too bad..." then the farewell (plain >> literals).
    await pressKey(page, "Enter", 3000)
    const farewellPanel = await panelText(page)
    for (const part of fixedFragments(koreanContaining("Goodbye. Come again!"))) {
      expect(farewellPanel, `Korean farewell fragment "${part}" missing`).toContain(part)
    }
    await page.screenshot({ path: join(evidenceDir, "food-farewell.png") })
    expect(pageErrors, "the vendor hook must never surface an uncaught error").toEqual([])
  })
})
