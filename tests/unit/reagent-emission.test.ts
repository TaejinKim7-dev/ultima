/*
 * Todo 33: the Ztats Reagents ROWS must reach the web overlay.
 *
 * Todo 31 shipped the Korean title by calling WebStatus::titleOnly(), which
 * sent just the 1-row title strip (192,0,120,8) so the opaque box could not
 * cover the eight reagent rows that stayed in the native raster in English.
 * That was correct while getReagentName() had no Korean entry; the data side
 * of Todo 33 (commit c65f768) added the `reagent` field to
 * GENERATED_STATUS_NAMES, so the rows can go out too and the whole box
 * (192,0,120,72) can be sent.
 *
 * The receiver needs no change: src/overlay/status-view.ts's resolveObject()
 * falls through to deps.name(kind, value) -> resolveStatusName(), which reads
 * GENERATED_STATUS_NAMES, and tests/unit/status-view.test.ts already pins the
 * composed result of exactly this wire shape. What was missing was the
 * SENDER, so that is what this file pins: vendor/xu4/src/stats.cpp's
 * showReagents() must emit one row per visible menu item in the same order,
 * with the same shortcut letter, the same name (as a `=reagent:` named-object
 * argument) and the same count, and must no longer call titleOnly().
 *
 * The native path (everything outside `#ifdef __EMSCRIPTEN__`) is snapshotted
 * as one whitespace-collapsed string compared against a literal of the
 * pre-change text, because it must stay byte-identical: the rows are still
 * rasterized in English for the non-web build.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { AVATAR_AURA_GLYPH_RECT } from "../../src/overlay/overlay-layout.ts"

const STATS_SOURCE = fileURLToPath(new URL("../../vendor/xu4/src/stats.cpp", import.meta.url))
const EVIDENCE = fileURLToPath(
  new URL("../../.omo/evidence/ultima-web/task-33/reagent-emission.log", import.meta.url)
)

const source = readFileSync(STATS_SOURCE, "utf8")

/** The `{ ... }` body of a `void StatsArea::name(...)` definition, braces matched. */
function functionBody(qualifiedName: string): string {
  const start = source.indexOf(`StatsArea::${qualifiedName}(`)
  expect(start, `StatsArea::${qualifiedName}() is defined in stats.cpp`).toBeGreaterThan(-1)
  const open = source.indexOf("{", start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1
    if (source[i] === "}") {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  throw new Error(`StatsArea::${qualifiedName}() has no closing brace`)
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

/**
 * Splits a function body's lines into the `#ifdef __EMSCRIPTEN__` regions and
 * everything else, with comments and blank lines dropped. The preprocessor
 * lines themselves belong to neither half.
 */
function partitionLines(body: string): { emscripten: string[]; native: string[] } {
  const emscripten: string[] = []
  const native: string[] = []
  let inside = false
  for (const row of stripComments(body).split("\n")) {
    const trimmed = row.trim()
    if (trimmed.length === 0) continue
    if (trimmed.startsWith("#")) {
      inside = trimmed === "#ifdef __EMSCRIPTEN__"
      continue
    }
    ;(inside ? emscripten : native).push(trimmed)
  }
  return { emscripten, native }
}

const body = functionBody("showReagents")
const { emscripten, native: nativeLines } = partitionLines(body)
const emscriptenText = emscripten.join("\n")
/** The whole native half, whitespace collapsed: order- and text-sensitive. */
const nativeText = nativeLines.join(" ").replace(/\s+/g, " ").trim()

// The exact emission the shell composes in status-view.test.ts:
//   `=%s-%s %s` + [shortcut letter, `=reagent:<English>`, count]
//   -> "A-유황재 0" ... "H-맨드레이크 7"
const EMISSION =
  /webStatus\.add\(\s*line,\s*WebStatus::seg\(\s*"%s-%s %s",\s*WebStatus::letter\('A'\s*\+\s*r\),\s*std::string\("=reagent:"\)\s*\+\s*getReagentName\(\(Reagent\)\s*r\),\s*WebStatus::num\("%d",\s*c->saveGame->reagents\[r\]\)\s*\)\s*\);/

const NATIVE_BASELINE =
  'setTitle("Reagents"); Menu::MenuItemList::iterator i; int line = 0, r = REAG_ASH; ' +
  "char shortcut[2]; shortcut[1] = '\\0'; reagentsMixMenu.show(&mainArea); " +
  "for (i = reagentsMixMenu.begin(); i != reagentsMixMenu.end(); i++, r++) { " +
  "if ((*i)->isVisible()) { shortcut[0] = 'A'+r; " +
  "if (active) mainArea.textAtKey(0, line++, shortcut, 0); " +
  "else mainArea.textAt(0, line++, shortcut); } }"

describe("StatsArea::showReagents() web emission (Todo 33)", () => {
  it("sends one row per visible reagent: shortcut letter, =reagent: name and count", () => {
    expect(emscriptenText).toMatch(EMISSION)
  })

  it("emits at the row index the native raster uses, before mainArea.textAt() claims it", () => {
    // `line` is 0-based over the VISIBLE items (resetReagentsMenu() packs the
    // visible ones at y = 0, 1, 2...), and add() shifts it by the title row, so
    // the row must be emitted with the pre-increment `line`.
    const emission = body.indexOf("webStatus.add(line,")
    const nativeRow = body.indexOf("mainArea.textAtKey(0, line++,")
    expect(emission).toBeGreaterThan(-1)
    expect(nativeRow).toBeGreaterThan(-1)
    expect(emission).toBeLessThan(nativeRow)
    // ...and the letter is the ABSOLUTE reagent index 'A'+r (r counts every
    // item, visible or not), not the visible row number: owning only Sulfur
    // Ash and Garlic is rows "A-" and "C-", never "A-" and "B-".
    expect(emscriptenText).toContain("WebStatus::letter('A'+r)")
  })

  it("keeps the Korean title (ui:stats:23 = \"시약\") and drops titleOnly()", () => {
    expect(emscriptenText).toContain('webStatus.title(WebStatus::seg("Reagents"))')
    // titleOnly() sent the 1-row title strip only, which is exactly what kept
    // the eight English rows visible. With the rows emitted it is dead: the
    // titled flush now sends the whole mainArea box.
    expect(emscriptenText).not.toContain("titleOnly")
    // ...and the escape hatch itself is gone: comments are stripped first, so
    // a comment may still explain why it went away.
    expect(stripComments(source)).not.toContain("titleOnly")
  })

  it("leaves the native path byte-identical (nothing added outside __EMSCRIPTEN__)", () => {
    expect(nativeText).toBe(NATIVE_BASELINE)
  })
})

describe("the titled status box still stops above the avatar aura glyph (Todo 33)", () => {
  it("sends mainArea grown by the title row, and that box stops above the aura cell", () => {
    // WebStatus::flush()'s titled branch, which titleOnly() used to bypass:
    //   u4_web_status_show(mainArea.x, mainArea.y - CHAR_HEIGHT,
    //                      mainArea.width, mainArea.height + CHAR_HEIGHT, ...)
    expect(source).toContain("mainArea.height + CHAR_HEIGHT")
    // mainArea is (STATS_AREA_X*CHAR_WIDTH, STATS_AREA_Y*CHAR_HEIGHT,
    // STATS_AREA_WIDTH, STATS_AREA_HEIGHT), so the titled box bottom is
    // (STATS_AREA_Y + STATS_AREA_HEIGHT) * CHAR_HEIGHT = 9 * 8 = 72, while the
    // aura glyph cell the shell reserves starts at y = 80. The opaque box
    // therefore covers the English reagent rows without reaching the glyph --
    // the invariant tests/unit/overlay-layout.test.ts pins for every opaque
    // role, here re-derived from stats.h's real constants.
    const headerOf = (name: string): string =>
      readFileSync(
        fileURLToPath(new URL(`../../vendor/xu4/src/${name}`, import.meta.url)),
        "utf8"
      )
    // stats.h's STATS_AREA_* are the mainArea's constructor arguments, and
    // STATS_AREA_X is itself TEXT_AREA_X, so the values are resolved through
    // the #defines rather than hard-coded.
    const defines = new Map<string, string>()
    for (const header of ["stats.h", "textview.h", "u4.h"]) {
      for (const [, name, value] of headerOf(header).matchAll(/#define\s+(\w+)\s+([^\n/]+)/g)) {
        defines.set(name as string, (value as string).trim())
      }
    }
    const cell = (name: string, seen = new Set<string>()): number => {
      const value = defines.get(name)
      if (value === undefined) return 0
      if (/^\d+$/.test(value)) return Number(value)
      if (seen.has(name)) return 0
      seen.add(name)
      return cell(value, seen)
    }
    const titled = {
      x: cell("STATS_AREA_X") * cell("CHAR_WIDTH"),
      y: (cell("STATS_AREA_Y") - 1) * cell("CHAR_HEIGHT"),
      width: cell("STATS_AREA_WIDTH") * cell("CHAR_WIDTH"),
      height: (cell("STATS_AREA_HEIGHT") + 1) * cell("CHAR_HEIGHT")
    }
    expect(titled).toEqual({ x: 192, y: 0, width: 120, height: 72 })
    expect(titled.y + titled.height).toBeLessThanOrEqual(AVATAR_AURA_GLYPH_RECT.y)
  })
})

const transcript = [
  "Todo 33: StatsArea::showReagents() web emission (vendor/xu4/src/stats.cpp)",
  "",
  "EMITSCRIPTEN LINES (web build only):",
  ...emscripten.map((line) => `    | ${line}`),
  "",
  "NATIVE LINES (identical before and after, non-web build):",
  ...nativeLines.map((line) => `    ${line}`),
  "",
  "RESULT: one web row per VISIBLE menu item, in menu order, at the row index",
  "the native raster uses (`line`, before its increment), with the shortcut",
  "letter 'A'+r (r = absolute reagent index), the name as `=reagent:<English>`",
  "(resolved by the shell through GENERATED_STATUS_NAMES -> locales/ko",
  "glossary.json) and the reagent count. titleOnly() is gone, so the titled",
  "flush sends the whole mainArea box (192,0,120,72) instead of a 1-row",
  "title strip; the opaque overlay covers the English rows the native raster",
  "still draws, and the box bottom (72) stays above the aura glyph cell (80)."
].join("\n")

describe("the emission evidence transcript (Todo 33)", () => {
  it("records both halves of showReagents()", () => {
    mkdirSync(dirname(EVIDENCE), { recursive: true })
    writeFileSync(EVIDENCE, `${transcript}\n`, "utf8")
    expect(transcript).toContain('webStatus.add(line, WebStatus::seg("%s-%s %s",')
    expect(transcript).toContain('std::string("=reagent:") +')
    expect(transcript).toContain("reagentsMixMenu.show(&mainArea)")
    // The native half is the pre-change text, verbatim.
    expect(transcript).toContain("mainArea.textAtKey(0, line++, shortcut, 0)")
    expect(transcript).toContain("else")
    expect(transcript).toContain("mainArea.textAt(0, line++, shortcut)")
  })
})
