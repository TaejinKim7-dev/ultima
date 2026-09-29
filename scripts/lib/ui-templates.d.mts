/** Type surface of scripts/lib/ui-templates.mjs for the unit tests that import it. */
export interface TemplateEntry {
  sourceHash: string
  translation: string
  status?: string
}
export interface TemplateSource {
  idPrefix: string
  literals: string[]
}
export function fnv1a32(text: string): string
export function orderedPlaceholders(text: string): string[]
export function isPlaceholderOnly(text: string): boolean
export function buildUiTemplateMap(
  sources: TemplateSource[],
  entries: Record<string, TemplateEntry>
): { templates: Record<string, string>; excluded: { id: string; reason: string }[] }
export function buildModuleNameMap(
  sources: TemplateSource[],
  entries: Record<string, TemplateEntry>,
  maxLength?: number
): Record<string, string>
