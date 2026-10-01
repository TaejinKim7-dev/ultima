#!/usr/bin/env node
/**
 * npm run i18n:generate (Todo 14)
 *
 * Flattens the public `locales/ko/*.json` translation source of truth into
 * STATIC lookup tables -- no JSON parser is ever linked into the C/C++
 * engine or shipped to the browser for this:
 *
 *   - `src/i18n/generated/strings.ts` -- TS record of ready (translated)
 *     entries + alias pairs, imported statically by
 *     `src/i18n/localization.ts` (JS UI labels / dialogue panel path).
 *   - `native/i18n/u4_i18n_table.inc` -- C initializer rows compiled into
 *     `native/i18n/u4_i18n_lookup.c` (native display-call / TLK
 *     `map:npcIndex:field` / binary `resource:table:index` lookup path).
 *   - `native/i18n/ko-overlay.b` -- Boron translation-overlay fragment
 *     keyed by the same semantic IDs (consumed by the config_boron
 *     overlay path; module/TLK/binary display entries only).
 *
 * Only entries whose `status` is not "pending" AND whose `translation` is
 * non-empty are emitted -- pending entries stay English at runtime until
 * Todo 15 fills the corpus. `npm run i18n:check` remains the gate that
 * rejects placeholder mismatches, over-wide status lines, and alias
 * collisions before these tables are built.
 *
 * Usage: node scripts/i18n-generate.mjs [schemaDir] (defaults to locales/ko)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { CPP_UI_FILE_OPTIONS, CPP_UI_FILES, MODULE_BORON_FILES } from "./i18n-inventory.mjs"
import { extractBoronLiterals } from "./lib/boron-strings.mjs"
import { extractCppLiterals } from "./lib/cpp-strings.mjs"
import { sourceHash } from "./lib/hash.mjs"
import { loadSchemaFile } from "./lib/schema-io.mjs"
import { buildModuleNameMap, buildUiTemplateMap } from "./lib/ui-templates.mjs"
import { buildVendorTemplateMap } from "./lib/vendor-templates.mjs"

// Todo 22: the native talk channel sends the exact format-string literal
// runTalkDialogue() hands to screenMessage (open-source xu4 code, not
// original game data); GENERATED_TALK_TEMPLATES maps it back to its
// `ui:discourse_tlk:<n>` id. Re-extracted with the same options
// i18n:inventory used, and only kept when the literal still hashes to the
// id's recorded sourceHash (a drifted/stale id is skipped, not mis-mapped).
// Todo 24 adds discourse_castle.cpp and codex.cpp (Lord British, Hawkwind, Codex).
const TALK_TEMPLATE_SOURCES = [
  "vendor/xu4/src/discourse_tlk.cpp",
  "vendor/xu4/src/discourse_castle.cpp",
  "vendor/xu4/src/codex.cpp"
]

// Todo 23: module config names used as screenMessage `%s` arguments
// (weapon/armour/creature names), see scripts/lib/ui-templates.mjs.
const MODULE_NAME_SOURCE = "vendor/xu4/module/Ultima-IV/config.b"

// Todo 32: the eight shrine virtue names. maps.b declares them as
// `shrine (virtue: "Honesty" mantra: ahm)`, so locales/ko already holds a
// ready Korean `module:Ultima-IV:maps:<n>` row for each -- but nothing fed
// maps.b to the module-name map, and vendor/xu4/src/names.cpp's
// getVirtueName() sends exactly these eight English words to the dialogue
// panel as the `%s` of shrine.cpp's elevation line. That left "Honesty" & co.
// untranslated inside an otherwise Korean sentence.
//
// Only the eight `virtue:` declarations are admitted, NOT all of maps.b: the
// rest of that file is map/room file names (`shrine.con`, `lcb.tlk`, ...)
// and whole sentences (`into Dungeon Deceit\n`). Admitting those would turn
// a filename or an entire sentence into a candidate `%s` substitution, which
// is a mistranslation waiting for whichever call site happens to pass one.
const MAPS_NAME_SOURCE = "vendor/xu4/module/Ultima-IV/maps.b"

// Todo 25: vendors.b templates (web-say) and the shop/owner/item names that
// fill their substitution symbols.
const VENDOR_FILE = "vendor/xu4/module/Ultima-IV/vendors.b"

// Todo 26: the intro's own literals (Configure-menu labels/titles, main
// menu, name/sex prompts, gypsy glue lines -- open-source xu4 code, not
// original game data). GENERATED_INTRO_TEMPLATES maps each exact literal
// the web view channel sends (vendor/xu4/src/intro.cpp) to its `ui:intro:<n>`
// id, with the same drifted-hash guard as the talk templates.
const INTRO_TEMPLATE_SOURCE = "vendor/xu4/src/intro.cpp"

// Todo 27: the status column's own literals (vendor/xu4/src/stats.cpp) ->
// `ui:stats:<n>`, and weapon/armour/class names (open-source module config)
// -> `module:Ultima-IV:config:<n>` per field. The config literal order is
// the same one i18n:inventory numbers, and every mapped id is only kept when
// the name still hashes to that id's recorded sourceHash.
const STATUS_TEMPLATE_SOURCE = "vendor/xu4/src/stats.cpp"
const STATUS_NAME_SOURCE = "vendor/xu4/module/Ultima-IV/config.b"

// Todo 27: stats.cpp draws the status column through the web view channel
// (EM_JS -> `Module.u4View.show("status", ...)`), never screenMessage(). Its
// literals are payload templates ("F:%04d   G:%04d", "Stones:%s") for that
// channel, so they belong in GENERATED_STATUS_TEMPLATES and must stay out of
// buildUiTemplateMap(): a `ui:stats:<n>` id in GENERATED_UI_TEMPLATES would be
// reachable from the screenMessage path too and any call site passing such a
// literal would draw it twice -- one dialogue panel line plus one overlay row
// (the Todo 23 -> 26 double-output bug). The file stays in CPP_UI_FILES and
// CPP_UI_FILE_OPTIONS so i18n:inventory keeps numbering its `ui:stats:` ids and
// GENERATED_STATUS_TEMPLATES keeps extracting them.
const UI_TEMPLATE_SOURCES = CPP_UI_FILES.filter((relativePath) => relativePath !== STATUS_TEMPLATE_SOURCE)

const TRANSLATABLE_FILES = ["ui", "module", "binary", "tlk", "glossary"]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function fileIdOf(relativePath) {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "")
}

// Same id scheme (and extractor options) as i18n-inventory.mjs's
// extractUiEntries(): `ui:<file>:<literal index>`.
function cppUiSources(files = CPP_UI_FILES) {
  return files.map((relativePath) => ({
    idPrefix: `ui:${fileIdOf(relativePath)}`,
    literals: extractCppLiterals(
      readFileSync(resolve(repoRoot, relativePath), "utf8"),
      CPP_UI_FILE_OPTIONS[relativePath]
    ).map((literal) => literal.text)
  }))
}

// Same id scheme as i18n-inventory.mjs's extractModuleEntries():
// `module:<module>:<file>:<literal index>` (empty literals keep their index).
function moduleSources(files) {
  return files.map((relativePath) => ({
    idPrefix: `module:${relativePath.includes("U4-Upgrade") ? "U4-Upgrade" : "Ultima-IV"}:${fileIdOf(relativePath)}`,
    literals: extractBoronLiterals(readFileSync(resolve(repoRoot, relativePath), "utf8")).map((literal) => literal.text)
  }))
}

/**
 * The module entries buildModuleNameMap() is allowed to resolve: every
 * config.b row, plus exactly the shrine `virtue:` rows of maps.b (Todo 32).
 *
 * buildModuleNameMap() drops a literal whose id is absent from the entries it
 * is handed, so filtering the entries -- rather than slicing the source array --
 * is what keeps maps.b's 101 file-name and dungeon-entrance literals out of
 * the `%s` substitution table while preserving the ids: the id is still
 * `module:Ultima-IV:maps:<i>` for the *maps.b* literal index `i`, the same
 * number i18n:inventory assigned and the locale row is hashed against.
 */
