import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Stage 3 Lane B (Todo 49 Phase B): the in-game Korean message-area overlay,
// driven against the REAL running engine with the user's real ultima4.zip.
//
// The overlay is an always-on opaque DOM box (`#game-viewport
// [data-role="messagearea"]`, NOT inside `#overlay-layer`) over the native
// TEXT_AREA rect. It mirrors the right-hand panel's Korean lines, echoes the
// typed keyword / accepted choice key, shows the blinking caret, hides on
// ESC/pause modals and when the `#toggle-screen-ko` switch is off, and pages
// long Lord British answers with a "▼" cue (Step 11).
//
// Evidence screenshots are captured at each step, like the other real-engine
// specs; text assertions read the overlay's own DOM (the only readable
// Korean copy of the message area -- the canvas raster stays English under
// the opaque box).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-49b")

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

async function cheat(page: Page, key: string): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(800)
  await pressKey(page, key, 800)
}

async function gotoAndEnter(page: Page, place: string): Promise<void> {
  await cheat(page, "g")
  await typeAscii(page, place, 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2500)
}

/** The exact NPC-approach sweep korean-npc-alias.spec.ts proved reliable. */
async function approachNpc(page: Page): Promise<void> {
  const npcTalkDirs = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"]
  for (let i = 0; i < 6; i++) {
    await pressKey(page, "ArrowRight", 900)
    for (const talkDir of npcTalkDirs) {
      await pressKey(page, "t", 400)
      await pressKey(page, talkDir, 900)
    }
  }
}

async function submitKorean(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  await input.click()
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
  await input.blur()
}

/** The overlay box (inside #game-viewport, never inside #overlay-layer). */
function overlayBox(page: Page) {
  return page.locator('#game-viewport [data-role="messagearea"]')
}

async function overlayText(page: Page): Promise<string> {
  const box = overlayBox(page)
  if ((await box.count()) === 0) return ""
  return squash(await box.innerText().catch(() => ""))
}

async function overlayVisible(page: Page): Promise<boolean> {
  const box = overlayBox(page)
  if ((await box.count()) === 0) return false
  return box.isVisible().catch(() => false)
}

