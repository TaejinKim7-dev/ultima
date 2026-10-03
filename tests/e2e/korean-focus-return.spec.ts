import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 35 (GOAL_GAP_AUDIT gap #1): after the Korean keyword input has been
// used, arrow/command keys must reach the game again WITHOUT the player
// clicking away. src/shell.ts's capture-phase guard swallows every key while
// #korean-keyword-input has DOM focus, and the older korean-npc-alias spec
// worked around that by blurring the input by hand after every submission.
// This spec removes that workaround: Korean "건강", then Korean "안녕" (bye)
// through the input only, then a real arrow key must move the avatar.
// The helper block below is duplicated from korean-npc-alias.spec.ts, the
// project's per-spec-file helper convention.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-35")

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

async function saveStatusText(page: Page): Promise<string> {
  return page.locator("#save-status").innerText()
}

/**
 * Drives real character creation far enough to trigger the real party.sav
 * write (mirrors tests/e2e/save-reload.spec.ts's own helper -- duplicated
 * rather than imported, matching this project's existing per-spec-file
 * helper convention; see e.g. tests/e2e/boot-sequence.spec.ts and
 * save-reload.spec.ts, neither of which shares helpers with the other).
 */
async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
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

  for (let i = 0; i < 26; i++) {
    await pressKey(page, "Enter", 700)
    if ((await saveStatusText(page)).includes("완료")) return true
  }

  for (let i = 0; i < 20; i++) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await saveStatusText(page)).includes("완료")) return true
  }
  return false
}

/**
 * Enables Debug Mode (Cheats) through the REAL Configure menu -- never a
 * test hook (Todo 18 audits for those). Sequence read from
 * vendor/xu4/src/intro.cpp: INTRO_MENU's 'c' opens confMenu; confMenu's 'g'
 * opens gameplayMenu (MI_CONF_GAMEPLAY, visible whenever
 * settingsChanged.enhancements is set, which DEFAULT_ENHANCEMENTS makes
 * true out of the box -- settings.h); gameplayMenu's 'd' toggles the
 * "Debug Mode (Cheats)" BoolMenuItem; 'u' (USE_SETTINGS) commits it into
 * xu4.settings and writes it to disk (updateGameplayMenu's USE_SETTINGS
 * case), closing gameplayMenu; confMenu's CANCEL entry ("Main Menu",
 * shortcut 'm') returns to INTRO_MENU.
 *
 * This path used to reliably abort the WASM runtime with
 * `Aborted(RuntimeError: unreachable)` -- see tests/e2e/configure-menu-no-
 * abort.spec.ts and handoff.md's "wasm 입력 이벤트 재진입 버그" section for
 * the root cause (GLFW's web callbacks re-entering the engine while an
 * Asyncify sleep was already pending) and the fix
 * (vendor/xu4/src/screen_glfw.cpp's input queue). Fixed on `main`; this
 * spec exercises the real path again both as the more faithful test and as
 * further regression coverage for that fix.
 *
 * IMPORTANT: this only makes sense while genuinely AT INTRO_MENU. Right
 * after createCharacterAndWaitForSave() detects "저장 완료",
 * IntroController::finishInitiateGame() is still mid-flight -- it shows
 * TWO more segue screens (each its own plain waitAnyKey(), see
 * intro.cpp's tail) before `xu4.stage` ever becomes StagePlay, and
 * INTRO_MENU is never shown again once the game world starts. Sending
 * Configure-menu keys at that point lands them as arbitrary StagePlay
 * game commands instead (this was tried and it froze the tab -- almost
 * certainly some other, unrelated blocking code path in a rarely-exercised
 * in-game command, not anything Todo 13 needs to fix). The safe, correct
 * place to enable debug mode is a FRESH session that has not started the
 * game yet, exactly like tests/e2e/save-reload.spec.ts's own "Session 2"
 * pattern: reload the page, reach INTRO_MENU (Enter, Enter), enable debug
 * mode there, THEN "Journey Onward" ('j') to resume the just-created save
 * into the game world with debug mode already active for that session.
 */
