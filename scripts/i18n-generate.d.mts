/** Type surface of scripts/i18n-generate.mjs for the unit tests that import it. */
export interface GeneratedTables {
  entries: Record<string, { translation: string; placeholders: string[] }>
  aliases: Record<string, unknown>
  talkTemplates: Record<string, string>
  uiTemplates: Record<string, string>
  uiTemplateExclusions: { id: string; reason: string }[]
  moduleNames: Record<string, string>
}
export function generateI18nTables(schemaDir: string): GeneratedTables
