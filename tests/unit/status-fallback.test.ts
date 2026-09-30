import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { GENERATED_STATUS_NAMES } from "../../src/i18n/generated/strings.ts"
import { resolveStatusName } from "../../src/i18n/localization.ts"
import { DEFAULT_STATUS_VIEW_DEPS, UNTRANSLATED_STATUS_MARK, composeStatusRows } from "../../src/overlay/status-view.ts"

// Todo 27 QA failure scenario (.omo/plans/ultima-web.md entry 27):
//   "a config name missing from the map falls back to the English module
//    string (open source) without breaking the view"
// Weapon/armour/class names come from the module config
// (vendor/xu4/module/Ultima-IV/config.b) and are translated through the
// field-scoped GENERATED_STATUS_NAMES map. That map is deliberately narrow:
// the class field only carries the eight playable creature ids, so a town's
// "Bard" cannot shadow the Bard class, and a name whose translation is still
// pending is not emitted at all. Both routes end in
// `resolveStatusName() === undefined`, and the composer then renders the
// open-source English string verbatim -- a config name is a *value*, not a
// template, so it is not marked with UNTRANSLATED_STATUS_MARK (that mark is
// reserved for an uninventoried stats.cpp literal) and the row is never
// dropped, never mislaid, and composeStatusRows throws nothing.
//
// Every literal below is a REAL ui:stats literal and every name a REAL
// config.b name, so this doubles as a guard that the shipped corpus stays
// mapped and that the wire format still composes. The test writes its own
// evidence transcript, the repo convention (see tests/e2e/shell-ready.spec.ts
// -> shell-ready.json and the other .omo/evidence/ultima-web/task-<n>/ writers).

const EVIDENCE = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-27/fallback.log", import.meta.url))

/** The generated field-scoped map entry for a config.b name, or undefined. */
function statusId(kind: string, english: string): string | undefined {
  const byKind = GENERATED_STATUS_NAMES[kind]
  return byKind !== undefined ? byKind[english] : undefined
}

/** Real `module:Ultima-IV:config:<n>` ids that ARE mapped (open-source config.b names). */
const MAPPED = [
  { kind: "weapon", english: "Dagger" },
  { kind: "armor", english: "Chain Mail" },
  { kind: "class", english: "Mage" }
] as const

/**
 * Real config.b names the map does not carry. "Guard" is a creature entry
 * after the eight playable ids (the class field stops at id 9 so the town's
 * second "Bard" cannot shadow the class); "Slime" is far past it.
 */
const UNMAPPED = [
  { kind: "class", english: "Guard" },
  { kind: "class", english: "Slime" }
] as const

// One StatsArea::showPlayerDetails() payload as vendor/xu4/src/stats.cpp sends
// it: the player's name as the title, the sex/class row (row 1 -- the class
// name is unmapped here), the row native row 1 leaves blank, then the four
// stat rows and the weapon/armour rows. An empty row keeps its native y slot.
const DETAILS =
  "=◂\x1e=%s\x1f'Avatar\x1e=▸\n" +
  "=%s %s\x1f=sex:11\x1f=class:Guard\n" +
  "\n" +
  " MP:%02d  LV:%d\x1f05\x1f2\n" +
  "STR:%02d  HP:%04d\x1f05\x1f0250\n" +
  "DEX:%02d  HM:%04d\x1f07\x1f0350\n" +
  "W:%s\x1f=weapon:Dagger\n" +
  "A:%s\x1f=armor:Chain Mail"

const EXPECTED = [
  { label: "◂Avatar▸" },
  { label: "남 Guard" },
  { label: "" },
  { label: " 마력:05  레벨:2" },
  { label: "힘:05  체력:0250" },
  { label: "민첩:07  최대체력:0350" },
  { label: "무기:단검" },
  { label: "갑옷:사슬 갑옷" }
]

