import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

// Todo 18: failure/security/privacy/regression boundaries. Static checks
// (XSS sinks, cheat tokens, noisy console text, original-data/test-hook
// leakage) already live in `scripts/audit-dist.mjs` + `npm run audit:dist`
// (`tests/unit/audit-dist.test.ts`), and corrupt-ZIP/missing-files/
// hash-mismatch/no-reselection-on-reload are already covered by
// `tests/e2e/startup-data.spec.ts` (Todo 9), and injected script-like
// translated text rendering as inert text is already covered by
// `tests/e2e/dialogue-panel.spec.ts`'s own failure path (Todo 11). This
// spec covers ONLY what those don't: the runtime-only scenarios that need
// a live page (oversized-ZIP rejection, a real console-noise proof during
// an actual play session, and a mid-game -- not boot-time -- save-sync
// failure), plus an honest negative finding about the "stale bridge
// requests" scenario (see that test's own doc comment).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-18")
const staleSurfaceEvidenceDir = join(evidenceDir, "stale-real-surface")

async function pressKey(page: Page, key: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(key)
  await page.waitForTimeout(delayMs)
}

async function saveStatusText(page: Page): Promise<string> {
  return page.locator("#save-status").innerText()
}

async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter")
  await pressKey(page, "Enter")
  await pressKey(page, "i")
  for (const ch of "Avatar") {
    await page.keyboard.press(ch)
    await page.waitForTimeout(150)
  }
  await pressKey(page, "Enter")
  await pressKey(page, "m")
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

