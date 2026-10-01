import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composeUiMessage, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import {
  GENERATED_I18N_ENTRIES,
  GENERATED_MODULE_NAMES,
  GENERATED_TALK_TEMPLATES,
  GENERATED_UI_TEMPLATES
} from "../../src/i18n/generated/strings.ts"
import { extractBoronLiterals } from "../../scripts/lib/boron-strings.mjs"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { generateI18nTables, virtueNameModuleEntries } from "../../scripts/i18n-generate.mjs"
import moduleSchema from "../../locales/ko/module.json" with { type: "json" }
import uiSchema from "../../locales/ko/ui.json" with { type: "json" }

// Todo 32 follow-up: close the two English leaks Todo 29 reported.
//
//   1. ui:shrine:14 (vendor/xu4/src/shrine.cpp:176-177) is a ready Korean
//      line whose `%s` is getVirtueName(virtue). The engine hands the dialogue
//      panel the English virtue name, and composeUiMessage only translates a
//      `%s` argument when moduleNameId() knows it -- which none of the eight
//      did, so "Honesty" landed inside an otherwise Korean sentence.
//   2. Shrine::getName() builds "Shrine of " + a virtue name but is never
//      printed by a screenMessage(), so it is outside the screenMessage
//      inventory. It is reachable only from the cheat menu -- asserted here so
//      the "not inventoried" decision stays deliberate instead of accidental.
//
// The virtue names are NOT AVATAR.EXE data: they are engine literals in
// vendor/xu4/src/names.cpp, and the same eight English words are already
// inventoried as ready Korean module entries derived from
// vendor/xu4/module/Ultima-IV/maps.b (`shrine (virtue: "Honesty" ...)`).
// So this suite asserts the *runtime lookup* exists and resolves; the Korean
// text itself is never restated here, it is read out of the locale/generated
// tables, and the anti-hardcoding test below proves no English->Korean table
// leaked into TypeScript or C++.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

const namesSource = readRepoFile("vendor/xu4/src/names.cpp")
const savegameHeader = readRepoFile("vendor/xu4/src/savegame.h")
const shrineSource = readRepoFile("vendor/xu4/src/shrine.cpp")
const cheatSource = readRepoFile("vendor/xu4/src/cheat.cpp")
const discourseSource = readRepoFile("vendor/xu4/src/discourse.cpp")
const gameSource = readRepoFile("vendor/xu4/src/game.cpp")
const mapsSource = readRepoFile("vendor/xu4/module/Ultima-IV/maps.b")

/**
 * getVirtueName()'s own table, read out of the engine so the suite can never
 * disagree with the strings the player is shown.
 */
const VIRTUE_NAMES_TABLE = /const virtueNames\[\] = \{([\s\S]*?)\};/m.exec(namesSource)?.[1] ?? ""
const VIRTUE_NAMES = [...VIRTUE_NAMES_TABLE.matchAll(/"([^"]*)"/g)].map((match) => match[1]!)

/** The eight Virtue enum members, in savegame.h order -- the order getVirtueName() indexes by. */
const VIRTUE_ENUM = /enum Virtue \{([\s\S]*?)\};/m.exec(savegameHeader)?.[1] ?? ""
const VIRTUE_ENUM_ORDER = [...VIRTUE_ENUM.matchAll(/VIRT_([A-Z]+)/g)]
  .map((match) => match[1]!)
  .filter((name) => name !== "MAX")

const moduleEntries = (
  moduleSchema as unknown as {
    entries: Record<string, { sourceHash: string; status: string; translation: string; sourceFile: string }>
  }
).entries

/**
 * locales/ko/ui.json is the full shrine inventory. GENERATED_I18N_ENTRIES only
 * carries entries the generator considers resolvable, so the two blank
 * separators (ui:shrine:4 / ui:shrine:12) exist here but not there.
 */
const uiEntries = (
  uiSchema as unknown as {
    entries: Record<string, { sourceHash: string; status: string; translation: string; category?: string }>
  }
).entries

