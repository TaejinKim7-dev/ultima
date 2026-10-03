import { expect, test, type Page } from "./fixtures.ts"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { hashText } from "../../src/i18n/coverage.ts"
import { GENERATED_UI_TEMPLATES } from "../../src/i18n/generated/strings.ts"

// Todo 23: in-game C++ screenMessage() output shown in Korean in the HTML
// dialogue panel, driven against the REAL running engine with the user's
// real ultima4.zip.
//
// Expected Korean text is this project's own translation data
// (locales/ko/ui.json), looked up by the ids i18n:inventory assigns to the
// two literals this spec provokes:
//   - `screenMessage("Pass\n")` (vendor/xu4/src/game.cpp, the Space
//     command) -> ui:game:15
//   - `screenMessage("Enter %s!\n\n", city->cityTypeStr())`
//     (vendor/xu4/src/portal.cpp, entering a town) -> ui:portal:1
// Real-game helpers are duplicated from tests/e2e/korean-npc-output.spec.ts
// per this project's per-spec helper convention.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-23")
const task40Dir = join(repoRoot, ".omo/evidence/ultima-web/task-40")
const PASS_ID = "ui:game:15"
const ENTER_TOWN_ID = "ui:portal:1"

const uiEntries = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/ui.json"), "utf8")) as {
    entries: Record<string, { translation: string }>
  }
).entries

