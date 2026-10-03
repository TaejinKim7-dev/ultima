import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composeUiMessage, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { GENERATED_I18N_ENTRIES, GENERATED_UI_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { resolveNameArgumentId } from "../../src/i18n/localization.ts"
import { CPP_UI_FILE_OPTIONS } from "../../scripts/i18n-inventory.mjs"
import { extractCppLiterals } from "../../scripts/lib/cpp-strings.mjs"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { orderedPlaceholders } from "../../scripts/lib/ui-templates.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import uiSchema from "../../locales/ko/ui.json" with { type: "json" }

// Todo 40 (GOAL_GAP_AUDIT gap #5): vendor/xu4/src/death.cpp's `deathMsgs[]` and
// spell.cpp's `spellErrorMsgs[]` are static array initialisers whose elements
// reach screenMessage() through a variable, so the call-site extractor never
// saw them: their format hashes were unmapped and the panel stayed silent.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")
const hasLatin = (text: string) => /[A-Za-z]/.test(text)

const uiEntries = (
  uiSchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string; placeholders: string[] }> }
).entries

describe("extractCppLiterals: staticArrays option", () => {
  const SYNTHETIC = [
    "static const char* firstTable[] = {",
    '    "alpha one\\n",   // note: "quoted comment"',
    '    "beta %s\\n" /* "block comment" */,',
    '    "gam" "ma\\n"',
    "};",
    "static const struct { int err; const char* msg; } pairTable[] = {",
    '    { 1, "delta\\n" },',
    '    { 2, "epsilon\\n" }',
    "};",
    'static const Other others[] = { { "zeta", 3 } };',
    'void f() { screenMessage("eta\\n"); }'
  ].join("\n")

  it("collects only the named arrays, skipping comments, joining adjacent literals", () => {
    const literals = extractCppLiterals(SYNTHETIC, { staticArrays: ["firstTable", "pairTable"] }).map((entry: { text: string }) => entry.text)
    expect(literals).toEqual(["eta\n", "alpha one\n", "beta %s\n", "gamma\n", "delta\n", "epsilon\n"])
  })

  it("lists array elements AFTER every call-site literal so existing ids never move", () => {
    const without = extractCppLiterals(SYNTHETIC).map((entry: { text: string }) => entry.text)
    const withArrays = extractCppLiterals(SYNTHETIC, { staticArrays: ["firstTable"] }).map((entry: { text: string }) => entry.text)
    expect(withArrays.slice(0, without.length)).toEqual(without)
    expect(withArrays.length).toBeGreaterThan(without.length)
  })

  it("changes nothing when the option is absent", () => {
    expect(extractCppLiterals(SYNTHETIC)).toEqual(extractCppLiterals(SYNTHETIC, {}))
  })

  it("fails loudly when a named array is not in the file", () => {
    expect(() => extractCppLiterals(SYNTHETIC, { staticArrays: ["missingTable"] })).toThrow(/missingTable/)
  })
})

