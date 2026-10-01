import { describe, expect, it } from "vitest"
import type { BridgeEvent } from "../../src/bridge/types.ts"
import { createIntroViewReceiver } from "../../src/overlay/intro-view.ts"
import {
  composeStatusRows,
  DEFAULT_STATUS_VIEW_DEPS,
  UNTRANSLATED_STATUS_MARK,
  type StatusViewDeps
} from "../../src/overlay/status-view.ts"

// Todo 27: the in-game status column's web view channel
// (vendor/xu4/src/stats.cpp EM_JS -> `Module.u4View.show("status", ...)`).
// Wire grammar: rows split by "\n"; a row is `label [\x1d value]`; each part is
// segments joined by "\x1e"; a segment is fields joined by "\x1f" =
// [template, ...args]. Template: "=<text>" = engine-composed layout (no
// translation), otherwise an xu4 code literal resolved through the status
// templates. Arg: "'<text>" = verbatim user data (player names), "=kind:English"
// = a named game object (weapon/armor/class/...), "@id" = a semantic id, else
// verbatim (numbers).

const TEMPLATES: Record<string, string> = {
  Weapons: "ui:stats:1",
  "%2d Torches": "ui:stats:2",
  " MP:%02d  LV:%d": "ui:stats:3",
  "W:%s": "ui:stats:4",
  "Pending Literal": "ui:stats:900"
}
const TABLE: Record<string, string> = {
  "ui:stats:1": "무기",
  "ui:stats:2": "%2d 횃불",
  "ui:stats:3": " 마력:%02d  레벨:%d",
  "ui:stats:4": "무기:%s"
}
const NAMES: Record<string, Record<string, string>> = {
  weapon: { Hands: "맨손", Dagger: "단검" },
  armor: { Skin: "맨몸" },
  class: { Mage: "마법사" },
  weaponAbbrev: { DAG: "단검" }
}
const deps: StatusViewDeps = {
  templateId: (literal) => TEMPLATES[literal],
  resolve: (id, fallback) => TABLE[id] ?? fallback,
  name: (kind, english) => NAMES[kind]?.[english]
}

describe("composeStatusRows", () => {
  it("translates a title literal and wraps it in the engine's arrow glyphs", () => {
    expect(composeStatusRows("=◂\x1eWeapons\x1e=▸", deps)).toEqual([{ label: "◂무기▸" }])
  })

  it("party rows carry label and value; the player name is user data and never translated", () => {
    const payload = "=%s%s%s\x1f1\x1f=mark:1\x1f'Avatar\x1d=%s %s\x1f150\x1f=status:G"
    expect(composeStatusRows(payload, deps)).toEqual([{ label: "1●Avatar", value: "150 양호" }])
    // A hostile/odd name that looks like a wire prefix or an On/Off value stays as typed.
    expect(composeStatusRows("=%s\x1f'@title.exe:introText:1", deps)).toEqual([{ label: "@title.exe:introText:1" }])
    expect(composeStatusRows("=%s\x1f'On", deps)).toEqual([{ label: "On" }])
    expect(composeStatusRows("=%s\x1f'=weapon:Dagger", deps)).toEqual([{ label: "=weapon:Dagger" }])
  })

  it("maps status letters and inactive markers, leaving unknown letters as they are", () => {
    expect(composeStatusRows("=%s%s\x1f=mark:0\x1f=status:P", deps)).toEqual([{ label: "-중독" }])
    expect(composeStatusRows("=%s\x1f=status:S", deps)).toEqual([{ label: "수면" }])
    expect(composeStatusRows("=%s\x1f=status:D", deps)).toEqual([{ label: "사망" }])
    expect(composeStatusRows("=%s\x1f=status:Z", deps)).toEqual([{ label: "Z" }])
  })

  it("resolves named objects per field and falls back to the English module string when unmapped", () => {
    expect(composeStatusRows("W:%s\x1f=weapon:Dagger", deps)).toEqual([{ label: "무기:단검" }])
    expect(composeStatusRows("=W:%s\x1f=weapon:Dagger", deps)).toEqual([{ label: "W:단검" }])
    expect(composeStatusRows("=A:%s\x1f=armor:Skin", deps)).toEqual([{ label: "A:맨몸" }])
    expect(composeStatusRows("=%s\x1f=class:Mage", deps)).toEqual([{ label: "마법사" }])
    expect(composeStatusRows("=%s\x1f=weaponAbbrev:DAG", deps)).toEqual([{ label: "단검" }])
    expect(composeStatusRows("=%s\x1f=weapon:Blorp", deps)).toEqual([{ label: "Blorp" }])
    expect(composeStatusRows("=%s\x1f=armor:Nothing", deps)).toEqual([{ label: "Nothing" }])
  })

  it("resolves inventoried label literals with numeric args, keeping the engine's spacing", () => {
    expect(composeStatusRows("%2d Torches\x1f 3", deps)).toEqual([{ label: " 3 횃불" }])
    expect(composeStatusRows(" MP:%02d  LV:%d\x1f05\x1f2", deps)).toEqual([{ label: " 마력:05  레벨:2" }])
    expect(composeStatusRows("W:%s\x1f=weapon:Hands", deps)).toEqual([{ label: "무기:맨손" }])
  })

  it("substitutes %c tokens too (mixtures rows: letter + count)", () => {
    TEMPLATES["%c-%02d"] = "ui:stats:25"
    TABLE["ui:stats:25"] = "%c-%02d"
    expect(composeStatusRows("%c-%02d\x1fA\x1f07", deps)).toEqual([{ label: "A-07" }])
  })

  it("keeps empty rows as slots and item names local to the xu4 name table", () => {
    expect(composeStatusRows("=%s\x1f=item:Bell\n\n=%s\x1f=sex:12", deps)).toEqual([
      { label: "종" },
      { label: "" },
      { label: "여" }
    ])
  })

  it("an empty payload has no rows; a literal with no ready translation is marked", () => {
    expect(composeStatusRows("", deps)).toEqual([])
    expect(composeStatusRows("Pending Literal", deps)).toEqual([{ label: "[영문] Pending Literal" }])
  })
})

