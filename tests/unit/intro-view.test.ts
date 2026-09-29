import { describe, expect, it } from "vitest"
import type { BridgeEvent } from "../../src/bridge/types.ts"
import {
  MISSING_INTRO_TRANSLATION,
  UNTRANSLATED_LITERAL_MARK,
  composeIntroRows,
  createIntroViewReceiver,
  type IntroViewDeps
} from "../../src/overlay/intro-view.ts"

// Todo 26: the intro's web view channel (vendor/xu4/src/intro.cpp EM_JS ->
// `Module.u4View.show/hide`) sends each screen as rows of "template
// [+ args]" where TITLE.EXE-backed text arrives as "@title.exe:..." ids
// (the original English never leaves the engine) and xu4's own open-source
// code literals arrive verbatim (resolved through the intro templates).
// Row grammar: rows split by "\n"; a row is segments joined by "\x1e"; a
// segment is fields joined by "\x1f" = [template-or-@id, ...args].

const TEMPLATES: Record<string, string> = {
  "Journey Onward": "ui:intro:59",
  "\b Video Options": "ui:intro:0",
  "Game Enhancements         %s": "ui:intro:4",
  "Scale                x%d": "ui:intro:9",
  "%s and": "ui:intro:66",
  " %s.  She says": "ui:intro:67",
  "Pending Literal": "ui:intro:900"
}
const TABLE: Record<string, string> = {
  "ui:intro:59": "여정을 계속하다",
  "ui:intro:0": "\b 영상 옵션",
  "ui:intro:4": "게임 개선 기능       %s",
  "ui:intro:9": "배율                 x%d",
  "ui:intro:66": "%s, 그리고",
  "ui:intro:67": " %s. 그녀가 말한다",
  "title.exe:introText:0": "첫 줄\n둘째 줄\n셋째 줄",
  "title.exe:introGypsy:5": "자비",
  "title.exe:introGypsy:6": "용맹"
}
const deps: IntroViewDeps = {
  templateId: (literal) => TEMPLATES[literal],
  resolve: (id, fallback) => TABLE[id] ?? fallback
}

describe("composeIntroRows", () => {
  it("translates a known code literal through its template id", () => {
    expect(composeIntroRows("Journey Onward", deps)).toEqual([{ label: "여정을 계속하다" }])
  })

  it("maps the engine's arrow/cursor glyph control characters to visible glyphs", () => {
    expect(composeIntroRows("\b Video Options", deps)).toEqual([{ label: "▸ 영상 옵션" }])
  })

  it("substitutes value arguments for %s / %d tokens, translating On/Off style values", () => {
    expect(composeIntroRows("Game Enhancements         %s\x1fOn", deps)).toEqual([
      { label: "게임 개선 기능       켬" }
    ])
    expect(composeIntroRows("Game Enhancements         %s\x1fOff", deps)).toEqual([
      { label: "게임 개선 기능       끔" }
    ])
    expect(composeIntroRows("Scale                x%d\x1f3", deps)).toEqual([{ label: "배율                 x3" }])
  })

  it("resolves an @id row to Korean and splits multi-line translations into rows", () => {
    expect(composeIntroRows("@title.exe:introText:0", deps)).toEqual([
      { label: "첫 줄" },
      { label: "둘째 줄" },
      { label: "셋째 줄" }
    ])
  })

  it("keeps empty rows so menu rows stay at their native y positions", () => {
    expect(composeIntroRows("Journey Onward\n\nJourney Onward", deps).map((row) => row.label)).toEqual([
      "여정을 계속하다",
      "",
      "여정을 계속하다"
    ])
  })

  it("joins the segments of one row (the gypsy 'A and B. She says' line) and resolves @id arguments", () => {
    const payload = "%s and\x1f@title.exe:introGypsy:5\x1e %s.  She says\x1f@title.exe:introGypsy:6"
    expect(composeIntroRows(payload, deps)).toEqual([{ label: "자비, 그리고 용맹. 그녀가 말한다" }])
  })

  it("an @id without a ready translation shows a marked fallback naming the id, never English", () => {
    const rows = composeIntroRows("@title.exe:introText:999", deps)
    expect(rows).toEqual([{ label: `${MISSING_INTRO_TRANSLATION} title.exe:introText:999` }])
  })

  it("a literal with no template shows the marked English literal (open-source xu4 text)", () => {
    expect(composeIntroRows("Some new literal", deps)).toEqual([
      { label: `${UNTRANSLATED_LITERAL_MARK}Some new literal` }
    ])
  })

  it("a literal whose translation is still pending shows the marked English literal", () => {
    expect(composeIntroRows("Pending Literal", deps)).toEqual([
      { label: `${UNTRANSLATED_LITERAL_MARK}Pending Literal` }
    ])
  })
})

describe("createIntroViewReceiver", () => {
  function setup() {
    const events: BridgeEvent[] = []
    const receiver = createIntroViewReceiver({
      dispatch: (event) => {
        events.push(event)
        return true
      },
      deps
    })
    return { events, receiver }
  }

  it("show() dispatches one view event with the native rect, rows, text and selectedIndex", () => {
    const { events, receiver } = setup()
    receiver.show("textview", 16, 80, 288, 104, 1, "Journey Onward\nJourney Onward")
    expect(events).toEqual([
      {
        abiVersion: 1,
        type: "view",
        region: "textview",
        text: "여정을 계속하다\n여정을 계속하다",
        rows: [{ label: "여정을 계속하다" }, { label: "여정을 계속하다" }],
        selectedIndex: 1,
        rect: { x: 16, y: 80, width: 288, height: 104 }
      }
    ])
  })

  it("a negative selectedIndex means no selection (omitted from the event)", () => {
    const { events, receiver } = setup()
    receiver.show("menu", 8, 104, 304, 88, -1, "Journey Onward")
    expect(events[0]).not.toHaveProperty("selectedIndex")
  })

  it("hide() dispatches an empty view event, which the shell treats as removing the overlay", () => {
    const { events, receiver } = setup()
    receiver.hide("menu")
    expect(events).toEqual([{ abiVersion: 1, type: "view", region: "menu", text: "" }])
  })

  it("ignores unknown regions and non-integer geometry instead of dispatching a malformed event", () => {
    const { events, receiver } = setup()
    receiver.show("bogus", 0, 0, 10, 10, 0, "Journey Onward")
    receiver.show("menu", Number.NaN, 0, 10, 10, 0, "Journey Onward")
    receiver.hide("bogus")
    expect(events).toEqual([])
  })
})