/** The real lookups src/shell.ts injects into composeUiMessage. */
const uiMessageDeps: UiMessageDeps = {
  templateId: (hash) => GENERATED_UI_TEMPLATES[hash],
  resolve: (id, fallback) => {
    const entry = GENERATED_I18N_ENTRIES[id]
    return entry !== undefined && entry.translation !== "" ? entry.translation : fallback
  },
  moduleNameId: (text) => GENERATED_MODULE_NAMES[text]
}

/** ui:shrine:14's source literal, read from the engine so the hash is never hand-computed. */
const ELEVATION_CALL = /screenMessage\(\s*("(?:[^"\\]|\\.)*")\s*,\s*\n?\s*getVirtueName\(virtue\)/.exec(shrineSource)?.[1]
const ELEVATION_TEMPLATE = ELEVATION_CALL === undefined ? "" : (JSON.parse(ELEVATION_CALL) as string)

const mapsLiterals = extractBoronLiterals(mapsSource)

describe("the eight virtue names reach the Korean runtime path", () => {
  it("reads exactly the eight engine virtue names, in savegame.h's enum order", () => {
    // getVirtueName() indexes virtueNames by (virtue - VIRT_HONESTY), so a
    // reorder here silently renames every shrine.
    expect(VIRTUE_NAMES).toEqual([
      "Honesty",
      "Compassion",
      "Valor",
      "Justice",
      "Sacrifice",
      "Honor",
      "Spirituality",
      "Humility"
    ])
    expect(VIRTUE_ENUM_ORDER).toEqual([
      "HONESTY",
      "COMPASSION",
      "VALOR",
      "JUSTICE",
      "SACRIFICE",
      "HONOR",
      "SPIRITUALITY",
      "HUMILITY"
    ])
  })

  it("maps every virtue name to a ready Korean module id in the generated runtime table", () => {
    for (const name of VIRTUE_NAMES) {
      const id = GENERATED_MODULE_NAMES[name]
      expect(id, `${name} missing from GENERATED_MODULE_NAMES`).toBeDefined()
      // The English word is the same one maps.b already declares as a shrine
      // virtue, so the id must be an existing maps entry -- not a new id.
      expect(id, name).toMatch(/^module:Ultima-IV:maps:\d+$/)
      const entry = moduleEntries[id!]
      expect(entry, `${name} -> ${id} missing from locales/ko/module.json`).toBeDefined()
      expect(entry!.status, `${name} -> ${id}`).toBe("ready")
      expect(entry!.translation, `${name} -> ${id}`).toMatch(/\p{Script=Hangul}/u)
    }
  })

  it("has the eight rows the GENERATOR emits, not a hand-edited artifact", () => {
    // The generator is the source of truth. GENERATED_MODULE_NAMES used to
    // carry the eight virtue rows as a hand-edit on top of a generator that
    // only ever read config.b, so the next `npm run i18n:generate` silently
    // dropped them. This drives the real generator and requires the eight rows
    // to come out of it.
    const generated = generateI18nTables(join(projectRoot, "locales/ko")).moduleNames
    for (const name of VIRTUE_NAMES) {
      const mapsIndex = mapsLiterals.findIndex((literal) => literal.text === name)
      expect(generated[name], `${name} is not produced by i18n-generate.mjs`).toBe(`module:Ultima-IV:maps:${mapsIndex}`)
    }
  })

  it("keeps the locale hashes equal to the names maps.b and the engine actually send", () => {
    for (const name of VIRTUE_NAMES) {
      const mapsIndex = mapsLiterals.findIndex((literal) => literal.text === name)
      expect(mapsIndex, `${name} is not a maps.b literal`).toBeGreaterThanOrEqual(0)
      const mapsId = `module:Ultima-IV:maps:${mapsIndex}`
      // The runtime lookup must point at the *same* locale row maps.b produced.
      expect(GENERATED_MODULE_NAMES[name], name).toBe(mapsId)
      expect(moduleEntries[GENERATED_MODULE_NAMES[name]!], name).toBe(moduleEntries[mapsId])
      // Two-layer scheme: the locale row is keyed by the SHA-256 of the
      // English literal; only GENERATED_* tables are keyed by the FNV-1a hash.
      expect(moduleEntries[mapsId]!.sourceHash, name).toBe(sourceHash(name))
    }
  })
})