describe("status region on the view receiver", () => {
  function setup() {
    const events: BridgeEvent[] = []
    const receiver = createIntroViewReceiver({
      dispatch: (event) => {
        events.push(event)
        return true
      },
      deps: { templateId: () => undefined, resolve: (_id, fallback) => fallback },
      statusDeps: deps
    })
    return { events, receiver }
  }
  const party = "=%s%s%s\x1f1\x1f=mark:1\x1f'Avatar\x1d=%s %s\x1f150\x1f=status:G"

  it("routes status payloads through the status composer with the engine's rect and selectedIndex", () => {
    const { events, receiver } = setup()
    receiver.show("status", 192, 8, 120, 64, 0, party)
    expect(events).toEqual([
      {
        abiVersion: 1,
        type: "view",
        region: "status",
        text: "1●Avatar",
        rows: [{ label: "1●Avatar", value: "150 양호" }],
        selectedIndex: 0,
        rect: { x: 192, y: 8, width: 120, height: 64 }
      }
    ])
  })

  it("dedupes identical status payloads (flash cycles redraw the same rows) until something changes", () => {
    const { events, receiver } = setup()
    receiver.show("status", 192, 8, 120, 64, -1, party)
    receiver.show("status", 192, 8, 120, 64, -1, party)
    receiver.show("status", 192, 8, 120, 64, -1, party)
    expect(events).toHaveLength(1)
    receiver.show("status", 192, 8, 120, 64, 0, party) // selection moved
    expect(events).toHaveLength(2)
    receiver.show("status", 192, 0, 120, 72, 0, party) // rect changed
    expect(events).toHaveLength(3)
    receiver.show("status", 192, 0, 120, 72, 0, party.replace("150", "149")) // rows changed
    expect(events).toHaveLength(4)
  })

  it("hide() resets the dedupe so a re-show after a hide is never swallowed", () => {
    const { events, receiver } = setup()
    receiver.show("status", 192, 8, 120, 64, -1, party)
    receiver.hide("status")
    receiver.show("status", 192, 8, 120, 64, -1, party)
    expect(events.map((event) => (event.type === "view" ? event.text === "" : null))).toEqual([false, true, false])
  })

  it("does not dedupe the intro regions (their engine side already sends one event per redraw)", () => {
    const { events, receiver } = setup()
    receiver.show("menu", 8, 104, 304, 88, -1, "x")
    receiver.show("menu", 8, 104, 304, 88, -1, "x")
    expect(events).toHaveLength(2)
  })
})