// Todo 40: the entry line is "<Korean city type> + the Korean template" and the
// centred name line is the maps.b name's own Korean row. Both lookups are by
// sourceHash (sha256 of the engine's literal), so no English is restated here.
const sha = (text: string): string => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`
const moduleEntries = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/module.json"), "utf8")) as {
    entries: Record<string, { sourceHash: string; translation: string; status: string }>
  }
).entries
const glossaryEntries = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/glossary.json"), "utf8")) as {
    entries: Record<string, { sourceHash: string; translation: string }>
  }
).entries
const TOWN_NAME = "Moonglow" // maps.b: city (name: "Moonglow" type: towne ...)
const TOWN_TYPE = "towne"
const SPELL_NOMIX_ID = "ui:spell:2" // spellErrorMsgs[CASTERR_NOMIX]

function koreanTownName(): string {
  const row = Object.values(moduleEntries).find((entry) => entry.sourceHash === sha(TOWN_NAME) && entry.status === "ready")
  if (row === undefined) throw new Error("fixture: no ready Korean module row for the town name")
  return row.translation
}

function koreanTownType(): string {
  const row = glossaryEntries[`city-type-${TOWN_TYPE}`]
  if (row === undefined || row.sourceHash !== sha(TOWN_TYPE)) throw new Error("fixture: no Korean glossary row for the city type")
  return row.translation
}

function korean(id: string): string {
  const entry = uiEntries[id]
  if (entry === undefined || entry.translation.trim() === "") {
    throw new Error(`fixture: no Korean translation for ${id}`)
  }
  return entry.translation
}

// The panel renders each native line as its own <p>, so compare with all
// whitespace removed.
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

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}

test.describe("Todo 23: in-game screen messages shown in Korean in the dialogue panel", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: Space (Pass) and entering Moonglow (Enter %s!) show their Korean lines in #dialogue-history", async ({
    page
  }) => {
    test.setTimeout(420_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)
    // Every unmapped screenMessage() the engine makes (key echoes, castle/codex
    // lines, ...) must be dropped silently: no uncaught page error.
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await bootAndSelectZip(page, buffer)
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 2500) // Journey Onward

    const pass = squash(korean(PASS_ID))
    const beforePass = await panelText(page)
    await pressKey(page, "Space", 1500) // game.cpp: screenMessage("Pass\n")
    await pressKey(page, "Space", 1500)
    const afterPass = await panelText(page)

    // Real cheat-menu Goto Moonglow, then enter the towne (portal.cpp "Enter %s!").
    await page.keyboard.down("Control")
    await page.keyboard.press("c")
    await page.keyboard.up("Control")
    await page.waitForTimeout(1000)
    await pressKey(page, "g", 1000)
    await typeAscii(page, "moonglow", 100)
    await pressKey(page, "Enter", 1500)
    await pressKey(page, "e", 2500)
    const afterEnter = await panelText(page)
    await page.screenshot({ path: join(evidenceDir, "pass-and-enter.png") })
    mkdirSync(task40Dir, { recursive: true })
    await page.screenshot({ path: join(task40Dir, "entry-korean.png") })
    // Todo 40: the whole entry line (template with the Korean city type) and the centred town name.
    const entryLine = squash(korean(ENTER_TOWN_ID).replace("%s", koreanTownType()))
    const nameLine = squash(koreanTownName())
    const coverage = await page.evaluate(() => window.ultimaI18nCoverage?.snapshot() ?? null)
    writeFileSync(join(task40Dir, "coverage-after-enter.json"), `${JSON.stringify(coverage)}\n`)

    // Todo 40: a real spell-error line. A new character has mixed nothing, so casting
    // (c, player 1, spell a) must print the "none mixed" error: spellErrorMsgs[] -> Korean.
    await pressKey(page, "c", 1500)
    await pressKey(page, "1", 1500)
    await pressKey(page, "a", 2000)
    const afterCast = await panelText(page)
    await page.screenshot({ path: join(task40Dir, "spell-error-korean.png") })
    const coverageAfterCast = await page.evaluate(() => window.ultimaI18nCoverage?.snapshot() ?? null)
    writeFileSync(join(task40Dir, "coverage-after-cast.json"), `${JSON.stringify(coverageAfterCast)}\n`)
    // The hashes that map to the spell error's ui id (looked up in the generated table, not typed).
    const nomixHashes = Object.entries(GENERATED_UI_TEMPLATES)
      .filter(([, id]) => id === SPELL_NOMIX_ID)
      .map(([hash]) => hash)

    // The Korean template with its %s (city type, a Boron symbol with no
    // translation id) removed: what must appear around the argument.
    const enterTemplate = squash(korean(ENTER_TOWN_ID))
    const [enterBefore = "", enterAfter = ""] = enterTemplate.split("%s")
    writeFileSync(
      join(evidenceDir, "panel-observation.log"),
      [
        `pass (${PASS_ID}) occurrences: before=${occurrences(beforePass, pass)} after two Space presses=${occurrences(afterPass, pass)}`,
        `enter (${ENTER_TOWN_ID}) Korean suffix "${enterAfter}" present after entering Moonglow: ${afterEnter.includes(enterAfter)}`,
        `panel has Hangul: ${/\p{Script=Hangul}/u.test(afterEnter)}`,
        `panel chars after enter: ${afterEnter.length}`
      ].join("\n") + "\n"
    )

    expect(occurrences(afterPass, pass), "two Space presses did not add two Korean Pass lines").toBe(
      occurrences(beforePass, pass) + 2
    )
    expect(enterBefore, "fixture: ui:portal:1 must start with its %s argument").toBe("")
    expect(afterEnter, "entering Moonglow never showed the Korean Enter %s! line").toContain(enterAfter)
    // Todo 40: gap #6 -- the Korean city type inside the line, the centred Korean name right after it,
    // and no engine English between them (one contiguous run, so no ASCII letter can sit inside it).
    expect(afterEnter, "the entry line + Korean town name must be one contiguous run").toContain(entryLine + nameLine)
    // Everything the panel gained after the last Pass line (the goto and entry region) holds no
    // ASCII-letter run: a single letter is the "h = help" command hint, an engine word would be 2+.
    const entryRegion = afterEnter.slice(afterEnter.lastIndexOf(pass) + pass.length)
    expect(entryRegion, "panel region after the last Pass line is empty").not.toBe("")
    expect(entryRegion, "an engine ASCII word reached the entry region of the panel").not.toMatch(/[A-Za-z]{2,}/)
    expect(coverage, "Module.u4Text coverage snapshot missing").not.toBeNull()
    const entryPassthrough = (coverage?.["arg-passthrough"] ?? []).filter((row) => row.key.startsWith(`${ENTER_TOWN_ID}|`))
    expect(entryPassthrough, "the entry line's %s still received a raw engine word").toEqual([])
    const unmapped = new Set((coverage?.["ui-unmapped"] ?? []).map((row) => row.key))
    expect(unmapped.has(hashText(TOWN_NAME)), "the centred town name has no Korean path (ui-unmapped)").toBe(false)
    // Spell error (observed in a real session, see the evidence screenshot).
    expect(nomixHashes, "fixture: the none-mixed error has no screenMessage hash in GENERATED_UI_TEMPLATES").toHaveLength(1)
    expect((coverageAfterCast?.["ui-unmapped"] ?? []).some((row) => nomixHashes.includes(row.key)), "the spell error hash is ui-unmapped").toBe(false)
    expect(afterCast, "casting with no mixtures never showed the Korean spell error").toContain(squash(korean(SPELL_NOMIX_ID)))
    expect(pageErrors, "the screenMessage hook must never surface an uncaught error").toEqual([])
  })
})