describe("a virtue name renders as Hangul through the real composer", () => {
  it("renders ui:shrine:14 with no English left for any of the eight virtues", () => {
    expect(ELEVATION_CALL, "the elevation screenMessage literal in shrine.cpp").toBeDefined()
    expect(ELEVATION_TEMPLATE).toContain("%s")
    // The format the engine hashes: vendor/xu4/src/shrine.cpp's elevation line.
    expect(GENERATED_UI_TEMPLATES[fnv1a32(ELEVATION_TEMPLATE)], ELEVATION_TEMPLATE).toBe("ui:shrine:14")
    for (const name of VIRTUE_NAMES) {
      // screen.cpp's web hook sends the FNV-1a hash of the format plus the
      // pre-formatted conversion string, never the format text.
      const line = composeUiMessage(fnv1a32(ELEVATION_TEMPLATE), [name], uiMessageDeps)
      expect(line, name).not.toBeNull()
      expect(line!, name).toMatch(/\p{Script=Hangul}/u)
      // The whole point of Todo 32: not one leftover Latin character.
      expect(line!, `${name} still leaks English`).not.toMatch(/[A-Za-z]/)
    }
  })

  it("keeps the English->Korean mapping in the locale, never in TypeScript or C++", () => {
    const englishNames = VIRTUE_NAMES.join("|")
    // Inside the generated table the English key is expected (it is the same
    // English->id shape as every weapon name); the Korean must come from
    // locales/ko, so no Hangul may sit on a virtue row.
    const moduleNameBlock = /export const GENERATED_MODULE_NAMES[\s\S]*?\n\}/.exec(
      readRepoFile("src/i18n/generated/strings.ts")
    )?.[0]
    expect(moduleNameBlock, "GENERATED_MODULE_NAMES block").toBeDefined()
    const virtueRows = moduleNameBlock!.split("\n").filter((row) => new RegExp(englishNames).test(row))
    expect(virtueRows.length, "virtue rows in GENERATED_MODULE_NAMES").toBe(VIRTUE_NAMES.length)
    for (const row of virtueRows) expect(row, row).not.toMatch(/\p{Script=Hangul}/u)
    for (const row of virtueRows) expect(row, row).toMatch(/module:Ultima-IV:maps:\d+/)
    // No Korean anywhere in the engine sources that carry the English names.
    for (const relativePath of ["vendor/xu4/src/shrine.cpp", "vendor/xu4/src/names.cpp"]) {
      expect(readRepoFile(relativePath), relativePath).not.toMatch(/\p{Script=Hangul}/u)
    }
    expect(readRepoFile("locales/ko/module.json"), "locale holds the Korean").toMatch(/\p{Script=Hangul}/u)
  })
})