describe("the real death.cpp and spell.cpp arrays", () => {
  const options = {
    death: CPP_UI_FILE_OPTIONS["vendor/xu4/src/death.cpp"],
    spell: CPP_UI_FILE_OPTIONS["vendor/xu4/src/spell.cpp"]
  }

  it("opts both files in to their array by name", () => {
    expect(options.death?.staticArrays).toEqual(["deathMsgs"])
    expect(options.spell?.staticArrays).toEqual(["spellErrorMsgs"])
  })

  const deathSource = readRepoFile("vendor/xu4/src/death.cpp")
  const spellSource = readRepoFile("vendor/xu4/src/spell.cpp")
  const tableText = (source: string, name: string) =>
    [...new RegExp(`${name}\\[\\] = \\{([\\s\\S]*?)\\n\\};`).exec(source)![1]!.matchAll(/^\s*(?:\{[^"]*)?"((?:[^"\\]|\\.)*)"/gm)].map(
      (match) => match[1]!.replace(/\\n/g, "\n").replace(/\\020/g, "\u0010")
    )

  it("finds every death message and every spell error message, and nothing from spells[]", () => {
    const death = extractCppLiterals(deathSource, options.death).map((entry: { text: string }) => entry.text)
    const spell = extractCppLiterals(spellSource, options.spell).map((entry: { text: string }) => entry.text)
    const deathTable = tableText(deathSource, "deathMsgs")
    const spellTable = tableText(spellSource, "spellErrorMsgs")
    expect(deathTable).toHaveLength(8)
    expect(spellTable).toHaveLength(7)
    expect(death.slice(-deathTable.length)).toEqual(deathTable)
    expect(spell.slice(-spellTable.length)).toEqual(spellTable)
    // The comments after the first two spell rows quote other (DOS) wording: never captured.
    expect(spell.filter((text: string) => /DOS/.test(text))).toEqual([])
    // spells[] follows spellErrorMsgs[]: its names must not be swept in.
    const spellNames = [...spellSource.matchAll(/^\s*\{ "([A-Z][^"]*)",/gm)].map((match) => match[1]!)
    expect(spellNames.length).toBeGreaterThan(10)
    for (const name of spellNames) expect(spell, "a spell name was extracted").not.toContain(name)
  })

  it("keeps the ids of every pre-existing death/spell literal (array literals only append)", () => {
    for (const [source, option] of [
      [deathSource, options.death],
      [spellSource, options.spell]
    ] as const) {
      const before = extractCppLiterals(source, {}).map((entry: { text: string }) => entry.text)
      const after = extractCppLiterals(source, option).map((entry: { text: string }) => entry.text)
      expect(after.slice(0, before.length)).toEqual(before)
    }
  })
})

describe("the new rows are translated and reach the panel in Korean", () => {
  const death = extractCppLiterals(readRepoFile("vendor/xu4/src/death.cpp"), CPP_UI_FILE_OPTIONS["vendor/xu4/src/death.cpp"])
  const spell = extractCppLiterals(readRepoFile("vendor/xu4/src/spell.cpp"), CPP_UI_FILE_OPTIONS["vendor/xu4/src/spell.cpp"])
  const deps: UiMessageDeps = {
    templateId: (hash) => GENERATED_UI_TEMPLATES[hash],
    resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
    moduleNameId: resolveNameArgumentId
  }

  const rows = [
    ...death.slice(-8).map((entry: { text: string }, i: number) => ({ id: `ui:death:${death.length - 8 + i}`, text: entry.text })),
    ...spell.slice(-7).map((entry: { text: string }, i: number) => ({ id: `ui:spell:${spell.length - 7 + i}`, text: entry.text }))
  ]

  it("has fifteen new rows", () => {
    expect(rows).toHaveLength(15)
  })

  it("records each as a ready ui row: sourceHash, placeholders in source order, Hangul only", () => {
    for (const { id, text } of rows) {
      const entry = uiEntries[id]
      expect(entry, `${id} missing from locales/ko/ui.json`).toBeDefined()
      expect(entry!.sourceHash, id).toBe(sourceHash(text))
      expect(entry!.status, id).toBe("ready")
      expect(orderedPlaceholders(entry!.translation), id).toEqual(orderedPlaceholders(text))
      const noConversions = entry!.translation.replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g, "")
      expect(hasLatin(noConversions), `${id} translation has ASCII letters`).toBe(false)
      expect(/\p{Script=Hangul}/u.test(entry!.translation), id).toBe(true)
    }
  })

  it("maps each format hash into the screenMessage template table and composes Korean", () => {
    for (const { id, text } of rows) {
      const hash = fnv1a32(text)
      // A literal that already exists elsewhere (spell.cpp's "failed" and "not here" duplicate game.cpp /
      // combat.cpp lines) maps to its FIRST id; the generator drops a duplicate whose translation differs,
      // so require the mapped row to carry exactly this row's translation.
      const mapped = GENERATED_UI_TEMPLATES[hash]
      expect(mapped, `${id} (hash ${hash}) is not in GENERATED_UI_TEMPLATES`).toBeDefined()
      expect(GENERATED_I18N_ENTRIES[mapped!]?.translation, `${id} maps to ${mapped} with another translation`).toBe(uiEntries[id]!.translation)
      const args = orderedPlaceholders(text).map(() => "")
      const line = composeUiMessage(hash, args, deps)
      expect(line, id).not.toBeNull()
      expect(hasLatin(line!), `${id} composed line has ASCII letters`).toBe(false)
    }
  })

  it("is not among the 214 extracted AVATAR.EXE/TITLE.EXE table slots (hash + substring; the whole image was scanned separately, see task-40/avatar-exe-full-scan.log)", () => {
    const binaryPath = join(projectRoot, ".local/i18n-inventory/binary.json")
    if (!existsSync(binaryPath)) return // private corpus absent (CI): the literals are in vendored xu4 source, verified above
    const binary = Object.values(JSON.parse(readFileSync(binaryPath, "utf8")) as Record<string, { sourceHash: string; sourceText?: string }>)
    const hashes = new Set(binary.map((entry) => entry.sourceHash))
    const hashMatches = rows.filter(({ text }) => hashes.has(sourceHash(text))).map(({ id }) => id)
    const substringMatches = rows
      .filter(({ text }) => {
        const core = text.replace(/%[a-z]|[\n\u0010]/g, "").trim()
        return core.length > 6 && binary.some((entry) => (entry.sourceText ?? "").toLowerCase().includes(core.toLowerCase()))
      })
      .map(({ id }) => id)
    expect({ hashMatches, substringMatches }).toEqual({ hashMatches: [], substringMatches: [] })
  })
})
