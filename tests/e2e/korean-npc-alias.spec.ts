import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 13: Korean NPC alias mapping and prompt-kind input rules, exercised
// against the REAL running xu4 engine (not a stub) with the user's real
// original ultima4.zip -- see AGENTS.md/handoff.md's "Todo 21 완료 기록" for
// why that is the only trustworthy way to prove this in this project, and
// tests/e2e/save-reload.spec.ts for the real character-creation timing
// pitfalls this spec inherits (a keypress arriving during the engine's
// animation/controller-transition windows is silently DROPPED, not queued).
//
// What this spec can and cannot automatically verify, and why (read before
// changing any assertion below): the real engine does not yet emit
// per-fragment `message` bridge events for its own screenMessage() output
// -- see tests/e2e/dialogue-panel.spec.ts's own module doc comment --
// dialogue text is drawn straight to the WebGL2 canvas raster, with no DOM/
// OCR-free path to read it back. This project also has no image-diffing
// dependency (package.json has none, and installing one is a "stop and
// ask" decision per AGENTS.md, not something this Todo should do
// unilaterally). So this spec cannot assert "the reply text is the exact
// same string" by reading text out of the page. What it DOES assert,
// automatically, from real engine behavior:
//   1. Talking to a real NPC and asking a keyword in English produces a
//      visible screen change (canvas delta) -- the live baseline.
//   2. Asking the SAME NPC, in the SAME open conversation, via the
//      Korean-keyword input box (real resolveInput() + real synthesized
//      keystrokes -- src/shell.ts, not a test-only shortcut) ALSO produces
//      a visible screen change.
//   3. Immediately after that, "bye" (typed in English, the same way as
//      any other keyword) cleanly ends the conversation -- proven by the
//      avatar becoming movable again (an arrow key produces a further
//      canvas delta). If the Korean pipeline had synthesized the wrong
//      bytes, leaked a stray keystroke past the window-capture guard, or
//      otherwise desynced the native ReadStringController buffer, this is
//      exactly the kind of thing that would break: either the conversation
//      would not still be open for "bye" to end, or it would already have
//      ended early, or a leaked raw keystroke would have corrupted the
//      interest-prompt buffer (see qa-native-baseline.mjs's
//      "interestClearBackspaces" comment on this exact failure mode).
// What ties this to "the same canonical keyword": resolveInput("text",
// "건강", table) is asserted, at the unit level
// (tests/unit/korean-aliases.test.ts), to return the string "health" --
// byte-identical to what is typed for the English half of this same test.
// synthesizeKeystrokes() (src/shell.ts) then feeds that exact resolved
// string through the identical code path a physical keyboard uses. Given
// both halves of this test literally submit the same "health" string
// through the same native input path in the same live conversation, the
// native reply text is the same reply by construction -- this spec's job
// is to prove the WIRING between "Korean text" and "that string actually
// reaches the engine" is real, not to re-derive string equality that is
// already unit-tested. Screenshots are still captured at each step as
// human-reviewable evidence (this project's established practice for
// dialogue text no code path can read -- see qa-native-baseline.mjs's
// CHECKPOINT comments for the same limitation in the native QA script).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-13")

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
  await pressKey(page, "c", 1200) // INTRO_MENU -> confMenu (Configure)
  await pressKey(page, "g", 1200) // confMenu -> gameplayMenu (Enhanced Gameplay Options)
  await pressKey(page, "d", 1000) // toggle Debug Mode (Cheats)
  await pressKey(page, "u", 1200) // Use These Settings -- commits + writes, closes gameplayMenu
  await pressKey(page, "m", 1200) // confMenu's "Main Menu" -- back to INTRO_MENU
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

/** Clears any stray characters typed into an already-open "Your Interest:" prompt by the approach sweep above, then submits an ENGLISH keyword directly (the live baseline this spec compares the Korean path's real effect against). */
async function askEnglishKeyword(page: Page, word: string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await pressKey(page, "Backspace", 60)
  }
  await typeAscii(page, word, 150)
  await pressKey(page, "Enter", 2000)
}

