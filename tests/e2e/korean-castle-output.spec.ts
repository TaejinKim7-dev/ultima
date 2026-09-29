import { expect, test, type Page } from "@playwright/test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 24: Lord British and Hawkwind shown in Korean in the HTML dialogue
// panel, driven against the REAL running engine with the user's real
// ultima4.zip. The Codex / endgame text is not reachable here (it needs a
// cleared game); it is covered by tests/unit/castle-templates.test.ts and
// the wasm-symbols build check, plus the F3 manual note.
//
// Route (real Debug Mode cheat menu only, no production test hooks):
// Ctrl-C g "britannia" walks to the castle; Ctrl-C c turns collision off;
// Ctrl-C g "britannia" inside the castle jumps to the (3,3) stairs, so the
// 'k'limb reaches the second floor. NPC positions come from the original
// map data (spike, task-24/spike screenshots): Hawkwind (role 30 -> slot 29) stands on
// floor 1 at (9,27) and Lord British (role 32 -> slot 31) on floor 2 at (19,7); both are reached by plain arrow
// walking through walls. Expected Korean text is this project's own
// translation data (binary.json / ui.json), never original English.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-24")

const binary = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/binary.json"), "utf8")) as {
    entries: Record<string, { translation: string }>
  }
).entries
const ui = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/ui.json"), "utf8")) as {
    entries: Record<string, { sourceHash: string; translation: string }>
  }
).entries

function binaryKorean(id: string): string {
  const entry = binary[id]
  if (!entry || entry.translation === "") throw new Error(`fixture: no Korean translation for ${id}`)
  return entry.translation
}

/** Korean translation of an xu4 code literal (ui.json is keyed by the literal's sha256). */
function codeKorean(literal: string, ...args: string[]): string {
  const hash = `sha256:${createHash("sha256").update(Buffer.from(literal, "utf8")).digest("hex")}`
  const entry = Object.values(ui).find((candidate) => candidate.sourceHash === hash)
  if (!entry || entry.translation === "") throw new Error(`fixture: no Korean translation for ${JSON.stringify(literal)}`)
  let next = 0
  return entry.translation.replace(/%s/g, () => args[next++] ?? "")
}

// The panel renders each native line as its own <p>; compare without whitespace.
function squash(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase()
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

async function askEnglishKeyword(page: Page, word: string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await pressKey(page, "Backspace", 60)
  }
  await typeAscii(page, word, 150)
  await pressKey(page, "Enter", 2000)
}

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}


async function cheat(page: Page, key: string): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(800)
  await pressKey(page, key, 800)
}

async function gotoStairs(page: Page): Promise<void> {
  await cheat(page, "g")
  await typeAscii(page, "britannia", 100)
  await pressKey(page, "Enter", 1500)
}

async function walk(page: Page, key: string, steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) await pressKey(page, key, 350)
}

async function talk(page: Page, dir: string): Promise<void> {
  await pressKey(page, "t", 500)
  await pressKey(page, dir, 2500)
}

test.describe("Todo 24: Lord British and Hawkwind shown in Korean in the dialogue panel", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: Hawkwind greeting and Lord British name/help/bye appear in Korean in #dialogue-history", async ({ page }) => {
    test.setTimeout(900_000)
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

    // Overworld -> Castle Britannia (floor 1), collision off.
    await cheat(page, "g")
    await typeAscii(page, "britannia", 100)
    await pressKey(page, "Enter", 1500)
    await pressKey(page, "e", 2500)
    await cheat(page, "c")

    // Floor 1: stairs (3,3) -> Hawkwind's spot. Position pinned in the spike.
    await gotoStairs(page)
    await walk(page, "ArrowDown", 23)
    await walk(page, "ArrowRight", 6)
    await page.screenshot({ path: join(evidenceDir, "hawkwind-approach.png") })
    // Hawkwind wanders inside the SEER room, so sweep all four directions
    // until his welcome reaches the panel (RNG-dependent, like
    // korean-npc-alias.spec.ts's approachNpc()).
    const hw43 = squash(binaryKorean("avatar.exe:hawkwindText:43"))
    for (let round = 0; round < 12 && !(await panelText(page)).includes(hw43); round++) {
      for (const dir of ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]) {
        await talk(page, dir)
        if ((await panelText(page)).includes(hw43)) break
      }
    }
    await pressKey(page, "Enter", 1500) // greeting waitAnyKey
    const afterHawkwind = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "hawkwind-greeting.png") })
    await askEnglishKeyword(page, "bye")
    const afterHawkwindBye = await panelText(page)

    // Floor 2: Lord British at (19,7).
    await gotoStairs(page)
    await pressKey(page, "k", 2500)
    await walk(page, "ArrowRight", 15)
    await walk(page, "ArrowDown", 4)
    await page.screenshot({ path: join(evidenceDir, "lb-approach.png") })
    await talk(page, "ArrowRight")
    for (let i = 0; i < 2; i++) await pressKey(page, "Enter", 1500) // "At long last" / "new age" pauses
    const afterGreeting = await panelText(page)
    await askEnglishKeyword(page, "name")
    const afterName = await panelText(page)
    await askEnglishKeyword(page, "help")
    await pressKey(page, "Enter", 1500)
    const afterHelp = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "korean-castle-output.png") })
    await askEnglishKeyword(page, "bye")
    const afterBye = await panelText(page)

    const hw44 = squash(binaryKorean("avatar.exe:hawkwindText:44")).slice(0, 12)
    const hw52 = squash(binaryKorean("avatar.exe:hawkwindText:52")).slice(0, 12)
    const lbName = squash(binaryKorean("avatar.exe:lordBritishText:0")).slice(0, 14)
    const lbHelp = squash(
      codeKorean(
        "To survive in this hostile land thou must first know thyself! Seek ye to master thy weapons and thy magical ability!\n" +
          "\nTake great care in these thy first travels in Britannia.\n" +
          "\nUntil thou dost well know thyself, travel not far from the safety of the townes!\n"
      )
    ).slice(0, 20)
    const lbBye = squash(codeKorean("\nLord British says: Fare thee well my friend!\n"))
    writeFileSync(
      join(evidenceDir, "panel-observation.log"),
      [
        `hawkwind :43 welcome (Korean) present: ${afterHawkwind.includes(hw43)}`,
        `hawkwind :44 greeting head present: ${afterHawkwind.includes(hw44)}`,
        `hawkwind :52 farewell head present: ${afterHawkwindBye.includes(hw52)}`,
        `LB greeting has Hangul: ${/\p{Script=Hangul}/u.test(afterGreeting)}`,
        `LB name (text:0) head present: ${afterName.includes(lbName)}`,
        `LB help head present: ${afterHelp.includes(lbHelp)}`,
        `LB farewell present: ${afterBye.includes(lbBye)}`
      ].join("\n") + "\n"
    )

    expect(afterHawkwind, "Hawkwind welcome (hawkwindText:43) never reached the panel in Korean").toContain(hw43)
    expect(afterHawkwind, "Hawkwind greeting (hawkwindText:44) never reached the panel in Korean").toContain(hw44)
    expect(afterHawkwind.indexOf(hw43)).toBeLessThan(afterHawkwind.indexOf(hw44))
    expect(afterHawkwindBye).toContain(hw52)
    expect(afterName, "Lord British name reply (lordBritishText:0) not in Korean").toContain(lbName)
    expect(afterHelp, "Lord British help text not in Korean").toContain(lbHelp)
    expect(afterBye, "Lord British farewell not in Korean").toContain(lbBye)
  })
})