export function virtueNameModuleEntries(moduleEntries) {
  const source = readFileSync(resolve(repoRoot, MAPS_NAME_SOURCE), "utf8")
  const literals = extractBoronLiterals(source)
  const kept = {}
  for (const match of source.matchAll(/\(virtue:\s*"([^"]*)"/g)) {
    // The literal's offset is the quote itself: one byte past `virtue:`'s open
    // quote, i.e. match[0].length - 2 - match[1].length. Same lookup
    // extractStatusNames() does for the class names in config.b.
    const quoteAt = match.index + match[0].length - match[1].length - 2
    const index = literals.findIndex((literal) => literal.offset === quoteAt)
    if (index < 0) continue
    const id = `module:Ultima-IV:maps:${index}`
    // Keep the row only if the locale row really is this virtue name, so a
    // mis-numbered maps.b cannot put an unrelated translation under "Honesty".
    if (moduleEntries[id]?.sourceHash === sourceHash(match[1])) kept[id] = moduleEntries[id]
  }
  return Object.fromEntries(
    Object.entries(moduleEntries).filter(
      ([id]) => !id.startsWith("module:Ultima-IV:maps:") || kept[id] !== undefined
    )
  )
}

function isReady(entry) {
  return (
    entry != null &&
    typeof entry === "object" &&
    entry.status !== "pending" &&
    typeof entry.translation === "string" &&
    entry.translation.trim().length > 0
  )
}

