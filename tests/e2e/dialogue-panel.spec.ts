import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

// Todo 11: HTML dialogue panel. The real xu4 engine does not yet emit
// per-fragment `message` bridge events (screenMessage() draws straight to
// its own WebGL2 raster; see handoff.md's Todo 21 record and
// `.omo/drafts/step-11-13-korean-ui-design.md`), so this spec drives the
// panel through `window.ultimaBridge.dispatch(...)` with synthetic events
// that are structurally modeled on real call-site patterns (e.g.
// dungeon.cpp:163's `screenMessage("...\nWho drinks? ")` followed by a
// *separate* `screenMessage("%c\n", key)` call) but use text authored for
// this test, never text extracted from original game data.
const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-11/", import.meta.url))

test.describe("Todo 11: HTML dialogue panel", () => {
  test("happy path: a talk-like fragmented sequence renders as history lines, with color, prompt focus, and CJK wrapping", async ({
    page
  }) => {
    await page.goto("/ultima/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

    async function dispatch(event: Record<string, unknown>): Promise<boolean> {
      return page.evaluate((e) => window.ultimaBridge?.dispatch({ abiVersion: 1, ...e }) ?? false, event)
    }

    // A welcome banner, then a colorized warning line (FG_RED then
    // FG_WHITE, matching textview.h's byte values) -- both self-authored.
    expect(await dispatch({ type: "message", text: "Ultima IV 웹 포트에 오신 것을 환영합니다.\n" })).toBe(
      true
    )
    expect(await dispatch({ type: "message", text: "\x17경고: 이것은 테스트 문구입니다.\x19\n" })).toBe(
      true
    )

    // Fragment continuity across two SEPARATE dispatches, modeled on
    // dungeon.cpp's "Who drinks? " + a later, separate echoed-key message.
    expect(await dispatch({ type: "message", text: "당신의 이름은 무엇입니까? " })).toBe(true)
    expect(await dispatch({ type: "message", text: "아바타\n" })).toBe(true)

    const lineTexts = await page.locator("#dialogue-history > .dialogue-line").allTextContents()
    expect(lineTexts).toEqual([
      "Ultima IV 웹 포트에 오신 것을 환영합니다.",
      "경고: 이것은 테스트 문구입니다.",
      "당신의 이름은 무엇입니까? 아바타",
      "" // the always-present, currently-empty current line
    ])

    // The color token produced a distinct <span> class, not raw markup.
    const redSpanText = await page.locator(".dialogue-color-red").first().textContent()
    expect(redSpanText).toBe("경고: 이것은 테스트 문구입니다.")

    // Prompt focus: a `prompt` event marks and focuses a dedicated element,
    // without a stray "[prompt:kind] id" debug line in the history.
    expect(await dispatch({ type: "prompt", promptId: "req-1", kind: "text" })).toBe(true)
    const focusedId = await page.evaluate(() => document.activeElement?.id)
    expect(focusedId).toBe("dialogue-prompt-marker")
    expect(lineTexts.some((t) => t.includes("prompt"))).toBe(false)

    // Real key delivery is unaffected by that focus change -- the GLFW
    // input port listens at the window capture phase regardless of which
    // element has focus (Step 8's queue observes the same DOM keydown).
    await page.evaluate(() => window.ultimaInput?.reset())
    await page.keyboard.press("a")
    const drained = await page.evaluate(() => window.ultimaInput?.drainKeys().map((e) => e.key))
    expect(drained).toEqual(["a".charCodeAt(0)])

    // CJK wrapping: a long, unbroken Hangul compound word (no spaces) must
    // still wrap inside the panel's width instead of overflowing it.
    const longHangul = "가나다라마바사아자차카타파하".repeat(6)
    expect(await dispatch({ type: "message", text: longHangul })).toBe(true)
    const overflow = await page.evaluate(() => {
      const line = document.querySelector("#dialogue-history > .dialogue-line:last-child")
      if (line === null) return null
      return { scrollWidth: line.scrollWidth, clientWidth: line.parentElement?.clientWidth ?? 0 }
    })
    expect(overflow).not.toBeNull()
    expect(overflow!.scrollWidth).toBeLessThanOrEqual(overflow!.clientWidth + 1) // +1: sub-pixel rounding

    // Evidence capture happens with the whole sequence still on screen
    // (banner, colorized line, joined-fragment line, wrapped CJK text) --
    // taken before the clear-behavior check below, which intentionally
    // wipes it.
    mkdirSync(evidenceDir, { recursive: true })
    await page.screenshot({ path: `${evidenceDir}dialogue-panel.png` })

    // clear removes the prompt marker and the whole history.
    expect(await dispatch({ type: "clear" })).toBe(true)
    await expect(page.locator("#dialogue-prompt-marker")).toBeHidden()
    expect(await page.locator("#dialogue-history > .dialogue-line").allTextContents()).toEqual([""])
  })

  test("failure path: injected script-like translated text renders as inert text, never executes, and is never dumped to console", async ({
    page
  }) => {
    const consoleMessages: string[] = []
    page.on("console", (msg) => consoleMessages.push(msg.text()))

    await page.goto("/ultima/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

    const hostileText = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">'

    const dispatched = await page.evaluate(
      (text) => window.ultimaBridge?.dispatch({ abiVersion: 1, type: "message", text }) ?? false,
      hostileText
    )
    expect(dispatched).toBe(true)

    // Never executed.
    const xssRan = await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)
    expect(xssRan).toBeUndefined()

    // Never parsed as markup: no <script>/<img> element exists anywhere in
    // the dialogue panel's subtree.
    const scriptCount = await page.locator("#dialogue-panel script").count()
    const imgCount = await page.locator("#dialogue-panel img").count()
    expect(scriptCount).toBe(0)
    expect(imgCount).toBe(0)

    // The literal string is present as inert text.
    const panelText = await page.locator("#dialogue-history").textContent()
    expect(panelText).toContain(hostileText)

    // A separate, genuinely malformed event (fails isBridgeEvent) carrying
    // sensitive-looking translated text must not have that text dumped to
    // the console verbatim (Todo 11's "Must not... dump complete text to
    // console").
    const secretMarker = "SECRET-LOCALE-STRING-MUST-NOT-BE-LOGGED"
    await page.evaluate(
      (text) => window.ultimaBridge?.dispatch({ abiVersion: 999, type: "message", text }),
      secretMarker
    )

    const leaked = consoleMessages.some((m) => m.includes(secretMarker))
    expect(leaked).toBe(false)

    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(
      `${evidenceDir}textcontent-safety.log`,
      [
        "Todo 11 failure QA: injected <script>/<img onerror> in a message event",
        `hostileText=${hostileText}`,
        `window.__xss after dispatch: ${String(xssRan)}`,
        `<script> elements under #dialogue-panel: ${scriptCount}`,
        `<img> elements under #dialogue-panel: ${imgCount}`,
        `literal text present in #dialogue-history.textContent: ${panelText?.includes(hostileText)}`,
        `malformed-event secret marker leaked to console: ${leaked}`
      ].join("\n") + "\n"
    )
  })
})
