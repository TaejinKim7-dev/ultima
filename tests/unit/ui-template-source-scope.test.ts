import { describe, expect, it } from "vitest"
import { GENERATED_STATUS_TEMPLATES, GENERATED_UI_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { generateI18nTables } from "../../scripts/i18n-generate.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import uiSchema from "../../locales/ko/ui.json" with { type: "json" }

// Todo 27 follow-up: vendor/xu4/src/stats.cpp now draws the status column
// through the `Module.u4View` channel (Todo 27's overlay), not screenMessage().
// Its literals are printf *templates* for the view payload ("F:%04d   G:%04d",
// "Stones:%s"), and because the file is listed in CPP_UI_FILE_OPTIONS its
// `ui:stats:<n>` ids also landed in GENERATED_UI_TEMPLATES -- Todo 23's
// screenMessage format-hash -> id table, whose ids reach the dialogue panel.
// A stats literal reaching that table would be drawn twice: once as a dialogue
// panel line and once as an overlay row (the Todo 23 -> 26 double-output bug,
// handoff.md). stats.cpp must stay *inventoried* (its ids exist in
// locales/ko/ui.json and in GENERATED_STATUS_TEMPLATES) but must not feed
// buildUiTemplateMap. Everything here is data-driven: over the ui:stats ids
// locales/ko/ui.json actually records, never a hardcoded count.

type Entry = { sourceHash: string; placeholders: string[]; translation: string; status: string }

const uiEntries = (uiSchema as { entries: Record<string, Entry> }).entries
const STATS_ID = /^ui:stats:\d+$/

const statsRows = Object.entries(uiEntries).filter(([id]) => STATS_ID.test(id))
/** Every `ui:stats:<n>` id locales/ko/ui.json records. */
const SCHEMA_STATS_IDS = statsRows.map(([id]) => id).sort()
/**
 * The subset whose source literal is unique among the status literals. The
 * status table is keyed by literal text and drops a repeated literal, so only
 * the unique ones are individually reachable; this keeps the "still mapped"
 * assertion honest if the literal set ever grows a duplicate.
 */
function uniqueStatsIds(rows: [string, Entry][]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const [id, entry] of rows) {
    if (!seen.has(entry.translation)) {
      seen.add(entry.translation)
      ids.push(id)
    }
  }
  return ids.sort()
}
const UNIQUE_STATS_IDS = uniqueStatsIds(statsRows)

/** Every `ui:stats:<n>` id a screenMessage format-hash -> id table maps. */
function statsIdsIn(table: Readonly<Record<string, string>>): string[] {
  return [...new Set(Object.values(table))].filter((id) => STATS_ID.test(id)).sort()
}

describe("ui:stats ids are inventoried but never screenMessage template ids", () => {
  it("has a non-empty ui:stats id set in locales/ko/ui.json (guards the assertions below)", () => {
    expect(SCHEMA_STATS_IDS.length).toBeGreaterThan(0)
  })

  it("keeps every ui:stats id out of GENERATED_UI_TEMPLATES (no dialogue-panel + overlay double output)", () => {
    expect(statsIdsIn(GENERATED_UI_TEMPLATES)).toEqual([])
  })

  it("keeps every ui:stats id out of the generator's screenMessage template map", () => {
    expect(statsIdsIn(generateI18nTables("locales/ko").uiTemplates)).toEqual([])
  })

  it("still maps the status literals through the status-specific table", () => {
    const statusIds = statsIdsIn(GENERATED_STATUS_TEMPLATES)
    expect(statusIds.length).toBeGreaterThan(0)
    // Every emitted status id is a real inventoried ui:stats id ...
    for (const id of statusIds) expect(SCHEMA_STATS_IDS, id).toContain(id)
    // ... and every uniquely-translated one is mapped, so narrowing the fix
    // (e.g. dropping stats.cpp from GENERATED_STATUS_TEMPLATES too) fails.
    for (const id of UNIQUE_STATS_IDS) expect(statusIds, id).toContain(id)
  })
})

describe("Todo 23/24 screenMessage template mappings survive the source-scope fix", () => {
  // Known-good literal -> id pairs from game.cpp / portal.cpp (Todo 23) and
  // codex.cpp / discourse_castle.cpp (Todo 24). If excluding stats.cpp from
  // buildUiTemplateMap ever over-deletes, these go with it.
  const known: [string, string][] = [
    ["Pass\n", "ui:game:15"],
    ["Press Alt-h for help\n", "ui:game:0"],
    ["Enter %s!\n\n", "ui:portal:1"],
    ["\nYou use your key of Three Parts.\n", "ui:codex:2"],
    [
      "To survive in this hostile land thou must first know thyself! Seek ye to master thy weapons and thy magical ability!\n\nTake great care in these thy first travels in Britannia.\n\nUntil thou dost well know thyself, travel not far from the safety of the townes!\n",
      "ui:discourse_castle:0"
    ]
  ]

  it("still maps the Todo 23/24 literals the generated table records", () => {
    for (const [literal, id] of known) {
      expect(GENERATED_UI_TEMPLATES[fnv1a32(literal)], literal).toBe(id)
    }
  })

  it("still maps them through the generator, and keeps the bulk of the other ui:/module: ids", () => {
    const { uiTemplates } = generateI18nTables("locales/ko")
    for (const [literal, id] of known) {
      expect(uiTemplates[fnv1a32(literal)], literal).toBe(id)
    }
    const ids = [...new Set(Object.values(uiTemplates))]
    const byPrefix = (prefix: string) => ids.filter((id) => id.startsWith(prefix)).length
    const minimums: [string, number][] = [
      ["ui:game:", 100],
      ["ui:portal:", 5],
      ["ui:shrine:", 10],
      ["ui:discourse_castle:", 20],
      ["ui:codex:", 15],
      ["ui:intro:", 50],
      ["module:", 1]
    ]
    for (const [prefix, minimum] of minimums) {
      expect(byPrefix(prefix), `${prefix} mapped ids dropped below ${minimum}`).toBeGreaterThanOrEqual(minimum)
    }
  })
})
