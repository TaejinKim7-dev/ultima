import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 10: the persistence coordinator was wired into startEngine for the
// first time in Todo 21.2, but no test had ever driven a REAL save (one
// written by the real engine's own game logic, not a fake FS) through it
// end to end. This spec does: play through real character creation far
// enough to trigger the real `party.sav` write in
// vendor/xu4/src/intro.cpp's finishInitiateGame(), confirm the
// coordinator's real IDBFS sync (surfaced as "#save-status" text, wired
// in src/shell.ts), reload the page (a fresh wasm module instance, same
// as a real user closing and reopening the tab), and prove the save
// survived by loading it back with "Journey Onward" -- which only
// succeeds (and lands in the actual game world, not the menu) if
// `saveGameLoad()` found a real party.sav under the Todo 10 IDBFS mount.
//
// Timing note: vendor/xu4/src/intro.cpp's character creation flow can't
// be driven at a fixed cadence -- showStory()'s per-screen waitAnyKey()
// and startQuestions()'s per-round card-draw animation
// (EventHandler::wait_msecs(1000) x2 before its own waitAnyKey()) both
// silently swallow a keypress that arrives before the right controller
// is active. This was measured empirically (see handoff.md's Todo 10
// record): press-and-poll with generous, asymmetric delays, capped well
// above the nominal round count (7), rather than a fixed key sequence.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-10")

async function bootAndSelectZip(page: import("@playwright/test").Page, buffer: Buffer) {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await page.locator("#game-canvas").click()
}

async function pressKey(page: import("@playwright/test").Page, k: string, delayMs = 800) {
  await page.keyboard.press(k)
  await page.waitForTimeout(delayMs)
}

async function saveStatusText(page: import("@playwright/test").Page): Promise<string> {
  return page.locator("#save-status").innerText()
}

/** Drives real character creation far enough to trigger the real party.sav write. Returns once "#save-status" shows "저장 완료" (or the attempt budget runs out). */
async function createCharacterAndWaitForSave(page: import("@playwright/test").Page): Promise<boolean> {
  await page.waitForTimeout(2500) // let the intro reach INTRO_TITLES's input-ready state
  await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP (skipTitles())
  await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
  await pressKey(page, "i") // initiateNewGame(): name prompt

  for (const ch of "Avatar") {
    await page.keyboard.press(ch)
    await page.waitForTimeout(150)
  }
  await pressKey(page, "Enter") // submit name
  await pressKey(page, "m") // sex prompt

  // showStory(): 24 story screens, each gated by a plain waitAnyKey().
  for (let i = 0; i < 26; i++) {
    await pressKey(page, "Enter", 700)
    if ((await saveStatusText(page)).includes("완료")) return true
  }

  // startQuestions(): 7 virtue-question rounds, each gated by waitAnyKey()
  // (after ~2s of card-draw animation) then readChoice("ab"). Always
  // answering 'a' is fine -- the resulting class doesn't matter for this
  // test, only that a save gets written. Capped well above 7 rounds
  // because some (Enter, 'a') pairs land during the animation window and
  // are silently dropped rather than consumed by a round.
  for (let i = 0; i < 20; i++) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await saveStatusText(page)).includes("완료")) return true
  }
  return false
}

test.describe("Todo 10: IDBFS save persistence", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: a real new-game save survives a page reload and loads back into the game world", async ({
    page
  }) => {
    test.setTimeout(180_000) // real character creation is inherently slow to drive; see the module doc comment
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // Session 1: real character creation, real party.sav write, real IDBFS sync.
    await bootAndSelectZip(page, buffer)
    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "the real engine's own save-state bridge event never reported \"저장 완료\"").toBe(true)

    // Session 2: fresh page load -- a brand new wasm module instance with
    // no in-memory state carried over, exactly like a user reopening the
    // tab. Only IDBFS (not JS memory) can make this session know about
    // session 1's character.
    await bootAndSelectZip(page, buffer)
    const blackBaseline = await page.locator("#game-canvas").screenshot()
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    const menuShot = await page.locator("#game-canvas").screenshot()

    await pressKey(page, "j", 2000) // Journey Onward: saveGameLoad() reads the persisted party.sav
    const afterJourneyShot = await page.locator("#game-canvas").screenshot()

    writeFileSync(join(evidenceDir, "save-reload-after-journey.png"), afterJourneyShot)
    // A failed load falls through to something derived from the same
    // static menu background; a successful load renders the actual game
    // world instead (status panel, party name, moving avatar sprite) --
    // structurally different from the menu frame (not necessarily a
    // *larger* PNG: the world view is mostly flat tile colors, which
    // compress better than the menu's detailed title-logo artwork -- this
    // was measured, not assumed). Screenshot comparison, not in-page
    // WebGL reads, for the same reason as tests/e2e/boot-sequence.spec.ts.
    expect(afterJourneyShot.equals(menuShot)).toBe(false)
    expect(afterJourneyShot.length).toBeGreaterThan(blackBaseline.length)
  })

  test("export/import: the download is a real save archive, and re-importing it round-trips", async ({ page }) => {
    test.setTimeout(180_000) // real character creation is inherently slow to drive; see the module doc comment
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await bootAndSelectZip(page, buffer)
    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "the real engine's own save-state bridge event never reported \"저장 완료\"").toBe(true)

    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#save-export").click()])
    const exportPath = await download.path()
    const exported = readFileSync(exportPath)
    // persistence.ts's ARCHIVE_MAGIC -- a real packed save archive, not the
    // old placeholder JSON blob (`{"note": "placeholder export -- ..."}`).
    expect(exported.subarray(0, 4).toString("utf8")).toBe("U4SV")
    writeFileSync(join(evidenceDir, "export-reimport.dat"), exported)

    await page.locator("#save-import").setInputFiles(exportPath)
    await expect(page.locator("#save-status")).toHaveText("저장 완료", { timeout: 10_000 })
  })

  test("failure path: a real IndexedDB failure is reported as a recoverable error, never a false \"saved\"", async ({
    page
  }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // Genuinely remove IndexedDB from this page (not a fake FS -- the
    // real Emscripten IDBFS mount call fails for real), forcing
    // startEngine's syncfs(true) to reject.
    await page.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true })
    })

    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("false")
    expect(await page.locator("body").getAttribute("data-engine-start-reason")).toBe("idbfs-sync-failed")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    writeFileSync(
      join(evidenceDir, "idbfs-failure.log"),
      `IndexedDB removed from window before boot:\ndialogue panel:\n${dialogueText}\n`
    )
    expect(dialogueText).toContain("저장된 설정을 불러오지 못했습니다")
    // Never a false "saved": no save-state text should claim success.
    await expect(page.locator("#save-status")).not.toHaveText(/저장 완료/)
  })
})