function escapeC(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
}

function boronQuote(text) {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

export function generateI18nTables(schemaDir) {
  const entries = {}
  for (const fileId of TRANSLATABLE_FILES) {
    const data = loadSchemaFile(resolve(schemaDir, `${fileId}.json`), fileId)
    for (const [key, entry] of Object.entries(data.entries)) {
      if (isReady(entry)) {
        entries[key] = {
          translation: entry.translation,
          placeholders: Array.isArray(entry.placeholders) ? entry.placeholders : [],
          ...(entry.category !== undefined ? { category: entry.category } : {}),
          ...(typeof entry.maxWidthColumns === "number"
            ? { maxWidthColumns: entry.maxWidthColumns }
            : {}),
        }
      }
    }
  }

  const aliasData = loadSchemaFile(resolve(schemaDir, "aliases.json"), "aliases")
  const aliases = {}
  for (const [id, entry] of Object.entries(aliasData.entries)) {
    if (entry != null && typeof entry.alias === "string" && entry.alias.length > 0) {
      aliases[id] = { alias: entry.alias, canonical: entry.canonical }
    }
  }

  const uiEntries = loadSchemaFile(resolve(schemaDir, "ui.json"), "ui").entries
  const talkTemplates = {}
  for (const relativePath of TALK_TEMPLATE_SOURCES) {
    const fileId = basename(relativePath, extname(relativePath))
    const talkSource = readFileSync(resolve(repoRoot, relativePath), "utf8")
    extractCppLiterals(talkSource, CPP_UI_FILE_OPTIONS[relativePath]).forEach((literal, index) => {
      const id = `ui:${fileId}:${index}`
      if (uiEntries[id]?.sourceHash === sourceHash(literal.text)) {
        talkTemplates[literal.text] = id
      }
    })
  }

  const introTemplates = {}
  const introSource = readFileSync(resolve(repoRoot, INTRO_TEMPLATE_SOURCE), "utf8")
  extractCppLiterals(introSource, CPP_UI_FILE_OPTIONS[INTRO_TEMPLATE_SOURCE]).forEach((literal, index) => {
    const id = `ui:intro:${index}`
    if (uiEntries[id]?.sourceHash === sourceHash(literal.text) && introTemplates[literal.text] === undefined) {
      introTemplates[literal.text] = id
    }
  })

  const statusTemplates = {}
  const statsSource = readFileSync(resolve(repoRoot, STATUS_TEMPLATE_SOURCE), "utf8")
  extractCppLiterals(statsSource, CPP_UI_FILE_OPTIONS[STATUS_TEMPLATE_SOURCE]).forEach((literal, index) => {
    const id = `ui:stats:${index}`
    if (uiEntries[id]?.sourceHash === sourceHash(literal.text) && statusTemplates[literal.text] === undefined) {
      statusTemplates[literal.text] = id
    }
  })

  const moduleEntries = loadSchemaFile(resolve(schemaDir, "module.json"), "module").entries
  const { templates: uiTemplates, excluded: uiTemplateExclusions } = buildUiTemplateMap(
    [...cppUiSources(UI_TEMPLATE_SOURCES), ...moduleSources(MODULE_BORON_FILES)],
    { ...uiEntries, ...moduleEntries }
  )
  const moduleNames = buildModuleNameMap(
    moduleSources([MODULE_NAME_SOURCE, MAPS_NAME_SOURCE]),
    virtueNameModuleEntries(moduleEntries)
  )
  const statusNames = extractStatusNames(moduleEntries)

  // Todo 25: vendors.b templates (web-say) and the shop/owner/item names.
  const vendorSource = {
    idPrefix: "module:Ultima-IV:vendors",
    literals: extractBoronLiterals(readFileSync(resolve(repoRoot, VENDOR_FILE), "utf8"))
  }
  const { templates: vendorTemplates, excluded: vendorTemplateExclusions } = buildVendorTemplateMap(
    [vendorSource],
    moduleEntries
  )
  const vendorNames = buildModuleNameMap(moduleSources([VENDOR_FILE, MODULE_NAME_SOURCE]), moduleEntries)

  return {
    entries,
    aliases,
    talkTemplates,
    introTemplates,
    uiTemplates,
    uiTemplateExclusions,
    moduleNames,
    statusTemplates,
    statusNames,
    vendorTemplates,
    vendorTemplateExclusions,
    vendorNames
  }
}

/**
 * Field-scoped English -> `module:Ultima-IV:config:<n>` maps for the status
 * column. Scoping by config.b section keeps a weapon's abbreviation ("STF"
 * -> "지팡") distinct from its full name ("Staff" -> "지팡이"), and takes the
 * class names from the first eight creature entries so the second "Bard"
 * (a town creature) cannot shadow the class.
 */
export function extractStatusNames(moduleEntries) {
  const source = readFileSync(resolve(repoRoot, STATUS_NAME_SOURCE), "utf8")
  const literals = extractBoronLiterals(source)
  const armorsAt = source.indexOf("\narmors:")
  const weaponsAt = source.indexOf("\nweapons:")
  const creaturesAt = source.indexOf("\ncreatures:")
  const names = { armor: {}, weapon: {}, weaponAbbrev: {}, class: {} }
  const add = (kind, literal, index) => {
    const id = `module:Ultima-IV:config:${index}`
    if (moduleEntries[id]?.sourceHash === sourceHash(literal.text) && names[kind][literal.text] === undefined) {
      names[kind][literal.text] = id
    }
  }
  const weaponLiterals = []
  literals.forEach((literal, index) => {
    if (literal.offset > armorsAt && literal.offset < weaponsAt) add("armor", literal, index)
    else if (literal.offset > weaponsAt && literal.offset < creaturesAt) weaponLiterals.push([literal, index])
  })
  // weapons: ["ABBR" "Name" range damage ...] -- quoted literals come in pairs.
  for (let i = 0; i + 1 < weaponLiterals.length; i += 2) {
    add("weaponAbbrev", ...weaponLiterals[i])
    add("weapon", ...weaponLiterals[i + 1])
  }
  const classPattern = /\(id:\s*([2-9])\s+name:\s*"([^"]*)"/g
  for (const match of source.matchAll(classPattern)) {
    const quoteAt = match.index + match[0].length - match[2].length - 2
    const index = literals.findIndex((literal) => literal.offset === quoteAt)
    if (index >= 0) add("class", literals[index], index)
  }
  return names
}


