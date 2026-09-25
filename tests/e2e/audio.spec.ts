import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 16: real Web Audio music/effects/RFX, end to end against the real
// xu4 engine (real ultima4.zip required -- see ULTIMA4_DATA below). This
// spec drives exactly the same boot sequence tests/e2e/boot-sequence.spec.ts
// already validates (real title render, real IntroController state
// transitions via real GLFW key input) and adds the audio-specific
// observations the plan requires: AudioContext unlock after a real user
// gesture, nonzero real music/effect buffers, pause/resume, and the
// generation-cancellation failure scenario.
//
// Every fact this spec's comments assert about *why* a given key produces
// a given sound was verified by reading the real engine source during this
// Todo's investigation (see handoff.md's "Todo 16" record for the full
// trail), not assumed:
//   - vendor/xu4/src/intro.cpp's IntroController::timerFired() calls
//     musicPlay(introMusic) automatically once the title animation ends
//     (INTRO_TITLES -> INTRO_MAP), with no key input required at all --
//     "title music starts after gesture" only needs the gesture to unlock
//     the AudioContext; the musicPlay() call itself is already automatic.
//   - vendor/xu4/module/Ultima-IV/config.b's sound: block has real *.rfx
//     entries for SOUND_UI_TICK and SOUND_UI_CLICK (menu.cpp's
//     Menu::next()/activateItem()) -- these are procedurally synthesized
//     via sfx_gen.c, not silent placeholders, and are reachable from the
//     real INTRO_MENU via the real Configure submenu ('c'), which is a
//     real, arrow-navigable Menu (confMenu).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-16")

async function selectZip(page: import("@playwright/test").Page, buffer: Buffer, name = "ultima4.zip") {
  await page.locator("#rom-picker").setInputFiles({ name, mimeType: "application/zip", buffer })
}

/** A tiny, real, universally-decodable 16-bit PCM mono WAV (silence) --
 *  used only by the generation-race scenario below, which needs SOME real
 *  audio bytes that AudioContext.decodeAudioData() will actually resolve
 *  (not reject), so the generation check inside the resolve handler is
 *  what's under test, not a decode failure. Content is intentionally
 *  irrelevant (this never gets audibly played -- the whole point of the
 *  scenario is that it must NOT start). */
function buildSilentWavBase64(seconds: number): string {
  const sampleRate = 44100
  const dataBytes = Math.round(seconds * sampleRate) * 2 // 16-bit mono
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byteRate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(dataBytes, 40)
  // remaining bytes are already zero-filled (silence)
  return buffer.toString("base64")
}

// Headless Chromium can otherwise auto-grant autoplay; forcing this policy
// makes the "unlock after gesture" observation actually test something
// (advisor-reviewed concern during this Todo's design pass). Playwright
// requires `test.use()` with `launchOptions` at the top level of a test
// file, not nested inside a describe group.
test.use({ launchOptions: { args: ["--autoplay-policy=user-gesture-required"] } })