// Todo 31: the food/gold summary row and the reagents title.
describe("statussummary region (Todo 31)", () => {
  const SUMMARY_TEMPLATES: Record<string, string> = {
    "F:%04d   G:%04d": "ui:stats:1",
    "F:%04d   SHP:%02d": "ui:stats:0",
    Reagents: "ui:stats:23"
  }
  const SUMMARY_TABLE: Record<string, string> = {
    "ui:stats:1": "음식:%04d  금:%04d",
    "ui:stats:0": "음식:%04d  선체:%02d",
    "ui:stats:23": "시약"
  }
  const summaryDeps: StatusViewDeps = {
    templateId: (literal) => SUMMARY_TEMPLATES[literal],
    resolve: (id, fallback) => SUMMARY_TABLE[id] ?? fallback,
    name: () => undefined
  }

  it("composes the food/gold summary into Korean, substituting both numbers in order", () => {
    expect(composeStatusRows("F:%04d   G:%04d\x1f0500\x1f0300", summaryDeps)).toEqual([
      { label: "음식:0500  금:0300" }
    ])
  })

  it("composes the ship-hull variant of the summary too", () => {
    expect(composeStatusRows("F:%04d   SHP:%02d\x1f0500\x1f30", summaryDeps)).toEqual([
      { label: "음식:0500  선체:30" }
    ])
  })

  it("composes the reagents title into Korean (ui:stats:23)", () => {
    expect(composeStatusRows("Reagents", summaryDeps)).toEqual([{ label: "시약" }])
  })

  it("routes the statussummary region through the STATUS composer, not the intro one", () => {
    const events: BridgeEvent[] = []
    const receiver = createIntroViewReceiver({
      dispatch: (event: BridgeEvent) => {
        events.push(event)
        return true
      }
    })
    receiver.show("statussummary", 192, 80, 120, 8, -1, "F:%04d   G:%04d\x1f0500\x1f0300")
    const view = events.at(-1)
    expect(view?.type).toBe("view")
    if (view?.type !== "view") {
      throw new Error("expected a view event")
    }
    expect(view.region).toBe("statussummary")
    expect(view.rows).toEqual([{ label: "음식:0500  금:0300" }])
    expect(view.rect).toEqual({ x: 192, y: 80, width: 120, height: 8 })
  })
})

// Todo 33: the eight reagent ROWS of the Ztats Reagents view, asserted Korean
// and not just the title. Their English comes from
// vendor/xu4/src/names.cpp getReagentName()'s reagentNames[] table, which the
// generator maps into GENERATED_STATUS_NAMES as the `reagent` field, so the
// engine sends each row's name as a `=kind:reagent:<English>` argument exactly
// as it sends `=kind:weapon:<English>` -- no dedicated overlay code path.
//
// These use DEFAULT_STATUS_VIEW_DEPS, i.e. the REAL generated tables plus the
// real locales/ko/ui.json and locales/ko/glossary.json, so this test fails if
// any one of the eight names is left English.
const REAGENT_ROWS: [string, string, string][] = [
  ["A", "Sulfur Ash", "유황재"],
  ["B", "Ginseng", "인삼"],
  ["C", "Garlic", "마늘"],
  ["D", "Spider Silk", "거미줄"],
  ["E", "Blood Moss", "핏빛이끼"],
  ["F", "Black Pearl", "흑진주"],
  ["G", "Nightshade", "벨라도나"],
  ["H", "Mandrake", "맨드레이크"]
]

// StatsArea::showReagents() as the web build will send it once the rows leave
// the native raster: the title row, then one row per reagent -- the 'A'..'H'
// shortcut char mainArea::textAtKey draws, then the `-<name padded to 11>%2d`
// menu item label (stats.cpp:253, getReagentName() + MENU_OUTPUT_REAGENT's
// count), with the reagent name as a named-object argument.
const REAGENTS_PAYLOAD =
  "=│\x1eReagents\x1e=│\n" +
  REAGENT_ROWS.map(
    ([shortcut, english], index) => `=%s-%s %s\x1f${shortcut}\x1f=reagent:${english}\x1f${String(index)}`
  ).join("\n")

describe("the Ztats Reagents rows (Todo 33)", () => {
  it("composes all eight reagent rows into Korean, under the Korean title", () => {
    expect(composeStatusRows(REAGENTS_PAYLOAD, DEFAULT_STATUS_VIEW_DEPS)).toEqual([
      { label: "│시약│" },
      ...REAGENT_ROWS.map(([shortcut, , korean], index) => ({ label: `${shortcut}-${korean} ${index}` }))
    ])
  })

  it("keeps every one of the eight English names out of the rendered rows", () => {
    const rendered = composeStatusRows(REAGENTS_PAYLOAD, DEFAULT_STATUS_VIEW_DEPS)
      .map((row) => row.label)
      .join("\n")
    for (const [, english] of REAGENT_ROWS) {
      expect(rendered, english).not.toContain(english)
    }
    // A reagent name is a value, not a template: no [영문] marker either.
    expect(rendered).not.toContain(UNTRANSLATED_STATUS_MARK)
  })

  it("resolves a reagent argument through the named-object path, like weapon/armour", () => {
    // One row in isolation: kind is dispatched by prefix, so nothing about the
    // eight-row payload above is special.
    expect(composeStatusRows("=%s\x1f=reagent:Mandrake", DEFAULT_STATUS_VIEW_DEPS)).toEqual([{ label: "맨드레이크" }])
    // An unmapped reagent name still falls back to the open-source English
    // string instead of dropping the row (status-fallback.test.ts's contract).
    expect(composeStatusRows("=%s\x1f=reagent:Bloodmoss", DEFAULT_STATUS_VIEW_DEPS)).toEqual([{ label: "Bloodmoss" }])
  })
})
