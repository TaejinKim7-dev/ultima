import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export const SCHEMA_FILES = ["ui", "module", "binary", "tlk", "aliases", "glossary"]

// Fields a human translator/curator may set on a schema entry that must
// survive re-running `npm run i18n:inventory` (which only ever recomputes
// sourceHash/placeholders from the current source).
const HUMAN_OWNED_FIELDS = ["translation", "status", "category", "maxWidthColumns", "notes", "demo"]

export function emptySchemaFile(schemaId) {
  return { $schema: `ultima-web/i18n-schema/${schemaId}/v1`, entries: {} }
}

export function loadSchemaFile(path, schemaId) {
  if (!existsSync(path)) return emptySchemaFile(schemaId)
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  if (typeof parsed !== "object" || parsed === null || typeof parsed.entries !== "object") {
    throw new Error(`${path}: expected an object with an "entries" map`)
  }
  return parsed
}

export function saveSchemaFile(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const sortedEntries = {}
  for (const key of Object.keys(data.entries).sort((a, b) => a.localeCompare(b))) {
    sortedEntries[key] = data.entries[key]
  }
  writeFileSync(path, `${JSON.stringify({ ...data, entries: sortedEntries }, null, 2)}\n`, "utf8")
}

/**
 * Merge freshly-extracted entries (sourceHash/placeholders only) into an
 * existing public schema, preserving every human-owned field (translation,
 * status, category, maxWidthColumns, notes, demo) already recorded for a
 * key. When a key's sourceHash changed, the entry is marked `stale: true`
 * (translation kept, but flagged for re-review) instead of being silently
 * overwritten or wiped -- this is the "drift detection" the schema exists
 * for.
 */
export function mergeEntries(oldEntries, freshEntries) {
  const merged = {}
  const addedKeys = []
  const staleKeys = []
  const removedKeys = []
  const remainingOldKeys = new Set(Object.keys(oldEntries))

  for (const [key, fresh] of Object.entries(freshEntries)) {
    const old = oldEntries[key]
    if (!old) {
      merged[key] = { ...fresh, translation: "", status: "pending" }
      addedKeys.push(key)
      continue
    }
    remainingOldKeys.delete(key)

    const preserved = {}
    for (const field of HUMAN_OWNED_FIELDS) {
      if (field in old) preserved[field] = old[field]
    }
    if (!("translation" in preserved)) preserved.translation = ""
    if (!("status" in preserved)) preserved.status = "pending"

    if (old.sourceHash !== fresh.sourceHash) {
      merged[key] = { ...fresh, ...preserved, stale: true }
      staleKeys.push(key)
    } else {
      const { stale, ...preservedWithoutStale } = preserved
      merged[key] = { ...fresh, ...preservedWithoutStale }
    }
  }

  for (const key of remainingOldKeys) removedKeys.push(key)

  return { merged, addedKeys, staleKeys, removedKeys }
}
