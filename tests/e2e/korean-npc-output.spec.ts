import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 22: real NPC dialogue shown in Korean in the HTML dialogue panel,
// driven against the REAL running engine with the user's real ultima4.zip.
//
// Expected Korean text is this project's own translation data
// (locales/ko/tlk.json, keyed `MAP:npcIndex:field` -- never original
// English TLK text), so the assertions below read the same table the
// shell resolves through. Calabrini is Moonglow record 12 (tlk.json
// `MOONGLOW:12:name` = the Korean name), the NPC
// gotoMoonglowAndApproachNpc() reliably meets (see
// tests/e2e/korean-npc-alias.spec.ts, whose real-game helpers are
// duplicated here per this project's per-spec helper convention).
//
// The canvas keeps rendering English (native bitmap font); this spec only
// checks #dialogue-history, the DOM surface Korean can actually appear on.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-22")
const CALABRINI = "MOONGLOW:12"

const tlkEntries = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/tlk.json"), "utf8")) as {
    entries: Record<string, { translation: string }>
  }
).entries

function korean(field: string): string {
  const entry = tlkEntries[`${CALABRINI}:${field}`]
  if (entry === undefined || entry.translation === "") {
    throw new Error(`fixture: no Korean translation for ${CALABRINI}:${field}`)
  }
  return entry.translation
}

// The panel renders each native line as its own <p>, so compare with all
// whitespace removed (translations carry the original TLK line breaks).
function squash(text: string): string {
  return text.replace(/\s+/g, "")
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
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

/** Real cheat-menu Goto Moonglow + the approach sweep that meets Calabrini (korean-npc-alias.spec.ts). */
async function gotoMoonglowAndApproachNpc(page: Page): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(1000)
  await pressKey(page, "g", 1000)
  await typeAscii(page, "moonglow", 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2000)
  const npcTalkDirs = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"]
  for (let i = 0; i < 6; i++) {
    await pressKey(page, "ArrowRight", 900)
    for (const talkDir of npcTalkDirs) {
      await pressKey(page, "t", 400)
      await pressKey(page, talkDir, 900)
    }
  }
}

async function askEnglishKeyword(page: Page, word: string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await pressKey(page, "Backspace", 60)
  }
  await typeAscii(page, word, 150)
  await pressKey(page, "Enter", 2000)
}

async function askKoreanKeyword(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  await input.click()
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
  await input.blur() // the shell's focus guard would otherwise swallow later game keys
}

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}

test.describe("Todo 22: real NPC dialogue shown in Korean in the dialogue panel", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: meeting Calabrini and asking health (English + Korean alias) and name shows Korean lines in #dialogue-history", async ({
    page
  }) => {
    test.setTimeout(480_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await bootAndSelectZip(page, buffer)
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 2500) // Journey Onward

    await gotoMoonglowAndApproachNpc(page)
    const afterMeet = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "01-after-meet.png") })

    await askEnglishKeyword(page, "health")
    const afterHealth = await panelText(page)
    await askKoreanKeyword(page, "건강")
    const afterAlias = await panelText(page)
    await askEnglishKeyword(page, "name")
    const afterName = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "korean-npc-output.png") })
    await askEnglishKeyword(page, "bye")
    const afterBye = await panelText(page)

    const look = squash(korean("look"))
    // Calabrini's topic2 keyword is "HEAL", and U4Talk_dialogue()
    // (vendor/xu4/src/discourse_tlk.cpp) checks topic1/topic2 BEFORE the
    // generic "heal" -> health field, so "health" answers with response2
    // (the canvas shows the same line in English). The first GREEN run
    // proved this: the panel showed response2's Korean, not health's.
    const health = squash(korean("response2"))
    const name = squash(korean("name"))
    writeFileSync(
      join(evidenceDir, "panel-observation.log"),
      [
        `look(${CALABRINI}) present after meet: ${afterMeet.includes(look)}`,
        `health reply (response2) occurrences: after English=${occurrences(afterHealth, health)} after alias=${occurrences(afterAlias, health)}`,
        `name present after name: ${afterName.includes(name)}`,
        `panel chars after bye: ${afterBye.length}`,
        `panel has Hangul: ${/\p{Script=Hangul}/u.test(afterBye)}`
      ].join("\n") + "\n"
    )

    // "You meet %s" with Calabrini's look, in Korean.
    expect(afterMeet, "Calabrini's look line (You meet ...) never reached the panel in Korean").toContain(look)
    // English "health" and the Korean alias both produce the Korean reply.
    expect(occurrences(afterHealth, health)).toBeGreaterThanOrEqual(1)
    expect(occurrences(afterAlias, health)).toBe(occurrences(afterHealth, health) + 1)
    // "%s says: I am %s" carries the Korean name.
    expect(afterName).toContain(name)
    // The conversation still ends cleanly: nothing after bye lost the history.
    expect(afterBye.length).toBeGreaterThanOrEqual(afterName.length)
  })
})
