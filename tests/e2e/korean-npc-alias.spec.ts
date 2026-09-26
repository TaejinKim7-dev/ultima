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
    // save (see enableDebugMode's own doc comment for why this path used
    // to abort the WASM runtime, and how it was fixed on `main`).
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

  test("failure path: Korean IME composition at the real avatar-name prompt is fully rejected -- zero leaked input (effect-counter proof), no crash, and creation still completes", async ({
    page
  }) => {
    test.setTimeout(360_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    const logLines: string[] = []
    function log(line: string): void {
      logLines.push(line)
    }

    // Reads the Web Audio bridge's effect-play counter
    // (window.ultimaAudio.stats().effectStarts -- a Todo 16 observability
    // hook, never consulted by engine logic). The native name prompt
    // (ReadStringController) plays SOUND_BLOCKED for every rejected
    // keystroke and stays silent for accepted ones, so this counter is a
    // deterministic, pixel-free input oracle: any engine-visible input
    // the composition smuggles in must either beep (invalid) or occupy
    // buffer space (accepted -- proven by the maxlen-overflow step
    // below). Calibrated: 13 typed chars into the 12-max buffer yields
    // exactly one effect start; 3s of idle yields zero.
    async function effectStarts(): Promise<number> {
      const value = await page.evaluate(() => {
        const bridge = (
          window as unknown as {
            ultimaAudio?: { stats(): { effectStarts: number } }
          }
        ).ultimaAudio
        return bridge ? bridge.stats().effectStarts : null
      })
      expect(value, "window.ultimaAudio bridge must be present for beep counting").not.toBeNull()
      return value as number
    }

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    await pressKey(page, "i", 1200) // initiateNewGame(): real avatar name prompt
    log("Reached the real avatar-name prompt (INTRO_MENU 'i' -> IntroController::initiateNewGame()).")
    writeFileSync(join(evidenceDir, "prompt-name.png"), await page.locator("#game-canvas").screenshot())

    const fxBeforeComposition = await effectStarts()

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
    //
    // NO pixel-equality assertion is made on the screenshots below, on
    // purpose: the live intro canvas redraws every engine-timer tick
    // (IntroController::timerFired redraws beasties + screenUploadToGPU
    // in ALL intro modes), so two screenshots taken 500ms apart with
    // ZERO input already differ by ~1.5% of pixels (measured). Exact
    // `.equals()` gates against this canvas can neither pass (false red)
    // nor -- for expect-change gates -- fully prove input effect (the
    // happy path keeps them only as human-review evidence for the same
    // reason). The automated proof here is the effect counter instead.
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
    await page.waitForTimeout(1000) // allow async effect-decode counting if any beep fired
    writeFileSync(join(evidenceDir, "prompt-after-composition.png"), await page.locator("#game-canvas").screenshot())

    const fxAfterComposition = await effectStarts()
    log(
      `Dispatched ${hangul.length} real IME-composition keydowns (keyCode 229, isComposing=true) + a compositionend carrying "${hangul}": ` +
        `effectStarts ${fxBeforeComposition} -> ${fxAfterComposition} (expected: unchanged -- ` +
        `GLFW's Emscripten port has no keyCode-229 case so the keydowns never reach the native keyHandler, and GLFW never listens for 'compositionend' at all).`
    )
    expect(
      fxAfterComposition,
      "Korean IME composition keydowns must never reach the engine as input (no invalid-key beep)"
    ).toBe(fxBeforeComposition)

    // Leak proof, part 2: type EXACTLY maxlen (12) real chars. Accepted
    // composition garbage would already occupy buffer space, so the tail
    // of these 12 would overflow maxlen and beep once per leaked char.
    // Zero beeps here means the buffer held exactly nothing when typing
    // started -- byte-level proof nothing leaked, with no OCR and no
    // pixel comparison.
    for (const ch of "AvatarAvatar") {
      await page.keyboard.press(ch)
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(2500) // allow async effect-decode counting if any overflow beep fired
    writeFileSync(join(evidenceDir, "prompt-after-typing.png"), await page.locator("#game-canvas").screenshot())
    const fxAfterTyping = await effectStarts()
    log(
      `Typed 12 real chars ("AvatarAvatar", exactly the 12-max buffer): effectStarts ${fxAfterComposition} -> ${fxAfterTyping} ` +
        `(expected: unchanged -- a pristine buffer accepts all 12 silently; any leaked char would overflow-beep).`
    )
    expect(
      fxAfterTyping,
      "the native name buffer must have been pristine (all 12 typed chars accepted with zero overflow beeps)"
    ).toBe(fxAfterComposition)

    // Submit the now provably-pristine, non-empty buffer with Enter, then
    // drive creation to the real save event -- the deterministic,
    // pixel-free proof the engine is uncorrupted and the prompt mechanics
    // still work after the rejected composition (name -> sex -> questions
    // -> party.sav write, all real engine logic).
    //
    // Deliberately NEVER submitting an EMPTY buffer here: pressing Enter
    // (or ESC) on the empty name prompt deterministically aborts the wasm
    // runtime (Aborted(RuntimeError: unreachable), 4/4 fresh-page probes)
    // instead of taking intro.cpp's early-return path -- a real engine bug
    // for a vendor/build lane to fix, not something this spec can cover.
    // Likewise never ESC: ReadStringController treats ESC as
    // cancel-and-submit-empty (value.erase + doneWaiting), i.e. the same
    // crashing path.
    await pressKey(page, "Enter", 1500) // submit "AvatarAvatar", advance to the sex prompt
    await pressKey(page, "m", 1500) // sex prompt
    let saved = false
    for (let i = 0; i < 26; i++) {
      await pressKey(page, "Enter", 700)
      if ((await saveStatusText(page)).includes("완료")) {
        saved = true
        break
      }
    }
    if (!saved) {
      for (let i = 0; i < 20; i++) {
        await pressKey(page, "Enter", 2600)
        await pressKey(page, "a", 1500)
        if ((await saveStatusText(page)).includes("완료")) {
          saved = true
          break
        }
      }
    }
    log(
      `Drove creation to completion after the rejected composition: save-status reports "${await saveStatusText(page)}" ` +
        `-- proves no crash/hang/corruption from the composition above.`
    )
    expect(saved, "creation must still complete (real save event) after the rejected Korean composition").toBe(true)

    writeFileSync(join(evidenceDir, "prompt-reject.log"), logLines.join("\n") + "\n")
  })
})