test.describe("Todo 18: failure boundaries (real engine where noted, synthetic ZIP fixtures otherwise)", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
    mkdirSync(staleSurfaceEvidenceDir, { recursive: true })
  })

  test("stale Korean text: closing a real native text prompt rejects the old shell submission without dispatching alias keys to the game surface", async ({
    page
  }) => {
    test.setTimeout(120_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    await page.locator("#game-canvas").click()
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await pressKey(page, "i") // the real IntroController avatar-name ReadStringController

    await page.evaluate(() => {
      const syntheticKeydowns: number[] = []
      window.addEventListener(
        "keydown",
        (event) => {
          if (Reflect.get(event, "__ultimaSynthetic") === true) {
            syntheticKeydowns.push(Date.now())
          }
        },
        true
      )
      Reflect.set(window, "__staleKoreanSyntheticKeydowns", syntheticKeydowns)
    })

    // Given: Korean alias text captured while the actual native text
    // controller is open. It must become stale once that controller exits.
    const koreanInput = page.locator("#korean-keyword-input")
    await koreanInput.click()
    await koreanInput.fill("건강")
    await koreanInput.blur()

    // When: the player completes the real avatar-name prompt through the
    // normal browser-to-GLFW input path, then presses Enter on the old
    // Korean field after that epoch has closed.
    await pressKey(page, "x")
    await pressKey(page, "Enter")
    await page.waitForTimeout(500)
    await koreanInput.click()
    await koreanInput.press("Enter")
    await page.waitForTimeout(500)

    const observation = await page.evaluate(() => {
      const captured = Reflect.get(window, "__staleKoreanSyntheticKeydowns")
      return Array.isArray(captured) ? captured.length : -1
    })
    const dialogueText = await page.locator("#dialogue-history").innerText()
    writeFileSync(
      join(staleSurfaceEvidenceDir, "stale-submission-observation.log"),
      `synthetic keydowns after native prompt closed: ${observation}\n` +
        `dialogue panel: ${JSON.stringify(dialogueText)}\n`
    )
    await page.screenshot({ path: join(staleSurfaceEvidenceDir, "stale-submission.png") })

    // Then: a stale submission must not reach GLFW's actual game-input
    // surface. The pre-fix shell emits the resolved "health" + Enter key
    // sequence here, which this listener observes as seven keydowns.
    expect(observation).toBe(0)
    expect(dialogueText).toContain("입력 요청이 끝났습니다")
  })

  test("oversized ZIP: rejected before the engine ever reads it into memory, with a Korean error message", async ({
    page
  }) => {
    test.setTimeout(120_000) // allocating/uploading a 200MiB+ fixture is inherently slower than the other synthetic-ZIP cases
    // src/engine/zip.ts's MAX_ZIP_BYTES (200 * 1024 * 1024). Duplicated as
    // a literal (not imported) because this file runs under Playwright's
    // Node context, not Vite's module graph, and the real ultima4.zip is
    // ~529KB -- there is no legitimate reason a real selection would ever
    // approach this size.
    const MAX_ZIP_BYTES = 200 * 1024 * 1024
    // Playwright's setInputFiles rejects an inline `buffer` over 50MB
    // ("Cannot set buffer larger than 50Mb, please write it to a file and
    // pass its path instead" -- found by running this test for real).
    // Written to a real temp file and passed by path instead, exactly as
    // that error suggests.
    const oversizedPath = join(tmpdir(), "failure-boundaries-oversized.zip")
    writeFileSync(oversizedPath, Buffer.alloc(MAX_ZIP_BYTES + 1))

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    await page.locator("#rom-picker").setInputFiles(oversizedPath)
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 30_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("false")
    expect(await page.locator("body").getAttribute("data-engine-start-reason")).toBe("oversized")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    expect(dialogueText).toContain("너무 큽니다")
    writeFileSync(join(evidenceDir, "oversized-zip.log"), `oversized case: dialogue panel text:\n${dialogueText}\n`)
  })

  test("console-noise runtime check: a real boot + character-creation session never calls console.log/debug/info/table", async ({
    page
  }) => {
    test.setTimeout(300_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // audit:dist's noisy-console check is a STATIC scan of shipped source
    // text -- it cannot see console calls a library makes through an
    // indirect reference, a computed method name, or a dependency's own
    // runtime string construction. This proves the actual behavior during
    // a real, fairly long play session instead of trusting the static
    // scan alone.
    const bannedCalls: string[] = []
    page.on("console", (msg) => {
      const type = msg.type()
      if (type === "log" || type === "debug" || type === "info" || type === "table") {
        bannedCalls.push(`${type}: ${msg.text()}`)
      }
    })

    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    await page.locator("#game-canvas").click()
    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "character creation must complete for this to be a meaningful session").toBe(true)

    writeFileSync(
      join(evidenceDir, "console-noise.log"),
      bannedCalls.length === 0
        ? "no console.log/debug/info/table calls observed during a real boot + character-creation session\n"
        : `banned console calls observed:\n${bannedCalls.join("\n")}\n`
    )
    expect(bannedCalls, `banned console calls: ${JSON.stringify(bannedCalls)}`).toEqual([])
  })

  test("mid-game save-sync failure: a real IndexedDB break AFTER a successful boot+save is reported as 저장 실패, never a false 저장 완료", async ({
    page
  }) => {
    test.setTimeout(300_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    await page.locator("#game-canvas").click()

    const savedOnce = await createCharacterAndWaitForSave(page)
    expect(savedOnce, "the first real save must succeed before we simulate a later IDBFS break").toBe(true)
    const statusAfterFirstSave = await saveStatusText(page)
    expect(statusAfterFirstSave).toBe("저장 완료")

    // FINDING from an earlier attempt at this test (kept as a comment,
    // not fabricated): removing `window.indexedDB` after a first
    // successful save has NO effect on a later syncfs call, because
    // Emscripten's IDBFS caches the open connection in `IDBFS.dbs[name]`
    // and `getDB()` returns it directly without ever re-opening
    // (confirmed by reading the real generated dist/engine/xu4.js). So
    // instead, this breaks the SAME cached connection object directly:
    // `IDBDatabase.prototype.transaction` is monkeypatched to throw a
    // realistic `InvalidStateError` (same pattern this project already
    // uses in tests/e2e/dialogue-panel.spec.ts, which patches
    // Element.prototype.innerHTML/outerHTML) -- this reaches the cached
    // connection because the method is looked up on the prototype at
    // CALL time, not cached as a bound reference anywhere.
    //
    // This also exercises a real bug this Todo found and fixed
    // (src/engine/persistence.ts's runSync(), tests/unit/
    // persistence.test.ts): the real IDBFS write path's
    // `db.transaction([...], "readwrite")` call is not wrapped in a
    // try/catch in Emscripten's generated glue, so it can throw
    // SYNCHRONOUSLY rather than via the async callback. Before the fix,
    // that left #save-status stuck at "저장 중..." forever instead of
    // ever reaching "저장 실패".
    await page.evaluate(() => {
      IDBDatabase.prototype.transaction = () => {
        throw new DOMException("connection is closing", "InvalidStateError")
      }
    })

    // Trigger another real native write: the world-map 'q' Quit & Save
    // command (vendor/xu4/src/game.cpp case 'q', CTX_CAN_SAVE_GAME).
    await page.waitForTimeout(6000) // let the post-save segue screens finish landing on the world map
    await pressKey(page, "Enter", 1200) // clear a possible lingering waitAnyKey() segue screen
    await pressKey(page, "q", 2000)

    let sawError = false
    let lastStatus = ""
    for (let i = 0; i < 20; i++) {
      lastStatus = await saveStatusText(page)
      if (lastStatus.includes("저장 실패")) {
        sawError = true
        break
      }
      await page.waitForTimeout(500)
    }

    writeFileSync(
      join(evidenceDir, "mid-game-save-sync.log"),
      `first save: "${statusAfterFirstSave}", then IDBDatabase.prototype.transaction broken, then 'q' Quit&Save pressed.\n` +
        `final #save-status text: "${lastStatus}"\n`
    )
    expect(sawError, `expected a 저장 실패 error status, got "${lastStatus}"`).toBe(true)
  })

  // "Stale bridge requests" (Todo 18's checklist) is NOT covered by a test
  // here. A genuine architectural gap makes a real-engine e2e proof
  // impossible to write honestly: `window.ultimaInput`/`src/bridge/
  // input-queue.ts` (the Todo-8 stale-request-rejection contract) and its
  // native mirror `vendor/xu4/src/web_bridge.cpp` (`u4_web_enqueue_key`/
  // `u4_web_submit_text`/`u4_web_begin_prompt`/`u4_web_take_text`) are
  // never actually reached by the real running engine. Verified by
  // grepping `engine/src`, `native/`, `scripts/`, and `src/` (not just
  // `vendor/xu4/src`) for every `u4_web_*` symbol: the wasm build DOES
  // export `_u4_web_enqueue_key`/`_u4_web_submit_text`
  // (`scripts/build-wasm.mjs`'s EXPORTED_FUNCTIONS,
  // `scripts/qa-wasm-instantiate.mjs` checks they exist), but nothing
  // under `src/` (the actual browser app) ever calls those exports, and
  // no native controller ever calls `u4_web_begin_prompt`/reads back
  // `u4_web_take_text` (only `web_bridge.cpp` itself and its own isolated
  // native unit test, `native/tests/input_queue_test.c`, reference them).
  // The engine's REAL input path is a completely separate queue added
  // later, `vendor/xu4/src/screen_glfw.cpp`'s own `inputQueue`/
  // `drainInputQueue`, fed directly by GLFW callbacks with no request-id/
  // epoch/staleness concept at all. A test asserting
  // `window.ultimaInput.submitText(staleId, ...)` is rejected on a live
  // page would only re-prove `tests/unit/input-queue.test.ts`'s existing
  // unit coverage while reading as a real-engine proof it isn't -- this
  // project's own "실제 게임에서 확인" honesty convention (plan.md)
  // argues against writing that test. This finding is instead recorded
  // in plan.md/handoff.md as an explicit, uncovered gap.
})
