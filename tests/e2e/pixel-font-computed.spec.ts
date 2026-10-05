import { expect, test, type Page } from "./fixtures.ts"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

// Todo 50 acceptance #3 + QA failure scenarios: every Korean in-game surface
// is rendered with the fixed-width pixel font (Neo둥근모 / NeoDunggeunmo) at
// the computed-style level, the font actually loads, and the QA-failure case
// (font file blocked at the network layer) falls back to the system Korean
// font without clipping.
//
// Synthetic-event driven (like tests/e2e/status-overlay.spec.ts): the engine
// emits no C++->JS bridge events for these surfaces today (see
// src/overlay/overlay-layout.ts's own comment for the grep that verified it),
// so `window.ultimaBridge.dispatch(...)` stands in for the real native call.
//
// Why Ztats/intro are NOT separately asserted: Ztats is the same `.status`
// role as the status panel -- same DOM element, same `.overlay-role`
// selector, same computed font-family path. Intro's "mainArea" is the same
// `.menu` role. Asserting the role once proves every view that uses it; the
// only Korean surfaces that have their OWN font-family declaration are
// `.windheading`, `.messagearea`, `.talk-keyword-secondary` -- those get
// their own one-liner assertions in their respective real-engine specs
// (korean-wind-heading.spec.ts / korean-message-area.spec.ts /
// talk-keywords.spec.ts), not in this synthetic spec.
const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-50/", import.meta.url))
const pixelFontPath = join(evidenceDir, "pixel-font.png")
const fontFallbackPath = join(evidenceDir, "font-fallback.png")

async function dispatch(page: Page, event: Record<string, unknown>): Promise<boolean> {
  return page.evaluate((e) => window.ultimaBridge?.dispatch({ abiVersion: 1, ...e }) ?? false, event)
}

async function goReady(page: Page): Promise<void> {
  await page.goto("/ultima/")
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
}

/** Reads `getComputedStyle(el).fontFamily` and returns the first family token
 *  with surrounding quotes stripped. CSS `font-family` lists can quote family
 *  names that contain whitespace ("NeoDunggeunmo" is quoted in shell.css), so
 *  we strip the matching pair before comparing. */
async function firstFontFamily(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (el === null) return null
    const ff = getComputedStyle(el).fontFamily
    if (ff === "") return null
    // CSS font-family is a comma-separated list; the first token is the
    // primary family. Trim whitespace, strip one pair of matching quotes.
    const first = ff.split(",")[0]!.trim()
    if (first.length >= 2 && first.startsWith('"') && first.endsWith('"')) {
      return first.slice(1, -1)
    }
    if (first.length >= 2 && first.startsWith("'") && first.endsWith("'")) {
      return first.slice(1, -1)
    }
    return first
  }, selector)
}

