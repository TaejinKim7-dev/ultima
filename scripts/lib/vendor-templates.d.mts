/** Type surface of scripts/lib/vendor-templates.mjs for the unit tests that import it. */
import type { TemplateEntry } from "./ui-templates.d.mts"
export interface VendorLiteral {
  form: string
  text: string
}
export interface VendorSource {
  idPrefix: string
  literals: VendorLiteral[]
}
export function boronRuntimeText(text: string, form: string): string
export function buildVendorTemplateMap(
  sources: VendorSource[],
  entries: Record<string, TemplateEntry>
): { templates: Record<string, string>; excluded: { id: string; reason: string }[] }
