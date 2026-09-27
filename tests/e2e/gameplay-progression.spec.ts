import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import aliasesSchema from "../../locales/ko/aliases.json" with { type: "json" }
import { buildAliasTable, resolveInput, type AliasSourceEntry } from "../../src/i18n/korean-aliases.ts"

// Todo 17: integrated gameplay-progression QA against the REAL running xu4
// engine (real ultima4.zip required -- see ULTIMA4_DATA below). Composes
// the already-proven real-engine drive patterns from earlier Todos rather
// than reinventing them:
//   - character creation + save-status polling: tests/e2e/save-reload.spec.ts,
//     tests/e2e/korean-npc-alias.spec.ts
//   - enabling Debug Mode via the real Configure menu (never a test hook --
//     Todo 18 audits for those) + the cheat menu's deterministic 'g' Goto
//     (zero RNG -- vendor/xu4/src/cheat.cpp): tests/e2e/korean-npc-alias.spec.ts,
//     handoff.md's "Todo 3 E2E 보강"
//   - NPC approach-and-talk sweep proven to reliably reach a live NPC:
//     tests/e2e/korean-npc-alias.spec.ts
//   - Web Audio continuity counters (window.ultimaAudio.stats()):
//     tests/e2e/audio.spec.ts
//
// New for this Todo: a single continuous real-engine route through
// overland movement, town entry + NPC talk (English and Korean alias),
// a menu/status screen, a dungeon sample, a shrine sample, and an
// in-route save + reload -- driven entirely through the public
// keyboard/UI surface, never through injected state (per this Todo's
// "must not bypass the public UI/keyboard surface" rule).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-17")

async function bootAndSelectZip(page: Page, buffer: Buffer): Promise<void> {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await expect(page.locator("body")).toHaveAttribute("data-engine-started", "true")
  await page.locator("#game-canvas").click()
}

async function pressKey(page: Page, key: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(key)
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

async function audioStats(page: Page): Promise<{ musicStarts: number; effectStarts: number } | null> {
  return page.evaluate(() => {
    const bridge = (window as unknown as { ultimaAudio?: { stats(): { musicStarts: number; effectStarts: number } } })
      .ultimaAudio
    return bridge ? bridge.stats() : null
  })
}

/** Real character creation through the public UI, exactly mirroring tests/e2e/korean-npc-alias.spec.ts's own helper (duplicated rather than imported -- this project's established per-spec-file convention). */
async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
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

/** Enables Debug Mode (Cheats) through the real Configure menu -- see tests/e2e/korean-npc-alias.spec.ts's own doc comment for the exact sequence and why each step needs its own generous settle. */
async function enableDebugMode(page: Page): Promise<void> {
  await pressKey(page, "c", 2000) // INTRO_MENU -> confMenu (Configure)
  await pressKey(page, "g", 2000) // confMenu -> gameplayMenu (Enhanced Gameplay Options)
  await pressKey(page, "d", 2000) // toggle Debug Mode (Cheats)
  await pressKey(page, "u", 2000) // Use These Settings -- commits + writes, closes gameplayMenu
  await pressKey(page, "m", 2500) // confMenu's "Main Menu" -- back to INTRO_MENU
}

/** Opens the real cheat menu (Ctrl-C, only reachable once Debug Mode is on -- vendor/xu4/src/game.cpp:952). */
async function openCheatMenu(page: Page): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(1000)
}

/** Cheat menu's 'i' (Items!): grants full torches/gems/keys/sextant/runes/food/gold (vendor/xu4/src/cheat.cpp case 'i'). Needed so the shrine sample below can pass `shrineCanEnter`'s rune check without a multi-hour real item hunt -- an established, real, already-shipped xu4 dev feature (only reachable at all when Debug Mode is on), not a new cheat/state-control API added by this project (Todo 18 audits for those). */
async function cheatGrantItems(page: Page): Promise<void> {
  await openCheatMenu(page)
  await pressKey(page, "i", 1200) // Items!
}

