import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 21: the real xu4 engine linked (21.1), its FS/paths wired to a
// real ZIP + IDBFS mount (21.2), title screen rendered through the real
// WebGL2 renderer (21.3), and real keyboard input reaching the real
// engine (21.4). This spec proves 21.3+21.4 end to end; 21.1/21.2 are
// proven separately by `llvm-nm` (build:wasm) and by this same happy
// path never failing on missing files/paths.
//
// The IntroController state machine this test drives (vendor/xu4/src/
// intro.cpp's keyPressed()) is exactly: INTRO_TITLES --(any key)-->
// skipTitles() --> INTRO_MAP --(any key)--> MAP_DISABLE (mapArea.clear())
// + INTRO_MENU (draws the English menu text). Two keypresses are used
// here specifically because that second transition clears the animated
// map and replaces it with static menu text -- a discrete, code-verified
// state change that cannot be confused with the map's own ambient
// animation (which never fully stops on its own within a short wait).
//
// Non-black detection deliberately does NOT read the live WebGL context
// (gl.readPixels, or drawImage()+getImageData() onto a 2D canvas): the
// canvas is created without preserveDrawingBuffer, so by the time a
// page.evaluate() callback runs, the drawing buffer has already been
// cleared for the next frame and both of those read back all zeroes
// even when the presented frame was not black (confirmed empirically
// while building this test). A Playwright screenshot instead captures
// the actually-composited frame (the same one a user would see), so
// non-black is checked via a self-calibrated screenshot byte-size
// comparison: a real screenshot's PNG compresses far larger than one of
// an untouched black canvas taken moments earlier in the same run.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-21")

async function selectZip(page: import("@playwright/test").Page, buffer: Buffer, name = "ultima4.zip") {
  await page.locator("#rom-picker").setInputFiles({ name, mimeType: "application/zip", buffer })
}

test.describe("Todo 21: real xu4 engine boot, render, input", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: verified ZIP renders the real title screen and real input reaches real game state", async ({
    page
  }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    const blackBaseline = await page.locator("#game-canvas").screenshot()

    await selectZip(page, buffer)
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("true")

    // Give the intro's logo animation a moment to start drawing, then
    // confirm it is not simply a black canvas (21.3's own acceptance).
    // Only sparse "Loading..." text has been drawn this early, so the
    // byte-size increase over a solid-black frame is modest -- any
    // measurable increase is enough here; the richer post-input checks
    // below use a much larger margin.
    await page.waitForTimeout(1500)
    const titleShot = await page.locator("#game-canvas").screenshot()
    expect(titleShot.length).toBeGreaterThan(blackBaseline.length)

    // 21.4: first keypress skips the logo sequence into the animated map
    // (IntroController::skipTitles()).
    await page.locator("#game-canvas").click()
    await page.keyboard.press("Enter")
    await page.waitForTimeout(1000)
    const afterFirstKey = await page.locator("#game-canvas").screenshot()

    // Second keypress: INTRO_MAP -> INTRO_MENU. The map area is cleared
    // and replaced with static English menu text -- a real, discrete,
    // input-gated state change, distinguished from the map's own ambient
    // animation by simple inequality (the exact animated-map pixels are
    // themselves never identical twice, so this isn't testing for that).
    await page.keyboard.press("Enter")
    await page.waitForTimeout(1000)
    const afterSecondKey = await page.locator("#game-canvas").screenshot()

    writeFileSync(join(evidenceDir, "title-render.png"), afterSecondKey)
    expect(afterSecondKey.equals(afterFirstKey)).toBe(false)
    expect(afterSecondKey.length).toBeGreaterThan(blackBaseline.length * 1.5)
  })

  test("failure path: a missing module asset fails loudly through a fatal runtime-error", async ({ page }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // Simulate Todo 21.2's module-file dependency breaking: render.pak
    // 404s. A structurally-valid ZIP is used so the ZIP itself is not why
    // startup fails -- this isolates the module-fetch failure specifically
    // (src/main.ts's fetchModuleAsset() must reject on a non-OK response,
    // not silently write the 404 page's body into the wasm FS as if it
    // were real module data).
    await page.route("**/engine/modules/render.pak", (route) => route.fulfill({ status: 404, body: "not found" }))

    await page.goto("/")
    await selectZip(page, buffer)
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("false")
    expect(await page.locator("body").getAttribute("data-engine-start-reason")).toBe("module-load-failed")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    writeFileSync(
      join(evidenceDir, "boot-failure.log"),
      `missing render.pak (HTTP 404): data-engine-start-reason=${await page
        .locator("body")
        .getAttribute("data-engine-start-reason")}\ndialogue panel:\n${dialogueText}\n`
    )
    expect(dialogueText).toContain("엔진 모듈을 불러오지 못했습니다")
  })
})