function renderTypeScript({
  entries,
  aliases,
  talkTemplates,
  introTemplates,
  uiTemplates,
  moduleNames,
  statusTemplates,
  statusNames,
  vendorTemplates,
  vendorNames
}) {
  const header =
    "// DO NOT EDIT -- generated by `npm run i18n:generate` (scripts/i18n-generate.mjs)\n" +
    "// Source of truth: locales/ko/*.json. Only ready (translated) entries are emitted;\n" +
    "// pending entries fall back to English at runtime until Todo 15 fills the corpus.\n"
  const body = {
    $schema: "ultima-web/i18n-generated/v1",
    entries,
    aliases,
  }
  return (
    `${header}export interface GeneratedI18nEntry {\n` +
    `  readonly translation: string\n` +
    `  readonly placeholders: readonly string[]\n` +
    `  readonly status?: string\n` +
    `  readonly category?: string\n` +
    `  readonly maxWidthColumns?: number\n` +
    `}\n\n` +
    `export interface GeneratedAliasEntry {\n` +
    `  readonly alias: string\n` +
    `  readonly canonical: string\n` +
    `}\n\n` +
    `export const GENERATED_I18N_ENTRIES: Record<string, GeneratedI18nEntry> = ` +
    `${JSON.stringify(entries, null, 2)}\n\n` +
    `export const GENERATED_ALIASES: Record<string, GeneratedAliasEntry> = ` +
    `${JSON.stringify(aliases, null, 2)}\n\n` +
    `// Todo 22: exact screenMessage format literal (vendor/xu4/src/discourse_tlk.cpp) -> ui id.\n` +
    `export const GENERATED_TALK_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(talkTemplates, null, 2)}\n\n` +
    `// Todo 26: exact intro.cpp literal (menu labels/titles, prompts) -> ui id.\n` +
    `export const GENERATED_INTRO_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(introTemplates, null, 2)}\n\n` +
    `// Todo 27: exact stats.cpp literal (status column labels/titles) -> ui id.\n` +
    `export const GENERATED_STATUS_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(statusTemplates, null, 2)}\n\n` +
    `// Todo 27: field (armor/weapon/weaponAbbrev/class) -> English name -> module config id.\n` +
    `export const GENERATED_STATUS_NAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = ` +
    `${JSON.stringify(statusNames, null, 2)}\n\n` +
    `// Todo 23: FNV-1a hash of a screenMessage format (vendor/xu4/src/screen.cpp web hook) -> ui/module id.\n` +
    `export const GENERATED_UI_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(uiTemplates, null, 2)}\n\n` +
    `// Todo 23: English module config name (a screenMessage %s argument) -> module id.\n` +
    `export const GENERATED_MODULE_NAMES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(moduleNames, null, 2)}\n\n` +
    `// Todo 25: FNV-1a hash of a vendors.b template's runtime bytes (web-say) -> Korean runtime text.\n` +
    `export const GENERATED_VENDOR_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(vendorTemplates, null, 2)}\n\n` +
    `// Todo 25: English shop/owner/item name (a web-say symbol value) -> module id.\n` +
    `export const GENERATED_VENDOR_NAMES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(vendorNames, null, 2)}\n\n` +
    `export const GENERATED_I18N_META = ${JSON.stringify(body.$schema)} as const\n`
  )
}