test.describe("Stage 3: in-game Korean message-area overlay", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("intro hides the overlay; Journey Onward shows the help line + prompt glyph; the box stays put while walking; ESC pause and the toggle restore the English canvas", async ({
    page
  }) => {
    test.setTimeout(600_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await bootAndSelectZip(page, buffer)

    // Session 1: real character creation (the party.sav "Journey Onward"
    // in session 2 loads). The overlay must stay hidden through the whole
    // intro / menu flow -- play has not begun.
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    expect(await overlayVisible(page), "the message-area overlay must be hidden during the intro").toBe(false)
    await page.screenshot({ path: join(evidenceDir, "01-intro-hidden.png") })
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)

    // Session 2: fresh load with Debug Mode (exactly like save-reload.spec.ts).
    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    expect(await overlayVisible(page), "the message-area overlay must be hidden at the INTRO_MENU too").toBe(false)
    await enableDebugMode(page)
    await pressKey(page, "j", 3000) // Journey Onward -- play begins

    // Scenario 2: "도움말은 Alt-h" (ui:game:0), the prompt glyph and the
    // caret appear in the overlay as soon as the world is entered.
    await expect(overlayBox(page)).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toContain("도움말은Alt-h")
    await expect(overlayBox(page).locator(".ma-cursor")).toBeVisible({ timeout: 15_000 })
    await expect(overlayBox(page)).toContainText("▶", { timeout: 10_000 })
    await page.screenshot({ path: join(evidenceDir, "02-world-entered.png") })

    // Scenario 3: walking keeps the box geometry stable across frames
    // (the canvas shakes, the overlay must not) -- capture 5 frames with an
    // arrow press between them, assert left/top stay within 1px.
    const positions: { left: number; top: number }[] = []
    for (let frame = 0; frame < 5; frame += 1) {
      const box = await overlayBox(page).boundingBox()
      expect(box, `overlay box missing on frame ${frame}`).not.toBeNull()
      positions.push({ left: box!.x, top: box!.y })
      if (frame < 4) await pressKey(page, "ArrowRight", 700)
    }
    const firstLeft = positions[0]!.left
    const firstTop = positions[0]!.top
    for (let i = 1; i < positions.length; i += 1) {
      expect(Math.abs(positions[i]!.left - firstLeft), `overlay left drifted on frame ${i}`).toBeLessThanOrEqual(1)
      expect(Math.abs(positions[i]!.top - firstTop), `overlay top drifted on frame ${i}`).toBeLessThanOrEqual(1)
    }
    expect(await overlayText(page), "the overlay must be non-empty while walking").not.toBe("")

    // Scenario 6/7: ESC opens the pause modal -- the whole overlay layer and
    // the message area hide; ESC again restores them.
    await pressKey(page, "Escape", 1500)
    expect(await overlayVisible(page), "the message-area overlay must hide on the pause modal").toBe(false)
    expect(
      await page.locator("#overlay-layer").isHidden(),
      "#overlay-layer must hide entirely on the pause modal (user decision 2026-10-04)"
    ).toBe(true)
    await page.screenshot({ path: join(evidenceDir, "03-pause-modal-hidden.png") })
    await pressKey(page, "Escape", 1500)
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })

    // Scenario 9: the switch off hides the overlay and restores the English
    // canvas; on brings the Korean overlay back.
    await page.locator("#toggle-screen-ko").click()
    await page.waitForTimeout(500)
    expect(await overlayVisible(page), "the switch off must hide the message-area overlay").toBe(false)
    expect(await page.locator("#toggle-screen-ko").isChecked()).toBe(false)
    await page.screenshot({ path: join(evidenceDir, "04-toggle-off-english.png") })
    await page.locator("#toggle-screen-ko").click()
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: join(evidenceDir, "05-toggle-on-korean.png") })
  })

  test("Moonglow NPC conversation: direction line, live typed-keyword echo with caret, Korean reply, Korean alias '직업' shown in Korean", async ({
    page
  }) => {
    test.setTimeout(600_000)
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
    await pressKey(page, "j", 2500)

    await gotoAndEnter(page, "moonglow")
    await approachNpc(page)
    for (let i = 0; i < 16; i++) {
      await pressKey(page, "Backspace", 60) // clear the interest-prompt buffer the sweep left behind
    }

    await expect(page.locator("#talk-keywords")).toBeVisible({ timeout: 10_000 })
    const npcKey = await page.locator("#talk-keywords").getAttribute("data-npc")
    expect(npcKey, "#talk-keywords must carry data-npc for an NPC conversation").toBeTruthy()

    // The sweep's "대화: <direction>" lines are committed in the message area.
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toContain("대화:")
    await page.screenshot({ path: join(evidenceDir, "06-npc-approached.png") })

    // Scenario 4a: typing "job" live -- the overlay echoes each char with the
    // caret after it (screenReceiver.input + cursor), long before Enter.
    for (const ch of "job") {
      await page.keyboard.press(ch)
      await page.waitForTimeout(250)
    }
    await expect
      .poll(async () => overlayText(page), { timeout: 10_000 })
      .toContain("job")
    await expect(overlayBox(page).locator(".ma-cursor")).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: join(evidenceDir, "07-typing-job.png") })
    await pressKey(page, "Enter", 2500) // submit "job" in English

    // The NPC's Korean job reply appears in the overlay.
    const tlkEntries = (
      JSON.parse(readFileSync(join(repoRoot, "locales/ko/tlk.json"), "utf8")) as {
        entries: Record<string, { translation: string }>
      }
    ).entries
    const jobHead = squash(tlkEntries[`${npcKey}:job`]?.translation ?? "").slice(0, 10)
    expect(jobHead, "fixture: the NPC has no job reply").not.toBe("")
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toContain(jobHead)
    await page.screenshot({ path: join(evidenceDir, "08-korean-job-reply.png") })

    // Unblock any ask-pause the job answer triggered, then answer the question.
    await pressKey(page, "Backspace", 1200)
    const answerChip = page.locator('#talk-keywords button.talk-keyword-chip[data-label="예"]')
    if (await answerChip.isVisible().catch(() => false)) {
      await answerChip.click()
      await page.waitForTimeout(2000)
    }

    // Scenario 4b (Step 9): a Korean alias submission shows the KOREAN
    // keyword ("직업") in the overlay -- not the English "job" the native
    // prompt echoes back.
    await submitKorean(page, "직업")
    await expect
      .poll(async () => overlayText(page), { timeout: 15_000 })
      .toContain("직업")
    await page.screenshot({ path: join(evidenceDir, "09-korean-alias-displayed.png") })
    const afterKoreanAlias = await overlayText(page)

    // The conversation is still healthy: 안녕 (bye) ends it and the avatar
    // moves again.
    await submitKorean(page, "안녕")
    await page.waitForTimeout(1500)
    await expect(page.locator("#talk-keywords")).toBeHidden()
    const beforeMove = await page.locator("#game-canvas").screenshot()
    await pressKey(page, "ArrowLeft", 900)
    const afterMove = await page.locator("#game-canvas").screenshot()
    expect(afterMove.equals(beforeMove), "the avatar did not move after the Korean bye").toBe(false)
    writeFileSync(
      join(evidenceDir, "moonglow-observation.log"),
      [`overlay after Korean alias submission: ${afterKoreanAlias}`].join("\n") + "\n"
    )
  })

  test("Lord British's long answer pages with the ▼ cue (Step 11)", async ({ page }) => {
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
    await pressKey(page, "j", 2500)

    await gotoAndEnter(page, "britannia")
    await cheat(page, "c") // collision off

    // Floor 2 stairs -> Lord British at (19,7) (see talk-keywords.spec.ts).
    await cheat(page, "g")
    await typeAscii(page, "britannia", 100)
    await pressKey(page, "Enter", 1500)
    await pressKey(page, "k", 2500)
    for (let i = 0; i < 15; i++) await pressKey(page, "ArrowRight", 350)
    for (let i = 0; i < 4; i++) await pressKey(page, "ArrowDown", 350)
    await pressKey(page, "t", 500)
    await pressKey(page, "ArrowRight", 2500)

    // First meeting: ":17" blocks briefly, ":18" ("새 시대") blocks on a
    // waitAnyKey. Pass it, and the champion line + interest prompt follow.
    await expect
      .poll(async () => overlayText(page), { timeout: 30_000 })
      .toContain("새시대")
    await pressKey(page, "Enter", 2500) // pass :18's waitAnyKey -> :19 + prompt
    await expect(page.locator("#talk-keywords")).toBeVisible({ timeout: 15_000 })
    await expect(page.locator("#talk-keywords")).toHaveAttribute("data-speaker", "lordBritish")

    // "브리타니아" (britannia) -> lordBritishText:17, a long answer (~26 wrapped
    // rows) whose native text paragraphs chunk with a real waitAnyKey between
    // them -- the overlay enters page mode and draws the ▼ page cue, which
    // stays up for the native chunk pause.
    await submitKorean(page, "브리타니아") // alias for britannia (locales/ko/aliases.json)
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })
    // Diagnostic dump (observability log, never a pass/fail input).
    const diag = await page.evaluate(() => {
      const box = document.querySelector('#game-viewport [data-role="messagearea"]')
      const panel = document.querySelector("#dialogue-panel")
      return {
        boxHidden: box?.hasAttribute("hidden") ?? null,
        boxText: box?.textContent?.replace(/\s+/g, "").slice(-160) ?? null,
        cueHidden: box?.querySelector(".messagearea-cue")?.hasAttribute("hidden") ?? null,
        panelPaused: panel?.getAttribute("data-paused") ?? null,
        panelTail: (document.querySelector("#dialogue-history") as HTMLElement | null)?.innerText
          .split("\n")
          .filter((l) => l.trim() !== "")
          .slice(-10)
          .join("|")
      }
    })
    writeFileSync(join(evidenceDir, "lb-diag.json"), `${JSON.stringify(diag, null, 2)}\n`)
    const cue = overlayBox(page).locator(".messagearea-cue")
    await expect(cue).toBeVisible({ timeout: 20_000 })
    expect(await cue.textContent()).toContain("▼")
    const pageOne = await overlayText(page)
    await page.screenshot({ path: join(evidenceDir, "10-lb-page-cue.png") })

    // A key advances one page: the cue disappears on the last page and the
    // first row changes to the answer's continuation (or the conversation
    // moves on -- either way the frozen first page is gone).
    await pressKey(page, "Enter", 2500)
    await expect(cue).toBeHidden({ timeout: 15_000 })
    const pageTwo = await overlayText(page)
    await page.screenshot({ path: join(evidenceDir, "11-lb-after-page-turn.png") })
    expect(pageTwo, "the page turn must change the overlay content").not.toEqual(pageOne)
    expect(
      pageOne.length >= 12 * 2 && pageTwo.length > 0,
      "the paused answer must have filled a full page before the turn"
    ).toBe(true)
  })

  test("battle messages keep the overlay normal and the load progress bar stays visible above the modal-hidden overlay", async ({
    page
  }) => {
    test.setTimeout(600_000)
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
    await pressKey(page, "j", 2500)
    await expect(overlayBox(page)).toBeVisible({ timeout: 15_000 })

    // Scenario 5: summon a creature near the party and step around -- every
    // frame the overlay box must stay visible, opaque and non-empty while the
    // engine prints battle/encounter messages (Korean). Combat is RNG-bearing,
    // so the assertion is about the overlay's integrity, not a specific
    // monster: it must never flicker or go stale during the encounter route.
    await cheat(page, "s") // Summon
    await typeAscii(page, "1", 120) // creature id 1
    await pressKey(page, "Enter", 1500)
    for (let step = 0; step < 4; step += 1) {
      await pressKey(page, "ArrowRight", 800)
      expect(await overlayVisible(page), `overlay hidden during step ${step}`).toBe(true)
      expect(await overlayText(page), `overlay empty during step ${step}`).not.toBe("")
    }
    await page.screenshot({ path: join(evidenceDir, "12-after-summon-steps.png") })

    // Scenario 8: the in-game menu (game browser) is a top-menu modal -- the
    // message area and #overlay-layer hide, so the canvas-drawn load progress
    // bar is visible above the DOM. Opening the browser and back proves the
    // overlay returns unharmed.
    await pressKey(page, "Escape", 1500) // pause menu -> game browser
    expect(await overlayVisible(page), "the game-browser modal must hide the message-area overlay").toBe(false)
    expect(await page.locator("#overlay-layer").isHidden()).toBe(true)
    await page.screenshot({ path: join(evidenceDir, "13-menu-modal-hidden.png") })
    await pressKey(page, "Escape", 1500) // leave the menu
    await expect(overlayBox(page)).toBeVisible({ timeout: 10_000 })
    expect(await overlayText(page), "the overlay must be non-empty after leaving the menu").not.toBe("")
    await page.screenshot({ path: join(evidenceDir, "14-after-menu-return.png") })
  })
})