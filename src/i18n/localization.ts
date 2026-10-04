// Todo 14: localization runtime boundary (web/TS side).
//
// Every display surface resolves through the SAME semantic IDs that
// `scripts/i18n-generate.mjs` flattens from `locales/ko/*.json` into
// `src/i18n/generated/strings.ts` (static import -- no runtime JSON fetch
// or parse on this path, and no JSON parser is linked into the C/C++
// engine either):
//   - C++ display calls: the `screenMessageN` funnel
//     (`vendor/xu4/src/screen.cpp:449`) looks up the outgoing text by
//     semantic ID in the static table (`native/i18n/u4_i18n_lookup.h`);
//   - Boron translation overlay: `native/i18n/ko-overlay.b` carries the
//     same IDs for the config_boron overlay path;
//   - TLK lookup: `map:npcIndex:field` keys (see `scripts/lib/tlk-codec.mjs`);
//   - binary text lookup: `resource:table:index` keys (TITLE.EXE/AVATAR.EXE
//     surfaces, see `scripts/lib/binary-strings.mjs`);
//   - JS UI labels: this module (`resolveDisplayText`).
//
// What stays English/ASCII, always: game logic comparisons, printf-style
// format COMMAND keys (`isCommandKeyId`), and fixed-size `.SAV`/avatar-name
// byte fields (`allowsKoreanInField` -- mirrors Todo 13's
// `src/i18n/korean-aliases.ts` prompt rules and `savegame.h`'s fixed
// `char name[16]`).

import type { GeneratedI18nEntry } from "./generated/strings.ts"
import {
  GENERATED_ALIASES,
  GENERATED_ARGUMENT_NAMES,
  GENERATED_I18N_ENTRIES,
  GENERATED_INTRO_TEMPLATES,
  GENERATED_MODULE_NAMES,
  GENERATED_STATUS_NAMES,
  GENERATED_STATUS_TEMPLATES,
  GENERATED_TALK_TEMPLATES,
  GENERATED_TOPIC_GLOSSES,
  GENERATED_TOPIC_GLOSS_OVERRIDES,
  GENERATED_UI_TEMPLATES,
  GENERATED_VENDOR_NAMES,
  GENERATED_VENDOR_TEMPLATES
} from "./generated/strings.ts"

/** One localization table entry as seen by this runtime (generated rows share this shape). */
export interface LocalizationEntry {
  readonly translation: string
  readonly placeholders: readonly string[]
  readonly status?: string
  readonly category?: string
  readonly maxWidthColumns?: number
}

export type LocalizationTable = Record<string, LocalizationEntry>

/** Field kinds asking whether Korean display text may appear there. */
export type LocalizedField = "dialogue" | "ui-label" | "avatar-name" | "number" | "command" | "direction" | "save"

/** Fixed status-column budget in display columns (vendor/xu4/src/stats.h:13 STATS_AREA_WIDTH). */
export const STATUS_WIDTH_COLUMNS = 15 as const

function tableEntry(id: string, table: LocalizationTable): LocalizationEntry | undefined {
  return table[id]
}

/**
 * Internal command keys are never localized: entries explicitly marked
 * `category: "command"` and the `cmd:` ID namespace always resolve to the
 * English fallback, so gameplay input handling never observes Korean.
 */
export function isCommandKeyId(id: string, table: LocalizationTable = GENERATED_I18N_ENTRIES): boolean {
  if (id.startsWith("cmd:")) return true
  return tableEntry(id, table)?.category === "command"
}

/** True when `id` has a non-empty Korean translation available (pending/unknown IDs do not). */
export function hasTranslation(id: string, table: LocalizationTable = GENERATED_I18N_ENTRIES): boolean {
  const entry = tableEntry(id, table)
  return entry !== undefined && entry.translation.trim().length > 0
}

/**
 * Resolves the display text for a semantic ID: the Korean translation when
 * one is ready, otherwise the English `fallback` (game logic always runs on
 * English -- Todo 15 fills the pending corpus). Command-key IDs always
 * return the fallback, even when a translation row exists.
 */
export function resolveDisplayText(
  id: string,
  fallback: string,
  table: LocalizationTable = GENERATED_I18N_ENTRIES
): string {
  if (isCommandKeyId(id, table)) return fallback
  const entry = tableEntry(id, table)
  if (entry === undefined || entry.translation.trim().length === 0) return fallback
  return entry.translation
}