/** Cheat menu's deterministic Goto ('g', vendor/xu4/src/cheat.cpp): teleports onto the named portal's world-map coordinates with zero RNG, then 'e' auto-enters it (town/dungeon/shrine all share the same portalAt(ACTION_ENTER) auto-key path -- vendor/xu4/src/game.cpp:847-848). Only valid while ON the world map (Goto matches against the CURRENT map's own portals). */
async function gotoAndEnter(page: Page, destinationSubstring: string): Promise<void> {
  await openCheatMenu(page)
  await pressKey(page, "g", 1000) // Goto
  await typeAscii(page, destinationSubstring, 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2000) // Enter!
}

/** Cheat menu's 'x' (Exit Map): deterministically returns to the parent (world) map from anywhere inside a town/dungeon/shrine -- vendor/xu4/src/cheat.cpp case 'x', reused from handoff.md's Todo 3 investigation. */
async function cheatExitMap(page: Page): Promise<void> {
  await openCheatMenu(page)
  await pressKey(page, "x", 2000) // X-it!
}

/** Approach-and-talk sweep proven (scripts/qa-native-baseline.mjs, tests/e2e/korean-npc-alias.spec.ts) to reliably reach the live mage NPC "Calabrini" just inside Moonglow's entrance. */
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

async function askEnglishKeyword(page: Page, word: string): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await pressKey(page, "Backspace", 60)
  }
  await typeAscii(page, word, 150)
  await pressKey(page, "Enter", 2000)
}

/** Submits a Korean word through the real DOM control (src/shell.ts's #korean-keyword-input) -- real resolveInput() + real synthesizeKeystrokes(), never a test-only shortcut. */
async function askKoreanKeyword(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  await input.click()
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
  // src/shell.ts's capture-phase guard swallows EVERY real keydown while
  // this box has focus (stopImmediatePropagation) -- leaving focus here
  // silently diverts every later keystroke (Ctrl-C cheat menu, arrows,
  // command letters) into the box instead of the game, until some later
  // Enter re-submits the accumulated letters as one synthesized string.
  // Blur it, exactly as a player clicking away from the box would.
  await input.blur()
}

