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

const TRANSLATABLE_FILES = ["ui", "module", "binary", "tlk", "glossary"]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function fileIdOf(relativePath) {
  return relativePath.slice(relativePath.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "")
}

// Same id scheme (and extractor options) as i18n-inventory.mjs's
// extractUiEntries(): `ui:<file>:<literal index>`.
function cppUiSources() {
  return CPP_UI_FILES.map((relativePath) => ({
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

  const moduleEntries = loadSchemaFile(resolve(schemaDir, "module.json"), "module").entries
  const { templates: uiTemplates, excluded: uiTemplateExclusions } = buildUiTemplateMap(
    [...cppUiSources(), ...moduleSources(MODULE_BORON_FILES)],
    { ...uiEntries, ...moduleEntries }
  )
  const moduleNames = buildModuleNameMap(moduleSources([MODULE_NAME_SOURCE]), moduleEntries)

  return { entries, aliases, talkTemplates, uiTemplates, uiTemplateExclusions, moduleNames }
}

function renderTypeScript({ entries, aliases, talkTemplates, uiTemplates, moduleNames }) {
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
    `// Todo 23: FNV-1a hash of a screenMessage format (vendor/xu4/src/screen.cpp web hook) -> ui/module id.\n` +
    `export const GENERATED_UI_TEMPLATES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(uiTemplates, null, 2)}\n\n` +
    `// Todo 23: English module config name (a screenMessage %s argument) -> module id.\n` +
    `export const GENERATED_MODULE_NAMES: Readonly<Record<string, string>> = ` +
    `${JSON.stringify(moduleNames, null, 2)}\n\n` +
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