describe("Shrine::getName() is cheat-menu-only, so it is deliberately not inventoried", () => {
  const getNameRaw = /const char\* Shrine::getName\(\) const \{([\s\S]*?)\n\}/.exec(shrineSource)?.[1] ?? ""
  /** The body with `//` comments removed, so prose about the decision cannot fake a call site. */
  const getNameBody = getNameRaw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n")

  it("is not a screenMessage call site, so it is outside the ui:* inventory", () => {
    expect(getNameBody).not.toBe("")
    expect(getNameBody).toMatch(/"Shrine of "/)
    expect(getNameBody).not.toMatch(/screenMessage/)
  })

  it("records in the source why no translation entry exists for it", () => {
    // A silent omission rots; the reason has to live next to the code.
    expect(getNameRaw).toMatch(/\/\//)
    expect(getNameRaw).toMatch(/cheat/i)
    expect(getNameRaw).toMatch(/phantom|unreachable/i)
  })

  it("keeps 'Shrine of ' out of every generated template table (no phantom entry)", () => {
    expect(GENERATED_UI_TEMPLATES[fnv1a32("Shrine of ")]).toBeUndefined()
    expect(GENERATED_TALK_TEMPLATES["Shrine of "]).toBeUndefined()
    const shrineIds = [...new Set(Object.values(GENERATED_UI_TEMPLATES))].filter((id) => id.startsWith("ui:shrine:"))
    expect(shrineIds.length).toBeGreaterThan(0)
    for (const id of shrineIds) {
      expect(GENERATED_I18N_ENTRIES[id]!.translation, id).not.toBe("Shrine of ")
    }
  })

  it("is reached only from the cheat menu and the town-vendor discourse", () => {
    // The only callers of a Map's getName() in the engine are the cheat menu
    // and DISCOURSE_VENDOR, and a shrine never hosts a vendor: the single
    // "vendors" discourse is a town-NPC resource loaded once in game.cpp.
    expect([...cheatSource.matchAll(/getName\(\)/g)].length, "cheat.cpp call sites").toBeGreaterThan(0)
    expect(discourseSource).toMatch(/DISCOURSE_VENDOR[\s\S]{0,400}?getName\(\)/)
    expect(gameSource).toMatch(/discourse_load\(&vendorDisc, "vendors"\)/)
    expect(gameSource).toMatch(/pushController\(&cheatMenuController\)/)
  })
})

describe("every shrine.cpp literal has a deliberate disposition", () => {
  // The Todo 29 audit printed this table by hand. The generator is the
  // authority: it extracts every literal from shrine.cpp, so if a new
  // English literal appears it gets a new ui:shrine id and the "contiguous and
  // fully dispositioned" test below fails until it is translated or excluded.
  const tables = generateI18nTables("locales/ko")
  const SHRINE_ID = /^ui:shrine:(\d+)$/
  const shrineIds = Object.keys(uiEntries)
    .map((id) => SHRINE_ID.exec(id))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ id: match[0], index: Number(match[1]) }))
    .sort((left, right) => left.index - right.index)
  const mappedIds = [...new Set(Object.values(tables.uiTemplates))].filter((id) => SHRINE_ID.test(id))
  const excludedShrineIds = tables.uiTemplateExclusions
    .filter((row) => SHRINE_ID.test(row.id))
    .map((row) => ({ id: row.id, reason: row.reason }))
  /**
   * The four non-panel shrine literals and why each is excluded. "\n\n" and
   * "\n" are blank separators; "." is the per-mantra progress tick; "\n%s" is
   * the advice format, which the u4WebTalkId hook owns instead (Todo 29).
   */
  const EXPECTED_EXCLUSIONS: Record<string, string> = {
    "ui:shrine:4": "no ready translation",
    "ui:shrine:10": "placeholder-only literal (nothing to translate)",
    "ui:shrine:12": "no ready translation",
    "ui:shrine:17": "placeholder-only literal (nothing to translate)"
  }

  it("has the inventory the audit used (guards the assertions below)", () => {
    expect(shrineIds.length).toBeGreaterThanOrEqual(18)
    // Contiguous ui:shrine:0..n-1, so a new literal cannot slip in unnumbered.
    expect(shrineIds.map((row) => row.index)).toEqual(Array.from({ length: shrineIds.length }, (_, i) => i))
    expect(mappedIds.length).toBeGreaterThanOrEqual(10)
  })

  it("gives every inventoried shrine literal exactly one disposition", () => {
    const dispositions = [...mappedIds, ...excludedShrineIds.map((row) => row.id)].sort()
    expect(dispositions).toEqual(shrineIds.map((row) => row.id).sort())
    expect(new Set(dispositions).size, "a literal with two dispositions").toBe(dispositions.length)
  })

  it("translates every shrine literal that reaches the dialogue panel", () => {
    for (const id of mappedIds) {
      expect(uiEntries[id], `${id} in locales/ko/ui.json`).toBeDefined()
      expect(GENERATED_I18N_ENTRIES[id], `${id} in the generated table`).toBeDefined()
      expect(GENERATED_I18N_ENTRIES[id]!.translation, id).toMatch(/\p{Script=Hangul}/u)
      // A panel line must not keep any English word outside printf conversions.
      const withoutConversions = uiEntries[id]!.translation.replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g, "")
      expect(withoutConversions, `${id} leaks English`).not.toMatch(/[A-Za-z]/)
    }
  })

  it("excludes only the four documented non-panel literals, with no English among them", () => {
    const actual: Record<string, string> = {}
    for (const { id, reason } of excludedShrineIds) actual[id] = reason
    expect(actual).toEqual(EXPECTED_EXCLUSIONS)
    for (const { id, reason } of excludedShrineIds) {
      // Whatever the reason, an excluded literal must not leave English on screen.
      expect(reason, id).toMatch(/placeholder-only|no ready translation/)
      // Strip printf conversions first: "\n%s" is a format, not the word "s".
      const withoutConversions = uiEntries[id]!.translation.replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g, "")
      expect(withoutConversions, `${id} leaks English`).not.toMatch(/[A-Za-z]/)
    }
  })
})