test.describe("Todo 17: browser gameplay-progression QA (real engine, real ultima4.zip)", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: title -> new game -> overland movement -> town/NPC talk (English + Korean alias) -> status screen -> dungeon sample -> shrine sample -> save/reload", async ({
    page,
    context
  }) => {
    test.setTimeout(600_000) // full route: 2 real sessions + character creation + cheat navigation + shrine/dungeon + a 3rd reload session
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)
    const shots: string[] = []
    function shot(name: string, png: Buffer): void {
      writeFileSync(join(evidenceDir, name), png)
      shots.push(name)
    }

    await context.tracing.start({ screenshots: true, snapshots: true })

    // --- Session 1: real new-game flow through to the real party.sav write. ---
    await bootAndSelectZip(page, buffer)
    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "real engine save-status bridge never reported 저장 완료").toBe(true)

    // --- Session 2: fresh page load, enable Debug Mode from INTRO_MENU
    // (only possible before the just-created save is resumed -- see
    // tests/e2e/korean-npc-alias.spec.ts's enableDebugMode doc comment),
    // then Journey Onward into the real, just-saved world. ---
    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    shot("01-debug-mode-enabled.png", await page.locator("#game-canvas").screenshot())

    await pressKey(page, "j", 2500) // Journey Onward
    const worldEntered = await page.locator("#game-canvas").screenshot()
    shot("02-world-entered.png", worldEntered)

    const audioAfterEntry = await audioStats(page)
    expect(audioAfterEntry, "window.ultimaAudio must be present against the real engine").not.toBeNull()
    expect(audioAfterEntry?.musicStarts ?? 0, "real overworld music must have started at least once by now").toBeGreaterThan(0)

    // --- Slice 1: overland movement, real world map, real RNG-bearing
    // movement (no cheat/teleport involved) -- a genuine keyboard-driven
    // step, proven by a real canvas delta. ---
    await pressKey(page, "ArrowRight", 900)
    await pressKey(page, "ArrowRight", 900)
    const afterOverlandMove = await page.locator("#game-canvas").screenshot()
    shot("03-overland-movement.png", afterOverlandMove)
    expect(afterOverlandMove.equals(worldEntered), "two overland ArrowRight presses produced no visible screen change").toBe(false)

    // --- Slice 2: menu/status screen (Ztats), real engine, real key. ---
    await pressKey(page, "z", 1500) // Ztats
    const afterZtats = await page.locator("#game-canvas").screenshot()
    shot("04-ztats-status-screen.png", afterZtats)
    expect(afterZtats.equals(afterOverlandMove), "'z' Ztats produced no visible status-screen change").toBe(false)
    await pressKey(page, "Escape", 1000)

    // --- Cheat: grant items (torches/keys/runes) so the shrine sample
    // below can pass the real rune-of-entry check -- see cheatGrantItems's
    // doc comment. ---
    await cheatGrantItems(page)
    shot("05-cheat-items-granted.png", await page.locator("#game-canvas").screenshot())

    // --- Slice 3: town entry + NPC talk, English keyword then the SAME
    // conversation continued with a Korean alias, exactly proving the
    // Todo 13 wiring reaches this Todo 17 route too. ---
    await gotoAndEnter(page, "moonglow") // deterministic Goto + auto Enter towne!
    shot("06-moonglow-entered.png", await page.locator("#game-canvas").screenshot())
    await approachNpc(page)
    const beforeAsk = await page.locator("#game-canvas").screenshot()
    shot("07-npc-approached.png", beforeAsk)

    await askEnglishKeyword(page, "health")
    const afterEnglish = await page.locator("#game-canvas").screenshot()
    shot("08-after-english-health.png", afterEnglish)
    expect(afterEnglish.equals(beforeAsk), "asking 'health' in English produced no visible screen change").toBe(false)

    await askKoreanKeyword(page, "건강")
    const afterKorean = await page.locator("#game-canvas").screenshot()
    shot("09-after-korean-health-alias.png", afterKorean)
    expect(afterKorean.equals(afterEnglish), "asking the Korean alias '건강' produced no visible screen change").toBe(false)

    await askEnglishKeyword(page, "bye")
    const afterBye = await page.locator("#game-canvas").screenshot()
    shot("10-after-bye.png", afterBye)

    const audioAfterTalk = await audioStats(page)
    expect(
      (audioAfterTalk?.effectStarts ?? 0) >= (audioAfterEntry?.effectStarts ?? 0),
      "effect-play counter must never go backwards across the whole route (audio continuity)"
    ).toBe(true)

    // Return to the world map (Goto only matches the CURRENT map's own
    // portals -- must exit the town before Goto-ing to a dungeon/shrine).
    await cheatExitMap(page)
    shot("11-back-on-world-map.png", await page.locator("#game-canvas").screenshot())

    // --- Slice 4: dungeon sample. Real dungeon-view render (3-D corridor
    // perspective), reached via the same deterministic Goto + auto-Enter
    // used for the town above. ---
    await gotoAndEnter(page, "deceit")
    const dungeonView = await page.locator("#game-canvas").screenshot()
    shot("12-dungeon-deceit-entered.png", dungeonView)
    expect(dungeonView.equals(afterBye), "entering Dungeon Deceit produced no visible screen change").toBe(false)
    await cheatExitMap(page)
    shot("13-back-on-world-map-after-dungeon.png", await page.locator("#game-canvas").screenshot())

    // --- Slice 5: shrine sample. Entering a shrine the party can enter
    // (granted by the earlier Items cheat) auto-prompts "Upon which virtue
    // dost thou meditate?" (vendor/xu4/src/shrine.cpp Shrine::enter()) --
    // answered through the real text-input path, exactly like the NPC
    // interest prompt above. ---
    await gotoAndEnter(page, "honesty")
    // `enhancementsOptions.u5shrines` defaults to true
    // (vendor/xu4/src/settings.cpp), so Shrine::enter() first plays a
    // scripted ~4.4s "approach and kneel" cutscene
    // (Shrine::enhancedSequence(): 1000+4*400+800+1000ms of wait_msecs)
    // before the "Upon which virtue dost thou meditate?" prompt opens.
    await page.waitForTimeout(6000)
    const shrinePromptShot = await page.locator("#game-canvas").screenshot()
    shot("14-shrine-honesty-entered.png", shrinePromptShot)
    await typeAscii(page, "Honesty", 120)
    await pressKey(page, "Enter", 1500) // submit virtue name
    await pressKey(page, "1", 6000) // meditate for 1 cycle -- meditationCycle() runs a real animated sequence, needs more settle time than a single screen redraw before the game is interactive again
    const afterMeditate = await page.locator("#game-canvas").screenshot()
    shot("15-shrine-meditation.png", afterMeditate)
    expect(afterMeditate.equals(shrinePromptShot), "meditating at the Shrine of Honesty produced no visible screen change").toBe(false)
    await cheatExitMap(page)
    await page.waitForTimeout(1500)
    const afterShrineExit = await page.locator("#game-canvas").screenshot()
    shot("15b-back-on-world-map-after-shrine.png", afterShrineExit)
    expect(afterShrineExit.equals(afterMeditate), "exiting the shrine produced no visible screen change -- likely still inside the meditation cutscene").toBe(false)

    // --- Slice 6: in-route save + reload. Real 'q' Quit & Save
    // (vendor/xu4/src/game.cpp case 'q', CTX_CAN_SAVE_GAME on the world
    // map) writes party.sav again at this much-further-progressed state;
    // a fresh third session's Journey Onward proves the reload path.
    //
    // #save-status ALREADY reads "저장 완료" at this point (from the
    // earlier settings write during enableDebugMode's 'u' commit, and/or
    // the original character-creation save) -- polling for "완료" alone
    // would pass trivially without 'q' having done anything. A
    // MutationObserver records every text value #save-status takes AFTER
    // it's installed (right before 'q' is pressed), so this proves a
    // FRESH saving->saved cycle actually happened this time, not a
    // leftover value from earlier in the session (found and fixed during
    // Todo 18's review of this spec).
    await page.evaluate(() => {
      const el = document.querySelector("#save-status")
      const seen: string[] = []
      ;(window as unknown as { __saveStatusSeen: string[] }).__saveStatusSeen = seen
      if (el) {
        new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true })
      }
    })
    await pressKey(page, "q", 1500)
    let savedAgain = false
    let seen: string[] = []
    for (let i = 0; i < 10; i++) {
      seen = await page.evaluate(() => (window as unknown as { __saveStatusSeen: string[] }).__saveStatusSeen)
      if (seen.includes("저장 완료")) {
        savedAgain = true
        break
      }
      await page.waitForTimeout(500)
    }
    writeFileSync(join(evidenceDir, "quit-and-save-mutations.log"), `#save-status values observed after installing the MutationObserver: ${JSON.stringify(seen)}\n`)
    expect(savedAgain, "the mid-route 'q' Quit & Save must produce a FRESH 저장 완료 transition, not a leftover value").toBe(true)
    shot("16-quit-and-saved-mid-route.png", await page.locator("#game-canvas").screenshot())

    await bootAndSelectZip(page, buffer) // Session 3: fresh wasm instance
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await pressKey(page, "j", 2500) // Journey Onward: reloads the mid-route save
    const afterReload = await page.locator("#game-canvas").screenshot()
    shot("17-reloaded-mid-route-save.png", afterReload)

    writeFileSync(
      join(evidenceDir, "progression-route.log"),
      `Todo 17 full route, screenshots in order: ${shots.join(", ")}\n`
    )

    await context.tracing.stop({ path: join(evidenceDir, "progression.trace.zip") })
  })

  test("failure path: an intentionally wrong Korean alias would resolve to the wrong canonical keyword, invalidating this spec's own 'same effect as English' dialogue assertion", () => {
    // This is Todo 17's negative-control QA scenario. It does not re-drive
    // the real browser (the happy path above already proves the WIRING
    // from #korean-keyword-input to the real native input path end to
    // end -- see tests/e2e/korean-npc-alias.spec.ts's own doc comment for
    // why re-deriving that wiring here would be redundant, not more
    // rigorous). Instead it proves, against the REAL
    // locales/ko/aliases.json content and the REAL resolveInput() this
    // project's shell.ts calls (src/shell.ts:548,
    // `resolveInput("text", raw, koreanAliasTable)`), that corrupting a
    // single alias entry changes resolveInput's returned canonical
    // keyword -- the exact string src/shell.ts's synthesizeKeystrokes()
    // then feeds into the real engine as if a player had typed it. Had
    // this corrupted table shipped, the happy-path test above ("asking
    // the Korean alias '건강' produced no visible screen change") would
    // have compared the wrong NPC reply against the English "health"
    // baseline -- an assertion that could pass even while masking a real
    // regression. This proves the exact single point of truth that
    // regression would corrupt.
    const logLines: string[] = []
    function log(line: string): void {
      logLines.push(line)
    }

    const realEntries = (aliasesSchema as { entries: Record<string, AliasSourceEntry> }).entries
    const realTable = buildAliasTable(realEntries)
    const realResult = resolveInput("text", "건강", realTable)
    expect(realResult.ok, "the real '건강' alias must resolve").toBe(true)
    const realCanonical = realResult.ok ? realResult.text : null
    log(`Real table: resolveInput("text", "건강", realTable) -> ${JSON.stringify(realResult)}`)
    expect(realCanonical, "the real '건강' alias must resolve to the canonical 'health' keyword").toBe("health")

    // Corrupt exactly one entry: map the SAME '건강' alias to the WRONG
    // canonical keyword ('bye' instead of 'health') -- a realistic
    // single-line regression (e.g. a copy-paste error in aliases.json),
    // not a contrived worst case.
    const corruptedEntries: Record<string, AliasSourceEntry> = { ...realEntries }
    for (const [key, entry] of Object.entries(realEntries)) {
      if (entry.canonical === "health") {
        corruptedEntries[key] = { ...entry, canonical: "bye" }
      }
    }
    const corruptedTable = buildAliasTable(corruptedEntries)
    const corruptedResult = resolveInput("text", "건강", corruptedTable)
    log(`Corrupted table (health -> bye): resolveInput("text", "건강", corruptedTable) -> ${JSON.stringify(corruptedResult)}`)

    expect(
      corruptedResult.ok && corruptedResult.text === realCanonical,
      "a corrupted alias table must NOT resolve '건강' to the same canonical keyword as the real table -- if it did, this negative control would be vacuous"
    ).toBe(false)

    log(
      "Conclusion: resolveInput()'s return value is the single value src/shell.ts's synthesizeKeystrokes() " +
        "synthesizes into the real engine (src/shell.ts:544-548). A corrupted alias table changes that value " +
        "silently -- the happy-path e2e test's canvas-delta comparison cannot distinguish 'the NPC replied to " +
        "the CORRECT canonical keyword' from 'the NPC replied to some OTHER keyword that also happens to " +
        "produce a screen change'. This is exactly the failure mode a build-time invariant check " +
        "(tests/unit/korean-aliases.test.ts's 'every filled-in alias's canonical keyword is pure ASCII...' test, " +
        "plus scripts/lib/alias-check.mjs) must keep guarding against; this e2e-level control documents WHY that " +
        "guard matters for the specific dialogue assertion this Todo's happy path makes."
    )

    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, "alias-regression.log"), logLines.join("\n") + "\n")
  })
})