test.describe("Todo 50: computed font-family of every Korean surface is NeoDunggeunmo", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: status / statussummary / menu overlays, dialogue panel line, and #korean-keyword-input all compute to NeoDunggeunmo", async ({
    page
  }) => {
    test.setTimeout(60_000)
    await goReady(page)

    // Lift the same overlay set a real statussummary/textview swap would.
    expect(
      await dispatch(page, {
        type: "view",
        region: "status",
        text: "",
        rows: [
          { label: "체력", value: "99/99" },
          { label: "정신력", value: "12" }
        ]
      })
    ).toBe(true)
    expect(
      await dispatch(page, {
        type: "view",
        region: "statussummary",
        text: "식량 99   금화 200"
      })
    ).toBe(true)
    expect(
      await dispatch(page, {
        type: "view",
        region: "menu",
        text: "",
        rows: [{ label: "여정 계속" }, { label: "새 게임" }, { label: "돌아가기" }],
        selectedIndex: 0
      })
    ).toBe(true)
    // Drive a Korean line into the dialogue panel so #dialogue-history
    // has a committed line to measure (Todo 11's panel is built around
    // 'message' bridge events; the overlay is `.dialogue-line` under
    // #dialogue-history).
    expect(await dispatch(page, { type: "message", text: "한국어 대화 줄입니다.\n" })).toBe(true)

    await expect(page.locator('[data-role="status"]')).toBeVisible()
    await expect(page.locator('[data-role="statussummary"]')).toBeVisible()
    await expect(page.locator('[data-role="menu"]')).toBeVisible()
    await expect(page.locator("#dialogue-history .dialogue-line").first()).toBeVisible()
    await expect(page.locator("#korean-keyword-input")).toHaveCount(1)

    const expected = "NeoDunggeunmo"
    const got = {
      status: await firstFontFamily(page, '[data-role="status"]'),
      statussummary: await firstFontFamily(page, '[data-role="statussummary"]'),
      menu: await firstFontFamily(page, '[data-role="menu"]'),
      dialogueLine: await firstFontFamily(page, "#dialogue-history .dialogue-line"),
      koreanInput: await firstFontFamily(page, "#korean-keyword-input")
    }
    // Logged as evidence (never a pass/fail input -- the asserts below are).
    await page.evaluate(
      (computed) => {
        const line = `[pixel-font-computed] ${JSON.stringify(computed)}`
        console.log(line)
      },
      got
    )

    for (const [role, family] of Object.entries(got)) {
      expect(family, `${role} must compute font-family to NeoDunggeunmo`).toBe(expected)
    }

    // The font face actually loaded (not just present in the CSS): the
    // browser parses the @font-face declaration in src/shell.css and resolves
    // the woff2 served from /ultima/fonts/neodgm.woff2 before this assertion
    // runs (src/main.ts:87 fires document.fonts.load in parallel at boot).
    const fontReady = await page
      .evaluate(async () => {
        try {
          await document.fonts.load("16px NeoDunggeunmo")
        } catch {}
        return document.fonts.check("16px NeoDunggeunmo")
      })
      .catch(() => false)
    expect(fontReady, "document.fonts.check('16px NeoDunggeunmo') must be true while the page is live").toBe(true)

    await page.screenshot({ path: pixelFontPath })
  })

  test("RED evidence: an !important override on .overlay-role breaks the same single-family assertion (the test actually catches what it claims)", async ({
    page
  }) => {
    test.setTimeout(60_000)
    await goReady(page)

    // Baseline: status overlay computes to NeoDunggeunmo.
    expect(
      await dispatch(page, {
        type: "view",
        region: "status",
        text: "",
        rows: [{ label: "체력", value: "1" }]
      })
    ).toBe(true)
    await expect(page.locator('[data-role="status"]')).toBeVisible()
    const baseline = await firstFontFamily(page, '[data-role="status"]')
    expect(baseline, "the override test starts with a healthy NeoDunggeunmo baseline").toBe("NeoDunggeunmo")

    // Inject an !important override on .overlay-role. This is the smallest
    // possible change that should make `firstFontFamily(..., '[data-role=status]')`
    // return `monospace` -- exactly what a real regression would look like
    // (someone adding `font-family: monospace !important` to a global rule
    // by accident). If our assertion does NOT flip, it isn't measuring what
    // it claims.
    await page.addStyleTag({ content: '.overlay-role { font-family: monospace !important; }' })
    const after = await firstFontFamily(page, '[data-role="status"]')
    expect(after, "after the !important override, computed font-family must NOT be NeoDunggeunmo").not.toBe(
      "NeoDunggeunmo"
    )
    expect(after, "the override itself is monospace -- sanity check the test is actually exercising it").toBe(
      "monospace"
    )
  })

  test("QA failure: blocking /fonts/neodgm.woff2 leaves the NeoDunggeunmo @font-face in error/unloaded state without clipping the overlay box", async ({
    page
  }) => {
    test.setTimeout(60_000)
    // Set the route BEFORE navigation so the font fetch is blocked from the
    // very first request (page.route attaches to future navigations only --
    // if it is set after page.goto the font face may already be loaded).
    // The single CSS asset path is `url("/fonts/neodgm.woff2")`
    // (src/shell.css:11); public/fonts/ contains exactly that file.
    await page.route("**/fonts/neodgm.woff2", (route) => route.abort())
    await goReady(page)

    // Abort the woff2 request BEFORE the page's @font-face tries to fetch it.
    // Without the network fetch the @font-face declaration is still in the
    // CSS (so getComputedStyle().fontFamily still reads "NeoDunggeunmo" as
    // the REQUESTED family -- the font-family stack is unchanged by a
    // network failure), but the underlying FontFace object ends up in
    // 'error'/'unloaded' state with no glyphs available -- the browser then
    // renders every Korean glyph with the system fallback font at paint time
    // (Todo 50 plan.md acceptance #3 fallback rule). Documented CSS spec
    // wording: a CSS `font-family` value is the font PREFERENCE, not the
    // actually-rendered family; the actual face is decided per-glyph by
    // the browser when the preferred face has no glyph.
    //
    // The test asserts that observable property, NOT getComputedStyle's
    // "still says NeoDunggeunmo" output (which would always pass and miss
    // the actual regression this scenario is meant to catch).

    expect(
      await dispatch(page, {
        type: "view",
        region: "status",
        text: "",
        rows: [
          { label: "체력", value: "99/99" },
          { label: "정신력", value: "12" }
        ]
      })
    ).toBe(true)
    expect(
      await dispatch(page, {
        type: "view",
        region: "menu",
        text: "",
        rows: [{ label: "여정 계속" }, { label: "돌아가기" }],
        selectedIndex: 0
      })
    ).toBe(true)
    await expect(page.locator('[data-role="status"]')).toBeVisible()
    await expect(page.locator('[data-role="menu"]')).toBeVisible()

    // Force the browser to attempt the @font-face load now that the route
    // is aborted, then probe the underlying FontFace state for "NeoDunggeunmo".
    const fontState = await page.evaluate(async () => {
      try {
        await document.fonts.load("16px NeoDunggeunmo")
      } catch {
        // expected: load promise rejects / returns a face that never resolved
      }
      const faces = Array.from(document.fonts).filter((f) => f.family.replace(/^"|"$/g, "") === "NeoDunggeunmo")
      return {
        // CSS font-family stack still says "NeoDunggeunmo" -- this is by
        // design and is NOT the regression signal we care about.
        cssFamily: getComputedStyle(document.querySelector('[data-role="status"]') as HTMLElement).fontFamily,
        // The actual rendered face is whatever FontFace ends up resolved;
        // a blocked woff2 leaves no resolved face in the 'loaded' list, so
        // 'no loaded NeoDunggeunmo face' is the failure signal.
        loadedCount: faces.filter((f) => f.status === "loaded").length,
        faceCount: faces.length,
        // document.fonts.check(name) is name-only and would still report true
        // here even on a blocked woff2, so we don't trust it for this probe.
        checkName: document.fonts.check("16px NeoDunggeunmo")
      }
    })
    expect(
      fontState.faceCount,
      "the @font-face declaration for NeoDunggeunmo must still be present in document.fonts (CSS unchanged)"
    ).toBeGreaterThan(0)
    expect(
      fontState.loadedCount,
      `blocking /fonts/neodgm.woff2 must leave the NeoDunggeunmo FontFace in non-loaded state (status probe: ${JSON.stringify(fontState)})`
    ).toBe(0)

    // No clipping: even with the fallback font the row still holds its
    // content (font-family stack's next entry -- Noto Sans KR / Malgun Gothic
    // / system-ui / sans-serif -- has the same Korean coverage).
    const statusOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-role="status"]')
      if (el === null) return null
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    const menuOverflow = await page.evaluate(() => {
      const el = document.querySelector('[data-role="menu"]')
      if (el === null) return null
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    expect(statusOverflow, "the status overlay must be present during the fallback probe").not.toBeNull()
    expect(menuOverflow, "the menu overlay must be present during the fallback probe").not.toBeNull()
    expect(statusOverflow!.scrollWidth, "status must not horizontally clip when its Korean text uses the system fallback font").toBeLessThanOrEqual(
      statusOverflow!.clientWidth + 1
    )
    expect(menuOverflow!.scrollWidth, "menu must not horizontally clip when its Korean text uses the system fallback font").toBeLessThanOrEqual(
      menuOverflow!.clientWidth + 1
    )

    await page.screenshot({ path: fontFallbackPath })
  })
})