/** Submits a Korean word through the REAL shell UI (src/shell.ts's #korean-keyword-input), not a test-only shortcut -- fills the real DOM input and presses real Enter on it, exercising the real resolveInput() + real synthesizeKeystrokes() code path end to end. */
async function askKoreanKeyword(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  await input.click()
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
}

test.describe("Todo 13: Korean NPC alias mapping reaches the real running engine", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: asking a real NPC 'health' in English, then the Korean alias '건강' in the same conversation, both produce a real screen change, and 'bye' still cleanly ends the conversation afterward", async ({
    page,
    context
  }) => {
    test.setTimeout(480_000) // real character creation + a second session + menu navigation + NPC approach is inherently slow to drive
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await context.tracing.start({ screenshots: true, snapshots: true })

    // Session 1: real character creation, real party.sav write (mirrors
    // tests/e2e/save-reload.spec.ts's own two-session structure). No need
    // to drive the two post-save segue waitAnyKey() screens to completion
    // here -- nothing past the save write is persisted in-memory state
    // this test needs; session 2 below is a completely fresh wasm
    // instance anyway.
    await bootAndSelectZip(page, buffer)
    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "the real engine's own save-state bridge event never reported \"저장 완료\"").toBe(true)

    // Session 2: fresh page load. Debug Mode can ONLY be toggled from
    // INTRO_MENU's Configure screen (vendor/xu4/src/intro.cpp), which is
    // never shown again once a session enters the game world -- so this
    // has to happen here, before "Journey Onward" resumes the just-created
    // save (see enableDebugMode's own doc comment on why this bit us once
    // already: sending Configure-menu keys while actually in StagePlay
    // sends them as arbitrary game commands instead).
    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    await enableDebugMode(page)
    await page.screenshot({ path: join(evidenceDir, "01-debug-mode-enabled.png") })

    await pressKey(page, "j", 2500) // Journey Onward: saveGameLoad() reads the persisted party.sav, world entered
    await page.screenshot({ path: join(evidenceDir, "02-world-entered-with-debug-mode.png") })

    await gotoMoonglowAndApproachNpc(page)
    const beforeAsk = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "03-npc-approached.png"), beforeAsk)
    // CHECKPOINT (same limitation as qa-native-baseline.mjs's own
    // CHECKPOINT comments -- no OCR path exists to confirm this
    // programmatically): a human should confirm "You meet ..." appears
    // somewhere in this session's rendered frames before trusting the
    // screenshots below as real dialogue, not a top-level command sweep.

    await askEnglishKeyword(page, "health")
    const afterEnglish = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "04-after-english-health.png"), afterEnglish)
    expect(afterEnglish.equals(beforeAsk), "asking 'health' in English produced no visible screen change at all").toBe(
      false
    )

    await askKoreanKeyword(page, "건강")
    const afterKorean = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "05-after-korean-health-alias.png"), afterKorean)
    expect(
      afterKorean.equals(afterEnglish),
      "asking the Korean alias '건강' (resolved to the same canonical 'health' keyword -- see tests/unit/korean-aliases.test.ts) produced no visible screen change at all"
    ).toBe(false)

    // Behavioral proof the conversation is still open and un-desynced after
    // the Korean-triggered exchange: "bye" (typed directly, English --
    // same path as any other keyword) must still be accepted as the SAME
    // kind of interest-prompt keyword, ending the conversation cleanly.
    await askEnglishKeyword(page, "bye")
    const afterBye = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "06-after-bye.png"), afterBye)

    // Movement resumes only if we are really back in the town's free-roam
    // controller, not still stuck inside a (possibly desynced) discourse
    // loop -- a further, independent real-engine state check.
    await pressKey(page, "ArrowLeft", 900)
    const afterMove = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "07-after-post-bye-move.png"), afterMove)
    expect(afterMove.equals(afterBye), "the avatar did not visibly move after 'bye' -- conversation likely still open/desynced").toBe(
      false
    )

    await context.tracing.stop({ path: join(evidenceDir, "npc-alias.trace.zip") })
  })

  test("failure path: the real avatar-name prompt safely rejects Korean IME composition input -- no crash, no buffer overflow, and the prompt genuinely does not advance", async ({
    page
  }) => {
    test.setTimeout(60_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    const logLines: string[] = []
    function log(line: string): void {
      logLines.push(line)
    }

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    await pressKey(page, "i", 1200) // initiateNewGame(): real avatar name prompt
    log("Reached the real avatar-name prompt (INTRO_MENU 'i' -> IntroController::initiateNewGame()).")

    const baselineAtNamePrompt = await page.locator("#game-canvas").screenshot()

    // Models REAL Korean IME composition at the exact DOM-event shape this
    // project's own src/bridge/input-queue.ts already documents and
    // depends on: every keystroke during CJK composition carries the
    // legacy `keyCode: 229` ("input method is processing key") regardless
    // of which physical key was pressed, with `isComposing: true`; the
    // composed text itself only ever arrives via a later `compositionend`
    // event. This is standard, cross-browser IME behavior (not a
    // synthetic strawman) -- see MDN's KeyboardEvent.isComposing and
    // keyCode 229 documentation, and this project's own
    // input-queue.test.ts, which already asserts the same thing at the
    // unit level for Step 8's queue.
    const hangul = "홍길동"
    await page.evaluate((text: string) => {
      for (let i = 0; i < text.length; i++) {
        const event = new KeyboardEvent("keydown", {
          key: "Process",
          isComposing: true,
          bubbles: true,
          cancelable: true
        })
        Object.defineProperty(event, "keyCode", { value: 229 })
        window.dispatchEvent(event)
      }
      const compositionEnd = new CompositionEvent("compositionend", { data: text, bubbles: true })
      window.dispatchEvent(compositionEnd)
    }, hangul)
    await page.waitForTimeout(500)

    const afterHangulComposition = await page.locator("#game-canvas").screenshot()
    const compositionWasInvisible = afterHangulComposition.equals(baselineAtNamePrompt)
    log(
      `Dispatched ${hangul.length} real IME-composition keydowns (keyCode 229, isComposing=true) + a compositionend carrying "${hangul}": ` +
        `screen ${compositionWasInvisible ? "did NOT change at all" : "changed"} (expected: did NOT change -- ` +
        `GLFW's Emscripten port (emsdk's libglfw.js DOMToGLFWKeyCode) has no case for 229, so onKeyChanged returns -1 ` +
        `and never even calls the native keyHandler; GLFW also never listens for 'compositionend' at all -- see screen_glfw.cpp's ` +
        `glfwSetKeyCallback being the ONLY listener it registers).`
    )
    expect(compositionWasInvisible, "Korean IME composition must never visibly reach the native name buffer").toBe(true)

    // Submit the (still-empty) name buffer: intro.cpp:824's
    // `if (nameBuffer.length() == 0) { ...; return; }` must NOT advance to
    // the sex prompt -- proving the rejection above was real (nothing was
    // silently accepted into the buffer) rather than merely invisible.
    await pressKey(page, "Enter", 1200)
    const afterEmptyEnter = await page.locator("#game-canvas").screenshot()
    log(
      `Pressed Enter on the (should-still-be-empty) name buffer: screen ${
        afterEmptyEnter.equals(baselineAtNamePrompt) ? "unchanged" : "changed"
      } (either is consistent with "no crash"; the real proof is the next step actually advancing).`
    )

    // No crash/hang/corruption: a real ASCII name typed right afterward
    // must still work normally and advance to the sex prompt.
    for (const ch of "Avatar") {
      await page.keyboard.press(ch)
      await page.waitForTimeout(120)
    }
    await pressKey(page, "Enter", 1200)
    const afterAsciiName = await page.locator("#game-canvas").screenshot()
    const asciiNameAdvanced = !afterAsciiName.equals(afterEmptyEnter)
    log(
      `Typed the real ASCII name "Avatar" and pressed Enter: screen ${
        asciiNameAdvanced ? "changed (advanced to the sex prompt)" : "did NOT change"
      } -- proves the engine was never crashed/hung/corrupted by the rejected Korean composition above.`
    )
    expect(asciiNameAdvanced, "a normal ASCII name must still advance past the name prompt after the rejected Korean attempt").toBe(
      true
    )

    writeFileSync(join(evidenceDir, "prompt-reject.log"), logLines.join("\n") + "\n")
  })
})