describe("a config name missing from the status name map", () => {
  it("returns undefined from resolveStatusName for a real unmapped config.b name", () => {
    for (const { kind, english } of UNMAPPED) {
      // Not a fabricated kind/name: the generated map really has no entry.
      expect(statusId(kind, english), `${kind}:${english} is in the map`).toBeUndefined()
      expect(resolveStatusName(kind, english), `${kind}:${english}`).toBeUndefined()
    }
  })

  it("also returns undefined when a mapped id's translation is not ready yet", () => {
    // Same real id as the mapped Dagger row, with no ready entry: a pending
    // translation must read exactly like a name that was never mapped.
    const dagger = statusId("weapon", "Dagger")
    expect(dagger).toMatch(/^module:Ultima-IV:config:\d+$/)
    expect(resolveStatusName("weapon", "Dagger", GENERATED_STATUS_NAMES, {})).toBeUndefined()
  })

  it("renders the English module string verbatim in the compose path, keeping the row", () => {
    expect(composeStatusRows("=%s %s\x1f=sex:11\x1f=class:Guard", DEFAULT_STATUS_VIEW_DEPS)).toEqual([
      { label: "남 Guard" }
    ])
    expect(composeStatusRows("=%s\x1f=class:Slime", DEFAULT_STATUS_VIEW_DEPS)).toEqual([{ label: "Slime" }])
    // A value, not a template: no [영문] marker, no dropped row, no throw.
    const [classRow] = composeStatusRows("=%s %s\x1f=sex:11\x1f=class:Guard", DEFAULT_STATUS_VIEW_DEPS)
    expect(classRow?.label ?? "").not.toContain(UNTRANSLATED_STATUS_MARK)
  })

  it("does not break the rest of the view: mapped rows stay Korean, slots and names survive", () => {
    const rows = composeStatusRows(DETAILS, DEFAULT_STATUS_VIEW_DEPS)
    expect(rows).toHaveLength(DETAILS.split("\n").length)
    expect(rows).toEqual(EXPECTED)
    // Every mapped config name in the same view is still Korean.
    for (const { kind, english } of MAPPED) {
      expect(resolveStatusName(kind, english), `${kind}:${english}`).toBeTypeOf("string")
    }
  })

  it("writes the QA failure-scenario transcript as evidence", () => {
    const mappedRows = MAPPED.map(
      ({ kind, english }) =>
        `    ${kind}:${english} -> ${String(statusId(kind, english))} -> ${resolveStatusName(kind, english)}`
    )
    const unmappedRows = UNMAPPED.map(
      ({ kind, english }) => `    ${kind}:${english} -> (no id in the map) -> ${String(resolveStatusName(kind, english))}`
    )
    const renderedRows = composeStatusRows(DETAILS, DEFAULT_STATUS_VIEW_DEPS).map(
      (row, index) => `    row ${index}: ${JSON.stringify(row)}`
    )
    const transcript = [
      "Todo 27 QA failure scenario: a config name missing from the map falls back",
      "to the English module string (open source) without breaking the view.",
      "Source:   .omo/plans/ultima-web.md entry 27, QA scenarios.",
      "Produced: tests/unit/status-fallback.test.ts (the test writes its own evidence).",
      "Command:  npm run test:unit -- tests/unit/status-fallback.test.ts",
      "TDD:      .omo/evidence/ultima-web/task-27/red-status-fallback.log,",
      "          .omo/evidence/ultima-web/task-27/green-status-fallback.log",
      "",
      "NAME SOURCE: vendor/xu4/module/Ultima-IV/config.b (open-source xu4 module",
      "config, not original game data) -> `module:Ultima-IV:config:<n>` through",
      "scripts/i18n-generate.mjs's extractStatusNames(), field-scoped so a weapon",
      "abbreviation stays distinct from its full name and the class field stops at",
      'creature id 9 (so the town\'s second "Bard" cannot shadow the Bard class).',
      "",
      "MAPPED (ready Korean translation):",
      ...mappedRows,
      "",
      "UNMAPPED (no id in the map; resolveStatusName returns undefined):",
      ...unmappedRows,
      "    weapon:Dagger with no ready entry (pending translation) -> undefined",
      "",
      "RENDERED VIEW (StatsArea::showPlayerDetails() payload, DEFAULT_STATUS_VIEW_DEPS):",
      '    payload row 1 is "=%s %s / =sex:11 / =class:Guard" -- sex 11 and the class',
      "    name are the substituted arguments of one row; Guard is unmapped.",
      ...renderedRows,
      "",
      "RESULT: the unmapped row is kept and shows the English config.b name",
      'verbatim ("남 Guard"); the [영문] marker is NOT applied, because it is',
      "reserved for an uninventoried stats.cpp literal while a config name is a",
      "value like any other substitution argument (like the unknown status letter",
      "Z or the unknown item word). Nothing else changed: mapped rows stay Korean",
      "(무기:단검, 갑옷:사슬 갑옷), the blank native row keeps its slot, the player's",
      "name passes through untranslated, all 8 rows are emitted and",
      "composeStatusRows throws nothing.",
      ""
    ].join("\n")
    mkdirSync(dirname(EVIDENCE), { recursive: true })
    writeFileSync(EVIDENCE, transcript, "utf8")
    expect(transcript).toContain("class:Guard -> (no id in the map) -> undefined")
    expect(transcript).toContain('"label":"남 Guard"')
  })
})