function renderCInclude({ entries }) {
  const header =
    "/* DO NOT EDIT -- generated by `npm run i18n:generate` (scripts/i18n-generate.mjs).\n" +
    " * Source of truth: the locales-ko JSON files. Compiled into u4_i18n_lookup.c; the\n" +
    " * engine never parses JSON at runtime. Pending entries are not emitted. */\n"
  const ids = Object.keys(entries).sort((a, b) => a.localeCompare(b))
  const rows = ids.map((id) => {
    const entry = entries[id]
    const sig = [...entry.placeholders].sort((a, b) => a.localeCompare(b)).join(" ")
    const isCommand = entry.category === "command" || id.startsWith("cmd:") ? 1 : 0
    const width =
      typeof entry.maxWidthColumns === "number"
        ? entry.maxWidthColumns
        : entry.category === "status"
          ? 15
          : 0
    return `    { "${escapeC(id)}", "${escapeC(entry.translation)}", "${escapeC(sig)}", ${isCommand}, ${width} },`
  })
  return (
    `${header}const U4I18nEntry U4_I18N_STATIC_TABLE[] = {\n` +
    (rows.length > 0 ? `${rows.join("\n")}\n` : "") +
    `};\nconst int U4_I18N_STATIC_COUNT = ${ids.length};\n`
  )
}

function renderBoronOverlay({ entries }) {
  const header =
    "; DO NOT EDIT -- generated by `npm run i18n:generate` (scripts/i18n-generate.mjs).\n" +
    "; Source of truth: locales/ko/*.json. Boron translation-overlay fragment:\n" +
    "; each line maps one semantic ID (module/TLK/binary display entries) to\n" +
    "; its Korean display text. Consumed by the config_boron translation\n" +
    "; overlay path; internal command keys are never emitted here.\n"
  const ids = Object.keys(entries)
    .filter((id) => !id.startsWith("cmd:") && entries[id].category !== "command")
    .sort((a, b) => a.localeCompare(b))
  const lines = ids.map((id) => `  ${id}: ${boronQuote(entries[id].translation)}`)
  return `${header}ko-translations: [\n${lines.length > 0 ? `${lines.join("\n")}\n` : ""}]\n`.replace(/[ \t]+$/gm, "")
}

function main() {
  const args = process.argv.slice(2)
  const schemaDir = resolve(args[0] ?? "locales/ko")
  const tables = generateI18nTables(schemaDir)

  const outputs = [
    [resolve(repoRoot, "src/i18n/generated/strings.ts"), renderTypeScript(tables)],
    [resolve(repoRoot, "native/i18n/u4_i18n_table.inc"), renderCInclude(tables)],
    [resolve(repoRoot, "native/i18n/ko-overlay.b"), renderBoronOverlay(tables)],
  ]
  for (const [path, content] of outputs) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, "utf8")
  }
  const translated = Object.keys(tables.entries).length
  const aliases = Object.keys(tables.aliases).length
  console.log(
    `i18n:generate: ${translated} translated entries + ${aliases} aliases from ${schemaDir} -> ` +
      `src/i18n/generated/strings.ts, native/i18n/u4_i18n_table.inc, native/i18n/ko-overlay.b`
  )
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
