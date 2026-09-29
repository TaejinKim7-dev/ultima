import { describe, expect, it } from "vitest"
import type { BridgeEvent } from "../../src/bridge/types.ts"
import { createIntroViewReceiver } from "../../src/overlay/intro-view.ts"
import { composeStatusRows, type StatusViewDeps } from "../../src/overlay/status-view.ts"

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
        text: "1●Avatar 150 양호",
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