// Todo 32 follow-up: the generated artifact must be exactly what the generator
// produces. The eight virtue rows were once hand-appended to
// src/i18n/generated/strings.ts, which meant `npm run i18n:generate` dropped
// them on the next run -- a silent regression this whole suite would have
// caught only if it compared the *generator's* output with the *committed*
// table. This is that check, over the whole module-name map rather than the
// eight virtues, so any future hand-edit of a generated table fails here.
describe("the committed generated tables are generator-pure", () => {
  it("admits exactly the eight shrine virtue rows of maps.b, never its file names", () => {
    // The generator fix is scoped on purpose: maps.b is 161 literals, and all
    // but eight are file names (`shrine.con`, `lcb.tlk`, ...) or whole
    // sentences (`into Dungeon Deceit\n`). Admitting those would let a
    // filename or a full sentence win a `%s` substitution, so the filter
    // below must keep the eight `virtue:` rows and drop the other 153.
    const admitted = virtueNameModuleEntries(moduleEntries)
    const admittedMapsIds = Object.keys(admitted).filter((id) => id.startsWith("module:Ultima-IV:maps:"))
    expect(admittedMapsIds).toHaveLength(VIRTUE_NAMES.length)
    for (const name of VIRTUE_NAMES) {
      const index = mapsLiterals.findIndex((literal) => literal.text === name)
      expect(admittedMapsIds, `${name} is not admitted`).toContain(`module:Ultima-IV:maps:${index}`)
    }
    // Every config.b row must stay admitted: the weapon/armour/creature names
    // other lanes depend on cannot be collateral damage of this fix.
    expect(Object.keys(admitted).filter((id) => id.startsWith("module:Ultima-IV:config:")).length).toBeGreaterThan(0)
    expect(admittedMapsIds.some((id) => /\.(con|tlk|ult|dng|map)$/.test(admitted[id]!.translation)), "a maps.b file name leaked into the name map").toBe(false)
  })

  it("reproduces GENERATED_MODULE_NAMES from the locale, with no extra or missing rows", () => {
    const generated = generateI18nTables(join(projectRoot, "locales/ko")).moduleNames
    const committed = GENERATED_MODULE_NAMES as Readonly<Record<string, string>>
    const extraInArtifact = Object.keys(committed).filter((key) => generated[key] !== committed[key])
    const missingFromArtifact = Object.keys(generated).filter((key) => committed[key] !== generated[key])
    expect({ extraInArtifact, missingFromArtifact }, "src/i18n/generated/strings.ts is not what i18n-generate.mjs emits").toEqual({
      extraInArtifact: [],
      missingFromArtifact: []
    })
    // The eight virtues are a strict subset of the map, not the whole of it:
    // config.b's weapon/armour/creature names must all survive untouched.
    expect(Object.keys(generated).length).toBeGreaterThan(VIRTUE_NAMES.length)
  })
})