/**
 * Todo 22: maps the exact format-string literal the native talk channel
 * sends (the one runTalkDialogue() passes to screenMessage in
 * vendor/xu4/src/discourse_tlk.cpp) to its `ui:discourse_tlk:<n>` semantic
 * ID, or `undefined` when it is not a known talk template.
 */
export function resolveTalkTemplateId(
  literal: string,
  table: Readonly<Record<string, string>> = GENERATED_TALK_TEMPLATES
): string | undefined {
  return Object.hasOwn(table, literal) ? table[literal] : undefined
}

/**
 * Todo 26: maps an exact intro.cpp literal (Configure menu label/title,
 * main-menu line, name/sex prompt, gypsy glue line) to its `ui:intro:<n>`
 * semantic ID, or `undefined` when it is not a known intro literal.
 */
export function resolveIntroTemplateId(
  literal: string,
  table: Readonly<Record<string, string>> = GENERATED_INTRO_TEMPLATES
): string | undefined {
  return Object.hasOwn(table, literal) ? table[literal] : undefined
}

/**
 * Todo 23: maps the FNV-1a hash (8 lowercase hex digits) of a screenMessage
 * format -- what vendor/xu4/src/screen.cpp's web hook sends instead of the
 * format text -- to its `ui:*` / `module:*` semantic ID, or `undefined` when
 * that format is not one we translate.
 */
export function resolveUiTemplateId(
  hash: string,
  table: Readonly<Record<string, string>> = GENERATED_UI_TEMPLATES
): string | undefined {
  return Object.hasOwn(table, hash) ? table[hash] : undefined
}

/** Todo 23: maps an English module config name (a screenMessage `%s` argument) to its `module:*` ID. */
export function resolveModuleNameId(
  text: string,
  table: Readonly<Record<string, string>> = GENERATED_MODULE_NAMES
): string | undefined {
  return Object.hasOwn(table, text) ? table[text] : undefined
}

/**
 * Todo 39: maps an English `%s` argument word that is not a module name (a
 * virtue adjective, the join refusal's fallback word, ...) to its glossary id.
 */
export function resolveArgumentNameId(
  text: string,
  table: Readonly<Record<string, string>> = GENERATED_ARGUMENT_NAMES
): string | undefined {
  return Object.hasOwn(table, text) ? table[text] : undefined
}

/**
 * Todo 39: the `%s`-argument lookup the dialogue channels share. A module name
 * (weapon/creature/virtue name) wins; the scoped argument-word table is only
 * consulted when it misses.
 */
export function resolveNameArgumentId(text: string): string | undefined {
  return resolveModuleNameId(text) ?? resolveArgumentNameId(text)
}

/**
 * Todo 27: maps an exact stats.cpp literal (status column title/label) to its
 * `ui:stats:<n>` semantic ID, or `undefined` when it is not a known literal.
 */
export function resolveStatusTemplateId(
  literal: string,
  table: Readonly<Record<string, string>> = GENERATED_STATUS_TEMPLATES
): string | undefined {
  return Object.hasOwn(table, literal) ? table[literal] : undefined
}

/**
 * Todo 27: the Korean name of a weapon / weapon abbreviation / armour / class
 * (`kind` = "weapon" | "weaponAbbrev" | "armor" | "class"), from the module
 * config translations. `undefined` when the English name is not mapped or its
 * translation is not ready -- the caller falls back to the (open-source)
 * English module string.
 */
export function resolveStatusName(
  kind: string,
  english: string,
  names: Readonly<Record<string, Readonly<Record<string, string>>>> = GENERATED_STATUS_NAMES,
  table: LocalizationTable = GENERATED_I18N_ENTRIES
): string | undefined {
  const byKind = Object.hasOwn(names, kind) ? names[kind] : undefined
  const id = byKind !== undefined && Object.hasOwn(byKind, english) ? byKind[english] : undefined
  if (id === undefined || !hasTranslation(id, table)) {
    return undefined
  }
  return resolveDisplayText(id, english, table)
}

/** Todo 25: Korean runtime template for a vendors.b template hash (`web-say`), or `undefined`. */
export function resolveVendorTemplate(
  hash: string,
  table: Readonly<Record<string, string>> = GENERATED_VENDOR_TEMPLATES
): string | undefined {
  return Object.hasOwn(table, hash) ? table[hash] : undefined
}

/** Todo 25: maps an English shop/owner/item name (a `web-say` symbol value) to its `module:*` ID. */
export function resolveVendorNameId(
  text: string,
  table: Readonly<Record<string, string>> = GENERATED_VENDOR_NAMES
): string | undefined {
  return Object.hasOwn(table, text) ? table[text] : undefined
}

