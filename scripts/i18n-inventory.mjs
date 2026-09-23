#!/usr/bin/env node
/**
 * npm run i18n:inventory
 *
 * Extracts every known English display-text source into:
 *   - a PRIVATE, git-ignored full corpus under `.local/i18n-inventory/`
 *     (readable English text + hashes, for the human translator's own
 *     use -- never committed, never published)
 *   - the PUBLIC `locales/ko/*.json` schema (semantic id, sourceHash,
 *     placeholder signature, empty/preserved translation -- NEVER the
 *     original English text itself)
 *
 * Sources:
 *   - Boron module scripts (vendor/xu4/module/**\/*.b, Credits) -- always
 *     available, read directly from the repo.
 *   - A curated set of player-visible C++ call sites (screenMessage,
 *     Menu::add) -- always available, read directly from the repo.
 *   - TLK NPC dialogue + TITLE.EXE/AVATAR.EXE binary string tables --
 *     only when $ULTIMA4_DATA points at a verified original data ZIP.
 *     Without it, this script still succeeds (exit 0) for the first two
 *     sources and prints a clear message explaining what was skipped and
 *     why, so it never blocks a machine that doesn't have the original
 *     data (CI, a fresh clone, ...).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { sourceHash } from "./lib/hash.mjs"
import { extractPlaceholders } from "./lib/placeholders.mjs"
import { extractBoronLiterals } from "./lib/boron-strings.mjs"
import { extractCppLiterals } from "./lib/cpp-strings.mjs"
import { TLK_FIELD_ORDER, TLK_RECORDS_PER_FILE, TLK_RECORD_SIZE, isUnusedRecord, parseTlkRecord, tlkKey } from "./lib/tlk-codec.mjs"
import { binaryKey, extractBinaryTables } from "./lib/binary-strings.mjs"
import { extractZipEntry, listZipEntries } from "./lib/zip-extract.mjs"
import { loadSchemaFile, mergeEntries, saveSchemaFile } from "./lib/schema-io.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const MODULE_BORON_FILES = [
  "vendor/xu4/module/Ultima-IV/config.b",
  "vendor/xu4/module/Ultima-IV/vendors.b",
  "vendor/xu4/module/Ultima-IV/graphics.b",
  "vendor/xu4/module/Ultima-IV/maps.b",
  "vendor/xu4/module/U4-Upgrade/config.b",
  "vendor/xu4/module/U4-Upgrade/graphics.b"
]
const MODULE_CREDITS_FILES = [
  "vendor/xu4/module/Ultima-IV/Credits",
  "vendor/xu4/module/U4-Upgrade/Credits"
]

// Player-visible call sites, see scripts/lib/cpp-strings.mjs for the scope
// rationale (screenMessage/Menu::add only, not all ~76 src files).
const CPP_UI_FILES = [
  "vendor/xu4/src/game.cpp",
  "vendor/xu4/src/menu.cpp",
  "vendor/xu4/src/menuitem.cpp",
  "vendor/xu4/src/stats.cpp",
  "vendor/xu4/src/event.cpp",
  "vendor/xu4/src/combat.cpp",
  "vendor/xu4/src/item.cpp",
  "vendor/xu4/src/creature.cpp",
  "vendor/xu4/src/dungeon.cpp",
  "vendor/xu4/src/camp.cpp",
  "vendor/xu4/src/portal.cpp",
  "vendor/xu4/src/death.cpp",
  "vendor/xu4/src/spell.cpp",
  "vendor/xu4/src/intro.cpp"
]

const TLK_MAPS = [
  "BRITAIN",
  "COVE",
  "DEN",
  "EMPATH",
  "JHELOM",
  "LCB",
  "LYCAEUM",
  "MAGINCIA",
  "MINOC",
  "MOONGLOW",
  "PAWS",
  "SERPENT",
  "SKARA",
  "TRINSIC",
  "VESPER",
  "YEW"
]

function extractModuleEntries() {
  const fresh = {}
  const privateCorpus = {}
  let identifierCount = 0
  let displayCount = 0

  for (const relativePath of MODULE_BORON_FILES) {
    const absolutePath = resolve(repoRoot, relativePath)
    const source = readFileSync(absolutePath, "utf8")
    const literals = extractBoronLiterals(source)
    const fileId = basename(relativePath, extname(relativePath))
    const moduleRoot = relativePath.includes("U4-Upgrade") ? "U4-Upgrade" : "Ultima-IV"

    literals.forEach((literal, index) => {
      if (literal.text.length === 0) return
      const key = `module:${moduleRoot}:${fileId}:${index}`
      if (literal.kind === "identifier") identifierCount++
      else displayCount++

      fresh[key] = {
        sourceHash: sourceHash(literal.text),
        placeholders: extractPlaceholders(literal.text),
        kind: literal.kind,
        form: literal.form,
        sourceFile: relativePath
      }
      privateCorpus[key] = { ...fresh[key], sourceText: literal.text }
    })
  }

  for (const relativePath of MODULE_CREDITS_FILES) {
    const absolutePath = resolve(repoRoot, relativePath)
    const text = readFileSync(absolutePath, "utf8")
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
    const moduleRoot = relativePath.includes("U4-Upgrade") ? "U4-Upgrade" : "Ultima-IV"

    paragraphs.forEach((paragraph, index) => {
      const key = `module:${moduleRoot}:Credits:${index}`
      displayCount++
      fresh[key] = {
        sourceHash: sourceHash(paragraph),
        placeholders: extractPlaceholders(paragraph),
        kind: "display",
        form: "credits-paragraph",
        sourceFile: relativePath
      }
      privateCorpus[key] = { ...fresh[key], sourceText: paragraph }
    })
  }

  return { fresh, privateCorpus, identifierCount, displayCount }
}

function extractUiEntries() {
  const fresh = {}
  const privateCorpus = {}

  for (const relativePath of CPP_UI_FILES) {
    const absolutePath = resolve(repoRoot, relativePath)
    const source = readFileSync(absolutePath, "utf8")
    const literals = extractCppLiterals(source)
    const fileId = basename(relativePath, extname(relativePath))

    literals.forEach((literal, index) => {
      const key = `ui:${fileId}:${index}`
      fresh[key] = {
        sourceHash: sourceHash(literal.text),
        placeholders: extractPlaceholders(literal.text),
        sourceFile: relativePath
      }
      privateCorpus[key] = { ...fresh[key], sourceText: literal.text }
    })
  }

  return { fresh, privateCorpus }
}

function findZipEntryName(entries, wanted) {
  return entries.find((entry) => entry.toUpperCase() === wanted.toUpperCase())
}

function extractTlkEntries(zipPath) {
  const fresh = {}
  const privateCorpus = {}
  const zipEntries = listZipEntries(zipPath)
  let unusedRecordCount = 0
  let fieldCount = 0

  for (const map of TLK_MAPS) {
    const entryName = findZipEntryName(zipEntries, `${map}.TLK`)
    if (!entryName) {
      throw new Error(`original data ZIP is missing expected entry ${map}.TLK`)
    }
    const buffer = extractZipEntry(zipPath, entryName)
    const expectedSize = TLK_RECORDS_PER_FILE * TLK_RECORD_SIZE
    if (buffer.length !== expectedSize) {
      throw new Error(`${entryName} is ${buffer.length} bytes, expected exactly ${expectedSize}`)
    }

    for (let npcIndex = 0; npcIndex < TLK_RECORDS_PER_FILE; npcIndex++) {
      const record = parseTlkRecord(buffer, npcIndex * TLK_RECORD_SIZE)
      if (isUnusedRecord(record)) {
        unusedRecordCount++
        continue
      }
      for (const field of TLK_FIELD_ORDER) {
        const bytes = record.fields[field]
        if (bytes.length === 0) continue
        const decoded = bytes.toString("latin1")
        const key = tlkKey(map, npcIndex, field)
        fresh[key] = {
          sourceHash: sourceHash(bytes),
          placeholders: extractPlaceholders(decoded)
        }
        privateCorpus[key] = { ...fresh[key], sourceText: decoded }
        fieldCount++
      }
    }
  }

  return { fresh, privateCorpus, unusedRecordCount, fieldCount }
}

function extractBinaryEntries(zipPath) {
  const fresh = {}
  const privateCorpus = {}
  const zipEntries = listZipEntries(zipPath)

  const buffers = {}
  for (const resourceName of ["title.exe", "avatar.exe"]) {
    const entryName = findZipEntryName(zipEntries, resourceName)
    if (!entryName) {
      throw new Error(`original data ZIP is missing expected entry ${resourceName}`)
    }
    buffers[resourceName] = extractZipEntry(zipPath, entryName)
  }

  const tableEntries = extractBinaryTables(buffers)
  let emptySlotCount = 0
  for (const entry of tableEntries) {
    if (entry.bytes.length === 0) {
      emptySlotCount++
      continue
    }
    const decoded = entry.bytes.toString("latin1")
    const key = binaryKey(entry.resource, entry.table, entry.index)
    fresh[key] = {
      sourceHash: sourceHash(entry.bytes),
      placeholders: extractPlaceholders(decoded)
    }
    privateCorpus[key] = { ...fresh[key], sourceText: decoded }
  }

  return { fresh, privateCorpus, emptySlotCount, tableCount: tableEntries.length }
}

function writePrivateCorpus(privateDir, name, corpus) {
  mkdirSync(privateDir, { recursive: true })
  writeFileSync(resolve(privateDir, `${name}.json`), `${JSON.stringify(corpus, null, 2)}\n`, "utf8")
}

function writePublicSchema(publicDir, name, freshEntries) {
  const path = resolve(publicDir, `${name}.json`)
  const existing = loadSchemaFile(path, name)
  const { merged, addedKeys, staleKeys, removedKeys } = mergeEntries(existing.entries, freshEntries)
  saveSchemaFile(path, { $schema: existing.$schema ?? `ultima-web/i18n-schema/${name}/v1`, entries: merged })
  return { addedKeys, staleKeys, removedKeys }
}

function parseArgs(argv) {
  const options = { publicDir: "locales/ko", privateDir: ".local/i18n-inventory" }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-public") options.publicDir = argv[++i]
    else if (argv[i] === "--out-private") options.privateDir = argv[++i]
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const publicDir = resolve(repoRoot, options.publicDir)
  const privateDir = resolve(repoRoot, options.privateDir)

  const moduleResult = extractModuleEntries()
  const moduleReport = writePublicSchema(publicDir, "module", moduleResult.fresh)
  writePrivateCorpus(privateDir, "module", moduleResult.privateCorpus)
  console.log(
    `module: ${Object.keys(moduleResult.fresh).length} candidate entries ` +
      `(${moduleResult.displayCount} display, ${moduleResult.identifierCount} identifier-like), ` +
      `${moduleReport.addedKeys.length} new, ${moduleReport.staleKeys.length} stale, ${moduleReport.removedKeys.length} removed`
  )

  const uiResult = extractUiEntries()
  const uiReport = writePublicSchema(publicDir, "ui", uiResult.fresh)
  writePrivateCorpus(privateDir, "ui", uiResult.privateCorpus)
  console.log(
    `ui: ${Object.keys(uiResult.fresh).length} candidate entries, ` +
      `${uiReport.addedKeys.length} new, ${uiReport.staleKeys.length} stale, ${uiReport.removedKeys.length} removed`
  )

  const zipPath = process.env.ULTIMA4_DATA
  if (!zipPath || !existsSync(zipPath)) {
    console.warn(
      "ULTIMA4_DATA is not set (or does not point at an existing file) -- skipping TLK and TITLE.EXE/" +
        "AVATAR.EXE extraction. Set ULTIMA4_DATA=/absolute/path/to/verified/ultima4.zip and re-run to " +
        "include those sources. module/ui extraction above still completed successfully."
    )
  } else {
    const tlkResult = extractTlkEntries(zipPath)
    const tlkReport = writePublicSchema(publicDir, "tlk", tlkResult.fresh)
    writePrivateCorpus(privateDir, "tlk", tlkResult.privateCorpus)
    console.log(
      `tlk: ${tlkResult.fieldCount} field entries across ${TLK_MAPS.length} maps ` +
        `(${tlkResult.unusedRecordCount} unused NPC slots skipped), ` +
        `${tlkReport.addedKeys.length} new, ${tlkReport.staleKeys.length} stale, ${tlkReport.removedKeys.length} removed`
    )

    const binaryResult = extractBinaryEntries(zipPath)
    const binaryReport = writePublicSchema(publicDir, "binary", binaryResult.fresh)
    writePrivateCorpus(privateDir, "binary", binaryResult.privateCorpus)
    console.log(
      `binary: ${Object.keys(binaryResult.fresh).length} of ${binaryResult.tableCount} table slots ` +
        `(${binaryResult.emptySlotCount} empty slots skipped), ` +
        `${binaryReport.addedKeys.length} new, ${binaryReport.staleKeys.length} stale, ${binaryReport.removedKeys.length} removed`
    )
  }

  console.log(`Private full corpus written under ${privateDir} (git-ignored, never publish this directory).`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    main()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown i18n:inventory error"
    console.error(`i18n:inventory failed: ${reason}`)
    process.exitCode = 1
  }
}
