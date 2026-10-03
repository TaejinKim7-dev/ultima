import { expect, test, type Page } from "./fixtures.ts"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 41: the Chamber of the Codex and the ending, observed in Korean in the
// HTML dialogue panel against the REAL running engine with the user's real
// ultima4.zip.
//
// Route (real Debug Mode only, no production test hooks):
//   * Ctrl-C i / v / j : items + keys + stones, full virtues, all companions
//     (the original cheat menu, vendor/xu4/src/cheat.cpp).
//   * Alt-C on the world map: the original debug shortcut (game.cpp, `'c' +
//     U4_ALT`, only with settings.debug) that teleports to the Abyss final
//     altar (7,7,7).
//   * The legitimate in-game stone use on that altar ("u"se -> stone -> the
//     level's virtue -> the level's stone colour) reaches codexStart() at
//     item.cpp, exactly as a real player would.
//
// Every typed answer (virtue/stone/principle names, Word of Passage, the final
// answer) is read AT RUN TIME from the open-source xu4 sources under
// vendor/xu4/src (names.cpp, codex.cpp) and never written into this file, a
// log or an evidence artifact. Expected Korean text is this project's own
// translation data (locales/ko/binary.json, ui.json). Code literals in
// codex.cpp are located by the code around them, so no game text is spelled
// out here either.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-41")

type Entry = { sourceHash?: string; translation: string }
const binary = (JSON.parse(readFileSync(join(repoRoot, "locales/ko/binary.json"), "utf8")) as { entries: Record<string, Entry> }).entries
const ui = (JSON.parse(readFileSync(join(repoRoot, "locales/ko/ui.json"), "utf8")) as { entries: Record<string, Entry> }).entries
const codexSource = readFileSync(join(repoRoot, "vendor/xu4/src/codex.cpp"), "utf8")
const namesSource = readFileSync(join(repoRoot, "vendor/xu4/src/names.cpp"), "utf8")

function squash(text: string): string {
  return text.replace(/\s+/g, "")
}

function binaryKorean(id: string): string {
  const entry = binary[id]
  if (!entry || entry.translation === "") throw new Error(`fixture: no Korean translation for ${id}`)
  return entry.translation
}

/** Unescapes a C string literal body. */
function unescapeC(body: string): string {
  return body.replace(/\\(n|t|"|\\)/g, (_m, ch: string) => (ch === "n" ? "\n" : ch === "t" ? "\t" : ch))
}

/** The Korean ui.json translation of an xu4 code literal, or undefined when none exists. */
function codeKoreanOrUndefined(literal: string): string | undefined {
  const hash = `sha256:${createHash("sha256").update(Buffer.from(literal, "utf8")).digest("hex")}`
  const entry = Object.values(ui).find((candidate) => candidate.sourceHash === hash)
  return entry && entry.translation !== "" ? entry.translation.replace(/%[sdc]/g, "") : undefined
}

/** First C string literal that follows `pattern` (a regex over the code in front of it) in codex.cpp. */
function literalAfter(pattern: RegExp): string {
  const match = pattern.exec(codexSource)
  if (!match || match[1] === undefined) throw new Error(`fixture: nothing matched ${pattern}`)
  return unescapeC(match[1])
}

const L = '"((?:[^"\\\\]|\\\\.)*)"'
const codexLiterals = {
  darkness: literalAfter(new RegExp(`codexStart[\\s\\S]*?pausedMessage\\(4, ${L}`)),
  keyUse: literalAfter(new RegExp(`pausedMessage\\(3, ${L}`)),
  passage: literalAfter(new RegExp(`pausedMessage\\(4, ${L}\\);\\s*screenEraseMapArea`)),
  impure: literalAfter(new RegExp(`codexImpureThoughts\\(\\) \\{\\s*pausedMessage\\(\\d+, ${L}`)),
  voiceAsks: literalAfter(new RegExp(`pausedMessage\\(2, ${L}\\);\\s*u4WebTalkId`)),
  versed: literalAfter(new RegExp(`\\+\\+current == VIRT_MAX\\)\\s*pausedMessage\\(5, ${L}`))
}

function cStrings(source: string, from: number, to: number): string[] {
  return Array.from(source.slice(from, to).matchAll(/"([^"]*)"/g), (m) => m[1] as string)
}

function arrayAfter(marker: string): string[] {
  const start = namesSource.indexOf(marker)
  if (start < 0) throw new Error(`fixture: ${marker} not found in names.cpp`)
  const open = namesSource.indexOf("{", start)
  return cStrings(namesSource, open, namesSource.indexOf("}", open))
}

const virtueNames = arrayAfter("getVirtueName(Virtue virtue)")
const stoneNames = arrayAfter("getStoneName(Virtue virtue)")
const baseNames = Array.from(
  namesSource.slice(namesSource.indexOf("getBaseVirtueName"), namesSource.indexOf("getBaseVirtues")).matchAll(/virtueMask == VIRT_(TRUTH|LOVE|COURAGE)\)\s*return "([^"]+)"/g),
  (m) => ({ key: m[1] as string, name: m[2] as string })
)
const baseByKey = new Map(baseNames.map((b) => [b.key, b.name]))
// codexHandleVirtues asks the three principles in the order of
// `1 << (current - VIRT_MAX)`: truth, love, courage.
const principleNames = ["TRUTH", "LOVE", "COURAGE"].map((key) => {
  const name = baseByKey.get(key)
  if (name === undefined) throw new Error(`fixture: base virtue ${key} not found`)
  return name
})
const comparedWords = Array.from(codexSource.matchAll(/strcasecmp\(codex->word\.c_str\(\), "([^"]+)"\)/g), (m) => m[1] as string)
const [wordOfPassage, finalAnswer] = comparedWords
if (wordOfPassage === undefined || finalAnswer === undefined) throw new Error("fixture: codex.cpp comparison words not found")

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

async function cheat(page: Page, key: string): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(800)
  await pressKey(page, key, 800)
}

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}