async function enableDebugMode(page: Page): Promise<void> {
  // Generous 2000ms+ settles (mirroring save-reload.spec.ts's own
  // press-and-poll budgets): a Configure-menu keypress arriving during
  // the engine's animation/controller-transition windows is silently
  // DROPPED, and every later key then misroutes into the wrong menu --
  // the previous revision's 1200ms cadence froze the tab exactly this
  // way (keyboard.press hung on the final 'm' with the renderer dead).
  await pressKey(page, "c", 2000) // INTRO_MENU -> confMenu (Configure)
  await pressKey(page, "g", 2000) // confMenu -> gameplayMenu (Enhanced Gameplay Options)
  await pressKey(page, "d", 2000) // toggle Debug Mode (Cheats)
  await pressKey(page, "u", 2000) // Use These Settings -- commits + writes, closes gameplayMenu
  await pressKey(page, "m", 2500) // confMenu's "Main Menu" -- back to INTRO_MENU
}

/**
 * Teleports to Moonglow via the debug cheat menu's Goto (deterministic --
 * see vendor/xu4/src/cheat.cpp's 'g' case), then walks in and does the
 * exact NPC-approach sweep scripts/qa-native-baseline.mjs proved reliably
 * meets the mage "Calabrini" (real, human-reviewed evidence recorded in
 * handoff.md's "Todo 3 E2E 보강" -- east one step, then attempt `t`+each of
 * 4 directions per step, repeated).
 */
async function gotoMoonglowAndApproachNpc(page: Page): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(1000)
  await pressKey(page, "g", 1000) // Goto
  await typeAscii(page, "moonglow", 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2000) // Enter towne! Moonglow

  const npcTalkDirs = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"]
  for (let i = 0; i < 6; i++) {
    await pressKey(page, "ArrowRight", 900)
    for (const talkDir of npcTalkDirs) {
      await pressKey(page, "t", 400)
      await pressKey(page, talkDir, 900)
    }
  }
}

/** Submits a Korean word through the real #korean-keyword-input and does NOT blur it: leaving focus to the shell is exactly what Todo 35 proves. */
async function submitKorean(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  if ((await page.evaluate(() => document.activeElement?.id)) !== "korean-keyword-input") {
    await input.click()
  }
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
}

async function openConversation(page: Page, buffer: Buffer): Promise<void> {
  await bootAndSelectZip(page, buffer)
  expect(await createCharacterAndWaitForSave(page), 'engine never reported "저장 완료"').toBe(true)
  await bootAndSelectZip(page, buffer)
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter")
  await pressKey(page, "Enter")
  await enableDebugMode(page)
  await pressKey(page, "j", 2500)
  await gotoMoonglowAndApproachNpc(page)
  for (let i = 0; i < 16; i++) {
    await pressKey(page, "Backspace", 60)
  }
}

test.describe("Todo 35: keyboard control returns to the game after Korean input", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("after the Korean 'bye' ends the conversation, focus leaves the input by itself and an arrow key moves the avatar", async ({
    page
  }) => {
    test.setTimeout(480_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    await openConversation(page, readFileSync(zipPath!))

    await submitKorean(page, "건강")
    // Same talk, next keyword: focus must still be in the input (a close that
    // reopens within the delay must not steal it).
    expect(await page.evaluate(() => document.activeElement?.id), "focus was taken away between keywords of one conversation").toBe(
      "korean-keyword-input"
    )
    await submitKorean(page, "안녕") // ends the conversation
    await page.waitForTimeout(1500) // > FOCUS_RETURN_DELAY_MS
    expect(
      await page.evaluate(() => document.activeElement?.id ?? ""),
      "focus stayed in #korean-keyword-input after the conversation ended"
    ).not.toBe("korean-keyword-input")

    const before = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "focus-return-before-move.png"), before)
    await pressKey(page, "ArrowLeft", 900)
    const after = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "focus-return.png"), after)
    expect(after.equals(before), "the avatar did not move: arrow key was swallowed after Korean input").toBe(false)
  })
})