const PLACEHOLDER_PATTERN = /%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]|\{\d+\}/g

/** Extracts printf/`{n}` placeholders as a SORTED multiset (mirrors `scripts/lib/placeholders.mjs`). */
export function extractPlaceholders(text: string): string[] {
  if (text.length === 0) return []
  return (text.match(PLACEHOLDER_PATTERN) ?? []).slice().sort((a, b) => a.localeCompare(b))
}

/**
 * True when the entry's translation carries exactly the recorded
 * placeholder multiset (order-insensitive: Korean word order may differ).
 * A mismatch must fail the build (`npm run i18n:check`) before runtime.
 */
export function translationPlaceholdersMatch(
  id: string,
  table: LocalizationTable = GENERATED_I18N_ENTRIES
): boolean {
  const entry = tableEntry(id, table)
  if (entry === undefined) return false
  const expected = [...entry.placeholders].sort((a, b) => a.localeCompare(b))
  const actual = extractPlaceholders(entry.translation)
  return expected.length === actual.length && expected.every((token, index) => token === actual[index])
}

function isWideCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0x3130 && codePoint <= 0x318f) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xd7b0 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef)
  )
}

/** Display-column width with Hangul/wide chars = 2 columns (mirrors `scripts/lib/text-width.mjs`). */
export function displayWidth(text: string): number {
  let width = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    width += isWideCodePoint(codePoint) ? 2 : 1
  }
  return width
}

/** True when `text` fits the fixed status-column budget (default 15 columns). */
export function fitsStatusWidth(text: string, budget: number = STATUS_WIDTH_COLUMNS): boolean {
  return displayWidth(text) <= budget
}

/**
 * Fixed `.SAV`/prompt byte fields (`avatar-name`, `number`, `command`,
 * `direction`, `save`) never accept Korean -- same rule as Todo 13's
 * `resolveInput` rejections and `savegame.h`'s fixed `char name[16]`.
 */
export function allowsKoreanInField(field: LocalizedField | string): boolean {
  return field === "dialogue" || field === "ui-label"
}

/** The generated alias pairs, re-exported so UI wiring reads the same IDs as the Todo 13 resolver. */
export const GENERATED_ALIAS_ENTRIES = GENERATED_ALIASES

/**
 * Todo 48: one talkable NPC topic: the raw English matching keyword (with
 * its trailing padding trimmed) and its Korean gloss. The keyword is what
 * xu4's native prefix matcher compares (discourse_tlk.cpp ~482-496); the
 * gloss is what the keyword menu and the Korean input alias resolution
 * show/accept.
 */
export interface NpcTopic {
  readonly keyword: string
  readonly gloss: string
}

/**
 * Todo 48: the two usable topic keywords of one NPC (`npcKey` is the
 * `MAP:npcIndex` shape of a `@MAP:npcIndex:field` talk argument). Returns
 * them in native matching order (topic1 then topic2). Deliberately drops:
 *   - the unused-keyword marker "A   ";
 *   - keywords whose raw form fails `^[A-Za-z0-9 ]+$` -- this removes
 *     "BEH." (YEW:6), whose '.' cannot be typed into the native prompt;
 *   - keywords with no ready gloss (a data gap would show a dead chip).
 * The gloss comes from the per-slot override row when one exists, else the
 * default `npc-topic-*` row.
 */
export function resolveNpcTopics(npcKey: string): NpcTopic[] {
  const topics: NpcTopic[] = []
  for (const field of ["topic1", "topic2"] as const) {
    const entry = GENERATED_I18N_ENTRIES[`${npcKey}:${field}`]
    const raw = entry?.translation
    if (raw === undefined) continue
    if (raw.trim() === "A") continue
    if (!/^[A-Za-z0-9 ]+$/.test(raw)) continue
    const overrideId = GENERATED_TOPIC_GLOSS_OVERRIDES[`${npcKey}:${field}`]
    const glossId = overrideId ?? GENERATED_TOPIC_GLOSSES[raw]
    const gloss = glossId === undefined ? "" : resolveDisplayText(glossId, "")
    if (gloss === "") continue
    topics.push({ keyword: raw.trim(), gloss })
  }
  return topics
}

/** Type guard keeping the generated table assignable to {@link LocalizationTable}. */
export function generatedEntriesAreLocalizationTable(
  entries: Record<string, GeneratedI18nEntry>
): entries is LocalizationTable {
  return Object.values(entries).every(
    (entry) => typeof entry.translation === "string" && Array.isArray(entry.placeholders)
  )
}