function occurrences(haystack: string, needle: string): number {
  return needle === "" ? 0 : haystack.split(needle).length - 1
}

/** Polls the panel until `needle` occurs at least `count` times. Returns whether it did. */
async function waitForCount(page: Page, needle: string, count: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (occurrences(await panelText(page), needle) >= count) return true
    await page.waitForTimeout(500)
  }
  return occurrences(await panelText(page), needle) >= count
}

/** Saves the panel's Korean text (translation data only) next to the screenshots, for post-mortems. */
async function dumpPanel(page: Page, name: string): Promise<void> {
  writeFileSync(join(evidenceDir, `${name}.txt`), (await page.locator("#dialogue-history").innerText()) + "\n")
  await page.screenshot({ path: join(evidenceDir, `${name}.png`) })
}

/** Types a line into the engine's text prompt (gameGetInput) and submits it. */
async function answer(page: Page, text: string): Promise<void> {
  await typeAscii(page, text, 100)
  await pressKey(page, "Enter", 600)
}

const head = (korean: string, n = 14): string => squash(korean).slice(0, n)

test.describe("Todo 41: Chamber of the Codex and ending observed in Korean", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("Alt-C debug altar -> stone use -> Codex: wrong answer rejection, eleven Korean questions, Korean ending", async ({ page }) => {
    test.setTimeout(1_200_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    const log: string[] = []
    const note = (line: string): void => {
      log.push(line)
      writeFileSync(join(evidenceDir, "codex-observation.log"), log.join("\n") + "\n")
    }

    await bootAndSelectZip(page, buffer)
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)
    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 2500) // Journey Onward

    // Cheat order matters: full virtues; full stats (Party::join refuses
    // companions until the avatar's max HP reaches 100 per party slot, and with
    // one plain press only Iolo joined -- the Codex then ejected with the
    // Korean "not a full party" lines); companions; items/keys/stones.
    await cheat(page, "v")
    await cheat(page, "f")
    for (let i = 0; i < 3; i++) {
      await cheat(page, "j")
    }
    await cheat(page, "i")

    // Original debug shortcut on the world map: Alt-C -> Abyss final altar.
    await page.keyboard.down("Alt")
    await page.keyboard.press("c")
    await page.keyboard.up("Alt")
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(evidenceDir, "abyss-altar.png") })

    // Use the stone on the altar the way a player does: virtue of the level, then its stone.
    const altarVirtue = virtueNames[7] as string
    const altarStone = stoneNames[7] as string
    await pressKey(page, "u", 1200)
    await answer(page, "stone")
    await page.waitForTimeout(1500)
    await answer(page, altarVirtue)
    await page.waitForTimeout(1500)
    await answer(page, altarStone)

    // codexStart(): darkness, key, Word of Passage prompt.
    const darkness = codeKoreanOrUndefined(codexLiterals.darkness)
    note(`darkness line has a Korean translation: ${darkness !== undefined}`)
    if (darkness !== undefined) {
      note(`darkness line reached the panel in Korean: ${await waitForCount(page, head(darkness), 1, 20_000)}`)
    }
    await page.waitForTimeout(8000)
    await page.screenshot({ path: join(evidenceDir, "codex-entered.png") })
    await answer(page, wordOfPassage)
    await page.waitForTimeout(10_000)
    await dumpPanel(page, "codex-after-passage")

    const passage = codeKoreanOrUndefined(codexLiterals.passage)
    note(`passage-granted line has a Korean translation: ${passage !== undefined}`)

    // Virtue questions 0..7, with ONE deliberately wrong answer at question 0.
    const impure = codeKoreanOrUndefined(codexLiterals.impure)
    const question = (n: number): string => head(binaryKorean(`avatar.exe:virtueQuestions:${n}`))
    expect(await waitForCount(page, question(0), 1, 40_000), "virtue question 0 never reached the panel in Korean").toBe(true)
    const impureBefore = impure === undefined ? 0 : occurrences(await panelText(page), head(impure, 10))
    await answer(page, "zzz")
    // After a wrong answer the engine prints the rejection and the question
    // (codex.cpp's failure branch), then loops back to ask_next, which prints
    // "the voice asks" and the question a THIRD time before reading input.
    expect(await waitForCount(page, question(0), 3, 30_000), "the Korean question was not asked again after a wrong answer").toBe(true)
    await page.waitForTimeout(1500)
    const afterWrong = await panelText(page)
    const impureAfter = impure === undefined ? 0 : occurrences(afterWrong, head(impure, 10))
    writeFileSync(
      join(evidenceDir, "codex-wrong-answer.log"),
      [
        `rejection line has a Korean translation (ui.json): ${impure !== undefined}`,
        `rejection line occurrences before/after the wrong answer: ${impureBefore}/${impureAfter}`,
        `Korean question 0 occurrences after the wrong answer: ${occurrences(afterWrong, question(0))}`,
        `Hangul present in the post-answer panel: ${/\p{Script=Hangul}/u.test(afterWrong)}`
      ].join("\n") + "\n"
    )
    await page.screenshot({ path: join(evidenceDir, "codex-wrong-answer.png") })
    expect(impure, "the rejection line has no Korean translation in ui.json").toBeDefined()
    expect(impureAfter, "the Korean rejection line did not appear after the wrong answer").toBeGreaterThan(impureBefore)

    // Answer 0..7 correctly, then the three principles (questions 8, 9, 10).
    const answers = [...virtueNames, ...principleNames]
    for (let n = 0; n < 11; n++) {
      if (n > 0) {
        const shown = await waitForCount(page, question(n), 1, 40_000)
        if (!shown) await dumpPanel(page, `codex-fail-question-${n}`)
        expect(shown, `virtue question ${n} never reached the panel in Korean`).toBe(true)
        await page.waitForTimeout(1500)
      }
      note(`question ${n} shown in Korean: true`)
      await answer(page, answers[n] as string)
    }
    await page.screenshot({ path: join(evidenceDir, "codex-questions-done.png") })

    // The infinity question: the intro waits for any key, then asks.
    await page.waitForTimeout(6000)
    await pressKey(page, "Enter", 2500)
    await answer(page, finalAnswer)

    // The ending: ten waitAnyKey pages (endgameText1:0..6, endgameText2:0..3).
    const endingIds = [0, 1, 2, 3, 4, 5, 6].map((i) => `avatar.exe:endgameText1:${i}`).concat([0, 1, 2, 3].map((i) => `avatar.exe:endgameText2:${i}`))
    const endingSeen: string[] = []
    for (let page_ = 0; page_ < 14; page_++) {
      await page.waitForTimeout(3500)
      await pressKey(page, "Enter", 500)
      const panel = await panelText(page)
      for (const id of endingIds) {
        if (!endingSeen.includes(id) && panel.includes(head(binaryKorean(id), 10))) endingSeen.push(id)
      }
    }
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(evidenceDir, "codex-korean.png") })
    note(`ending ids seen in Korean (${endingSeen.length}/${endingIds.length}): ${endingSeen.join(",")}`)
    const finalPanel = await panelText(page)
    note(`Hangul present in the final panel: ${/\p{Script=Hangul}/u.test(finalPanel)}`)

    for (const id of endingIds) {
      expect(endingSeen, `${id} never reached the panel in Korean`).toContain(id)
    }
    expect(pageErrors, "the Codex hook must never surface an uncaught error").toEqual([])
  })
})
