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
import { GENERATED_ALIASES, GENERATED_I18N_ENTRIES } from "./generated/strings.ts"

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

/** Type guard keeping the generated table assignable to {@link LocalizationTable}. */
export function generatedEntriesAreLocalizationTable(
  entries: Record<string, GeneratedI18nEntry>
): entries is LocalizationTable {
  return Object.values(entries).every(
    (entry) => typeof entry.translation === "string" && Array.isArray(entry.placeholders)
  )
}