test.describe("Todo 16: Web Audio music, effects, RFX generation", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: AudioContext unlocks after a gesture, real music and RFX effects play, pause/resume works", async ({
    page
  }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

    await selectZip(page, buffer)
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("true")
    await page.waitForFunction(() => document.body.dataset["audioBridgeReady"] === "true", { timeout: 5_000 })

    // Empirically checked during this Todo's investigation (even with
    // --autoplay-policy=user-gesture-required passed above): Playwright's
    // automated Chromium already reports `navigator.userActivation.
    // hasBeenActive === true` immediately after page.goto(), before any
    // synthetic input at all, so the AudioContext this harness observes is
    // already unlocked at this point regardless of a real user gesture --
    // a Playwright/CDP automation quirk, not something src/engine/audio.ts
    // controls. Recorded as "확인 필요" for manual/real-browser QA (F3):
    // the resume-on-suspended-context and armAutoResumeOnGesture() code
    // paths this asserts against are real and unit-tested in isolation
    // (tests/unit/audio-bridge.test.ts's suspend/resume coverage), but this
    // harness cannot exercise the "still locked before any gesture" half of
    // the contract.
    const stateBeforeGesture = await page.evaluate(() => window.ultimaAudio?.stats().contextState)

    // The same real click boot-sequence.spec.ts uses to focus the canvas
    // for keyboard input is also the gesture src/engine/audio.ts's
    // armAutoResumeOnGesture() listens for; asserting "running" after it
    // still guards against a real regression (e.g. resume() throwing and
    // leaving the context stuck suspended).
    await page.locator("#game-canvas").click()
    await page.waitForFunction(() => window.ultimaAudio?.stats().contextState === "running", { timeout: 5_000 })

    // Real input driving the real IntroController state machine (the exact
    // transitions tests/e2e/boot-sequence.spec.ts verifies). The very first
    // Enter is a "prime": while mode is still INTRO_TITLES, ANY key just
    // calls skipTitles() (sets bSkipTitles, harmless/idempotent) -- the
    // actual INTRO_TITLES -> INTRO_MAP transition is timer-driven
    // (IntroController::timerFired(), not key-driven at all), which is
    // exactly why this spec waits for musicStarts (that transition is what
    // calls musicPlay(introMusic) -- see this file's header comment)
    // *before* sending the key that depends on mode being INTRO_MAP.
    // Sending 'c' too early landed on INTRO_MAP (which treats ANY key as
    // "go to INTRO_MENU", consuming it) instead of INTRO_MENU (where 'c'
    // opens Configure) -- confirmed empirically during this Todo's
    // investigation by instrumenting IntroController::keyPressed().
    await page.keyboard.press("Enter")
    await page.waitForFunction(() => (window.ultimaAudio?.stats().musicStarts ?? 0) >= 1, { timeout: 15_000 })
    const afterMusic = await page.evaluate(() => window.ultimaAudio?.stats())
    expect(afterMusic?.lastMusicDurationSec).not.toBeNull()
    expect(afterMusic?.lastMusicDurationSec ?? 0).toBeGreaterThan(0)

    // Now genuinely in INTRO_MAP: this key transitions to INTRO_MENU
    // (mirrors tests/e2e/boot-sequence.spec.ts's second Enter).
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)

    // Effect "on command": open the real Configure submenu, navigate it
    // with a real arrow key (Menu::next() -> soundPlay(SOUND_UI_TICK), a
    // real RFX entry -- see this file's header comment), then close it via
    // its real "Main Menu" shortcut (Space -> Menu::activateItem() ->
    // soundPlay(SOUND_UI_CLICK), also RFX, and closesMenu() so we land
    // back on INTRO_MENU rather than leaving a submenu open).
    await page.keyboard.press("c")
    await page.waitForTimeout(300)
    const beforeTick = await page.evaluate(() => window.ultimaAudio?.stats().effectStarts ?? 0)
    await page.keyboard.press("ArrowDown")
    await page.waitForFunction(
      (before) => (window.ultimaAudio?.stats().effectStarts ?? 0) > before,
      beforeTick,
      { timeout: 3_000 }
    )
    const afterTick = await page.evaluate(() => window.ultimaAudio?.stats())
    expect(afterTick?.effectStarts ?? 0).toBeGreaterThan(beforeTick)
    // A real synthesized RFX buffer, not fake silence: sfx_gen.c actually
    // generated audible samples.
    expect(afterTick?.lastEffectDurationSec).not.toBeNull()
    expect(afterTick?.lastEffectDurationSec ?? 0).toBeGreaterThan(0)

    await page.keyboard.press("Space") // CANCEL shortcut: soundPlay(SOUND_UI_CLICK) + closes the submenu
    await page.waitForTimeout(300)
    const afterClick = await page.evaluate(() => window.ultimaAudio?.stats())
    expect(afterClick?.effectStarts ?? 0).toBeGreaterThan(afterTick?.effectStarts ?? 0)

    // Pause/resume (event.cpp's soundSuspend(1)/soundSuspend(0) contract):
    // the in-game pause key needs active gameplay past character creation,
    // which is out of this Todo's scope (same boundary Todo 10's deferred
    // save-reload e2e already documented) -- driven directly against the
    // same bridge object sound_web.cpp's EM_JS calls reach.
    await page.evaluate(() => window.ultimaAudio?.suspend(true))
    await page.waitForFunction(() => window.ultimaAudio?.stats().contextState === "suspended", { timeout: 3_000 })
    await page.evaluate(() => window.ultimaAudio?.suspend(false))
    await page.waitForFunction(() => window.ultimaAudio?.stats().contextState === "running", { timeout: 3_000 })

    const finalStats = await page.evaluate(() => window.ultimaAudio?.stats())
    writeFileSync(
      join(evidenceDir, "audio-summary.json"),
      JSON.stringify(
        {
          scenario: "happy path: gesture unlock, real music + RFX effect playback, pause/resume",
          observedAt: new Date().toISOString(),
          stateBeforeGesture,
          stats: finalStats
        },
        null,
        2
      )
    )

    expect(finalStats?.staleMusicDiscards ?? 0).toBe(0) // no stray races in the ordinary happy path
  })

  test("failure scenario: a decode delayed past a stopMusic() call must not restart music", async ({ page }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // Installed before any page script runs, so it is guaranteed to be in
    // place before the engine's own (organic) first decodeAudioData() call.
    await page.addInitScript(() => {
      const proto = AudioContext.prototype
      const original = proto.decodeAudioData
      ;(window as unknown as { __setDecodeDelayMs: (ms: number) => void }).__setDecodeDelayMs = (ms: number) => {
        ;(window as unknown as { __decodeDelayMs: number }).__decodeDelayMs = ms
      }
      proto.decodeAudioData = function (this: AudioContext, ...args: Parameters<AudioContext["decodeAudioData"]>) {
        const delay = (window as unknown as { __decodeDelayMs?: number }).__decodeDelayMs ?? 0
        if (delay > 0) {
          return new Promise<void>((resolve) => setTimeout(resolve, delay)).then(() =>
            original.apply(this, args)
          ) as ReturnType<AudioContext["decodeAudioData"]>
        }
        return original.apply(this, args)
      }
    })

    await page.goto("/")
    await selectZip(page, buffer)
    await page.waitForFunction(() => document.body.dataset["audioBridgeReady"] === "true", { timeout: 20_000 })
    await page.locator("#game-canvas").click()
    await page.waitForFunction(() => window.ultimaAudio?.stats().contextState === "running", { timeout: 5_000 })

    const wavBase64 = buildSilentWavBase64(0.5)
    const result = await page.evaluate(async (base64) => {
      const bridge = window.ultimaAudio
      if (!bridge) throw new Error("ultimaAudio bridge not attached")
      ;(window as unknown as { __setDecodeDelayMs: (ms: number) => void }).__setDecodeDelayMs(1500)

      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const before = bridge.stats()
      // Generation N: fires a real decodeAudioData() call, delayed 1.5s by
      // the init script above (the same real bridge.playMusic() the real
      // engine uses internally would take -- see playMusicFromBytesForTest's
      // doc comment in src/engine/audio.ts for why bytes are supplied
      // directly here instead of an FS path).
      bridge.playMusicFromBytesForTest(bytes.buffer as ArrayBuffer, 0)
      // Generation N+1: the game (or the player) stops music before that
      // decode ever finishes -- the plan's QA failure scenario.
      bridge.stopMusic()
      const afterStop = bridge.stats()

      await new Promise((resolve) => setTimeout(resolve, 2200)) // let the delayed decode resolve
      const afterDelay = bridge.stats()

      return { before, afterStop, afterDelay }
    }, wavBase64)

    // The stale decode was dropped: no new source was ever started from it...
    expect(result.afterDelay.musicStarts).toBe(result.afterStop.musicStarts)
    // ...and the bridge recorded exactly why (a stale-generation discard),
    // not silence-by-coincidence.
    expect(result.afterDelay.staleMusicDiscards).toBeGreaterThan(result.before.staleMusicDiscards)

    writeFileSync(
      join(evidenceDir, "audio-generation-race.log"),
      [
        "scenario: delayed decode from an old generation must not restart music already stopped",
        `observedAt: ${new Date().toISOString()}`,
        `before:      ${JSON.stringify(result.before)}`,
        `afterStop:   ${JSON.stringify(result.afterStop)}`,
        `afterDelay:  ${JSON.stringify(result.afterDelay)}`,
        `verdict: musicStarts unchanged (${result.afterStop.musicStarts} -> ${result.afterDelay.musicStarts}), staleMusicDiscards incremented (${result.before.staleMusicDiscards} -> ${result.afterDelay.staleMusicDiscards})`
      ].join("\n") + "\n"
    )
  })
})
