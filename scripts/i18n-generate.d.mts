/** Type surface of scripts/i18n-generate.mjs for the unit tests that import it. */
export interface GeneratedTables {
  entries: Record<string, { translation: string; placeholders: string[] }>
  aliases: Record<string, unknown>
  talkTemplates: Record<string, string>
  // Todo 32: these three were missing from this hand-maintained interface, so
  // the tables intro.cpp / stats.cpp introduced in Todos 26 and 27 were
  // invisible to `tsc` even though generateI18nTables() has always returned
  // them. Added so the declaration matches the real return value; type-only,
  // no generated output changes. The `ui:stats:*` and `ui:intro:*` ids are
  // deliberately kept in their own maps, out of `uiTemplates` -- see the
  // UI_TEMPLATE_SOURCES comment in i18n-generate.mjs for why merging them
  // would double-draw a line.
  introTemplates: Record<string, string>
  uiTemplates: Record<string, string>
  uiTemplateExclusions: { id: string; reason: string }[]
  statusTemplates: Record<string, string>
  statusNames: { armor: Record<string, string>; weapon: Record<string, string>; weaponAbbrev: Record<string, string>; class: Record<string, string> }
  // Todo 32: the eight virtue names now come from here, not from a hand-edit
  // of src/i18n/generated/strings.ts.
  moduleNames: Record<string, string>
  statusNames: Record<string, Record<string, string>>
  vendorTemplates: Record<string, string>
  vendorTemplateExclusions: { id: string; reason: string }[]
  vendorNames: Record<string, string>
}
export function generateI18nTables(schemaDir: string): GeneratedTables
/**
 * Todo 32: the module entries buildModuleNameMap() may resolve -- every
 * config.b row plus exactly the shrine `virtue:` rows of maps.b. Exported so a
 * test can assert the filter admits the eight virtues and nothing else.
 */
export function virtueNameModuleEntries(moduleEntries: Record<string, { sourceHash: string; translation: string; status: string }>): Record<string, { sourceHash: string; translation: string; status: string }>
export function extractStatusNames(moduleEntries: Record<string, { sourceHash: string }>): { armor: Record<string, string>; weapon: Record<string, string>; weaponAbbrev: Record<string, string>; class: Record<string, string> }
