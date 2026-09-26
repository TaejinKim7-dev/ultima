import { expect, test } from "@playwright/test"
import { existsSync, readFileSync } from "node:fs"

// Regression spec for a WASM-only Aborted(RuntimeError: unreachable) crash
// found while working on Todo 13. Root cause (see handoff.md's "wasm 입력
// 이벤트 재진입 버그" section for the full diagnostic trail): under
// Emscripten, GLFW's key/mouse callbacks (vendor/xu4/src/screen_glfw.cpp)
// are invoked directly and synchronously from the browser's own DOM event
// listeners, completely independent of when EventHandler::run()'s own
// Asyncify-driven frame loop happens to be suspended (mid-emscripten_sleep,
// waiting for a setTimeout). If such a callback reaches code that opens a
// nested Controller (Menu/CheatMenu navigation -- runMenu() -> a fresh,
// re-entrant EventHandler::run() call), that nested call ALSO suspends via
// Asyncify -- but Asyncify supports only one suspended operation globally.
// The already-pending main-loop sleep's callback becomes orphaned; when its
// stale setTimeout eventually fires (often much later, after the nested
// loop has already run its own full cycle and reset Asyncify's global
// state), it resumes with a stale/freed `Asyncify.currData`, and the whole
// runtime aborts.
//
// This reliably reproduced via: INTRO_MENU -> 'c' (Configure) -> 'g'
// (gameplayMenu, itself a SECOND level of nested runMenu()) -> 'u' (Use
// These Settings -- commits via Settings::write() AND closes the menu,
// returning control back out through the nested call chain). Bisection
// during the investigation showed `Settings::write()` itself is innocent
// (the same call succeeds one level deep, on the confMenu -> gameplayMenu
// transition); the trigger is specifically the reentrant callback's nested
// loop RETURNING back out to JS while genuinely two levels deep. The
// identical class of crash also reproduced on entering a town via the
// debug cheat menu's Goto command (another nested Controller return).
//
// Fixed in vendor/xu4/src/screen_glfw.cpp: GLFW callbacks now only enqueue
// the (already-translated) event; EventHandler::handleInputEvents() drains
// that queue right after its own glfwPollEvents() call -- the same place
// native builds process these events synchronously, so Asyncify never
// has two independent suspended operations in flight.
async function bootAndSelectZip(page: import("@playwright/test").Page, buffer: Buffer): Promise<void> {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await page.locator("#game-canvas").click()
}

async function pressKey(page: import("@playwright/test").Page, k: string, delayMs = 2000): Promise<void> {
  await page.keyboard.press(k)
  await page.waitForTimeout(delayMs)
}

test.describe("Todo 99: Configure-menu settings commit must not abort the wasm runtime", () => {
  test("committing Debug Mode from confMenu -> gameplayMenu -> 'u' survives, and INTRO_MENU stays responsive afterward", async ({
    page
  }) => {
    test.setTimeout(60_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    const pageErrors: string[] = []
    page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message))

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU

    await pressKey(page, "c") // INTRO_MENU -> confMenu (Configure)
    await pressKey(page, "g") // confMenu -> gameplayMenu (also commits+writes settings once)
    await pressKey(page, "d") // toggle Debug Mode (Cheats)
    const beforeUse = await page.locator("#game-canvas").screenshot()
    await pressKey(page, "u", 2500) // Use These Settings -- commits + writes + closes gameplayMenu

    expect(pageErrors, `expected no page errors after committing settings, got: ${pageErrors.join("\n")}`).toEqual([])

    // The runtime must still be alive and responsive: returning to
    // INTRO_MENU and seeing a further screen change proves the engine
    // didn't merely fail to crash yet while actually being wedged.
    await pressKey(page, "m", 2500) // confMenu's "Main Menu" -- back to INTRO_MENU
    const afterMainMenu = await page.locator("#game-canvas").screenshot()
    expect(beforeUse.equals(afterMainMenu), "expected the screen to change after returning to INTRO_MENU").toBe(false)
    expect(pageErrors, `expected no page errors after returning to INTRO_MENU, got: ${pageErrors.join("\n")}`).toEqual(
      []
    )
  })

  test("submitting an empty avatar name survives (no abort)", async ({ page }) => {
    test.setTimeout(60_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    const pageErrors: string[] = []
    page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message))

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
    await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
    await pressKey(page, "i", 1500) // initiateNewGame(): avatar name prompt
    await pressKey(page, "Enter", 2000) // submit an EMPTY name

    expect(pageErrors, `expected no page errors after an empty name submit, got: ${pageErrors.join("\n")}`).toEqual(
      []
    )
  })
})
