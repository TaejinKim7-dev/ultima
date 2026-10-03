/** Type surface of scripts/i18n-coverage-report.mjs for the unit tests that import it. */
export interface Location {
  file: string
  line: number
}
export interface ReverseMaps {
  ui: Map<string, Location[]>
  literal: Map<string, Location[]>
  vendor: Map<string, Location[]>
  formatOnly?: Set<string>
  controlOnly?: Set<string>
}
export interface CoverageRow {
  key: string
  count: number
}
export type MergedSnapshot = Record<
  "ui-unmapped" | "vendor-unmapped" | "talk-unmapped" | "resolve-fallback" | "arg-passthrough",
  CoverageRow[]
> & { rejected: number }
export const KINDS: readonly string[]
export function buildReverseMaps(input: {
  cppSources: { file: string; text: string }[]
  vendorSource?: { file: string; text: string }
  moduleSources?: { file: string; text: string }[]
}): ReverseMaps
export function mergeSnapshots(snapshots: readonly Record<string, unknown>[]): MergedSnapshot
export function renderReport(
  merged: MergedSnapshot,
  maps: ReverseMaps,
  options?: { specCount?: number; unavailableCount?: number }
): string
export function loadSnapshots(paths: string[]): { snapshots: Record<string, unknown>[]; unavailable: number }
