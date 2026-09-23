#!/usr/bin/env node
/**
 * npm run i18n:check
 *
 * Validates the public `locales/ko/*.json` Korean localization schema.
 * Never reads the original game ZIP and never needs it -- this only
 * checks the already-extracted, hash-based public schema.
 *
 * Usage: node scripts/i18n-check.mjs [schemaDir] [--strict]
 *   schemaDir defaults to "locales/ko".
 *   --strict requires every entry to be translated (used by Todo 15's
 *   full-corpus completion gate). Without --strict, entries whose
 *   `status` is "pending" are allowed to have no translation yet --
 *   Todo 4 only has to deliver the schema/validator, not the corpus.
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extractPlaceholders, placeholdersEqual } from "./lib/placeholders.mjs"
import { displayWidth, STATUS_AREA_WIDTH_COLUMNS } from "./lib/text-width.mjs"
import { findAliasCollisions } from "./lib/alias-check.mjs"
import { loadSchemaFile } from "./lib/schema-io.mjs"

const TRANSLATABLE_FILES = ["ui", "module", "binary", "tlk", "glossary"]

function checkTranslatableFile(fileId, data, strict, failures) {
  for (const [key, entry] of Object.entries(data.entries)) {
    const label = `locales/ko/${fileId}.json entry "${key}"`
    const isPending = entry.status === "pending"

    if (entry.stale === true) {
      failures.push(
        `${label}: source text changed since this entry was last translated (sourceHash drift) -- re-review before shipping`
      )
      continue
    }

    if (isPending) {
      if (strict) {
        failures.push(`${label}: has no translation yet (status "pending" is not allowed with --strict)`)
      }
      continue
    }

    const translation = typeof entry.translation === "string" ? entry.translation : ""
    if (translation.trim().length === 0) {
      failures.push(`${label}: is marked "${entry.status}" but has no translation`)
      continue
    }

    const placeholders = Array.isArray(entry.placeholders) ? entry.placeholders : []
    if (placeholders.length > 0 && !placeholdersEqual(placeholders, translation)) {
      failures.push(
        `${label}: placeholder mismatch -- source expects [${placeholders.join(", ")}], ` +
          `translation has [${extractPlaceholders(translation).join(", ")}]`
      )
      continue
    }

    if (entry.category === "status") {
      const maxWidth =
        typeof entry.maxWidthColumns === "number" ? entry.maxWidthColumns : STATUS_AREA_WIDTH_COLUMNS
      const width = displayWidth(translation)
      if (width > maxWidth) {
        failures.push(
          `${label}: translation is ${width} display columns wide, exceeds status-line budget of ` +
            `${maxWidth} (see vendor/xu4/src/stats.h:13 STATS_AREA_WIDTH)`
        )
      }
    }
  }
}

function checkAliasFile(data, failures) {
  const collisions = findAliasCollisions(data.entries)
  for (const collision of collisions) {
    if (collision.type === "duplicate-alias") {
      const ids = collision.entries.map((occurrence) => occurrence.id).join(", ")
      failures.push(
        `locales/ko/aliases.json: alias "${collision.alias}" is registered by more than one entry (${ids})`
      )
    } else if (collision.type === "alias-shadows-canonical") {
      failures.push(
        `locales/ko/aliases.json entry "${collision.entryId}": alias "${collision.alias}" collides with ` +
          `canonical keyword of entry "${collision.shadowedEntryId}" ("${collision.shadowedCanonical}")`
      )
    }
  }
}

export function runI18nCheck(schemaDir, { strict = false } = {}) {
  const failures = []
  let entryCount = 0
  let pendingCount = 0

  for (const fileId of TRANSLATABLE_FILES) {
    const data = loadSchemaFile(resolve(schemaDir, `${fileId}.json`), fileId)
    entryCount += Object.keys(data.entries).length
    pendingCount += Object.values(data.entries).filter((entry) => entry.status === "pending").length
    checkTranslatableFile(fileId, data, strict, failures)
  }

  const aliasData = loadSchemaFile(resolve(schemaDir, "aliases.json"), "aliases")
  entryCount += Object.keys(aliasData.entries).length
  checkAliasFile(aliasData, failures)

  return { failures, entryCount, pendingCount }
}

function main() {
  const args = process.argv.slice(2)
  const strict = args.includes("--strict")
  const positional = args.filter((arg) => !arg.startsWith("--"))
  const schemaDir = resolve(positional[0] ?? "locales/ko")

  const { failures, entryCount, pendingCount } = runI18nCheck(schemaDir, { strict })

  if (failures.length > 0) {
    console.error(`i18n:check failed with ${failures.length} problem(s) in ${schemaDir}:`)
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
    return
  }

  console.log(
    `i18n:check passed: ${entryCount} entries checked in ${schemaDir} ` +
      `(${pendingCount} still pending translation${strict ? ", but --strict was set!" : ""}).`
  )
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    main()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown i18n:check error"
    console.error(`i18n:check failed: ${reason}`)
    process.exitCode = 1
  }
}
