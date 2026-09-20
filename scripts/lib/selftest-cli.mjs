#!/usr/bin/env node
/**
 * Test-only CLI harness exposing the pure functions in scripts/lib/ as
 * subcommands that print a single JSON line to stdout.
 *
 * WHY THIS EXISTS: tsconfig.json has no `allowJs`, so a `tests/unit/*.ts`
 * file cannot `import` a `.mjs` module directly without breaking
 * `npm run typecheck` (TS2307). Every other script in this repo is
 * already tested exactly this way -- see tests/unit/build-modules.test.ts
 * and tests/unit/repo-sources.test.ts, which spawn the CLI and assert on
 * its stdout/stderr/exit code rather than importing it. This file follows
 * that same convention for the smaller building blocks so the Todo 4
 * acceptance criteria's exact key shapes (`map:npcIndex:field` and
 * `resource:table:index`) get direct unit coverage.
 */
import { extractPlaceholders, placeholdersEqual } from "./placeholders.mjs"
import { displayWidth, STATUS_AREA_WIDTH_COLUMNS } from "./text-width.mjs"
import { findAliasCollisions } from "./alias-check.mjs"
import { TLK_FIELD_ORDER, TLK_RECORD_SIZE, isUnusedRecord, parseTlkRecord, tlkKey } from "./tlk-codec.mjs"
import { binaryKey, readNullTerminatedStrings } from "./binary-strings.mjs"
import { extractBoronLiterals } from "./boron-strings.mjs"
import { extractCppLiterals } from "./cpp-strings.mjs"

function printAndExit(data) {
  console.log(JSON.stringify(data))
  process.exitCode = 0
}

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

/** Build a synthetic 288-byte TLK record buffer from field values. */
function buildTlkRecord({ trigger = 0, questionHumility = 0, turnAway = 0, fields }) {
  const buffer = Buffer.alloc(TLK_RECORD_SIZE, 0)
  buffer[0] = trigger
  buffer[1] = questionHumility
  buffer[2] = turnAway
  let cursor = 3
  for (const field of TLK_FIELD_ORDER) {
    const value = fields[field] ?? ""
    cursor += buffer.write(value, cursor, "latin1")
    buffer[cursor] = 0
    cursor += 1
  }
  return buffer
}

const [, , command, ...rest] = process.argv

switch (command) {
  case "tlk-key": {
    const [map, npcIndex, field] = rest
    printAndExit({ key: tlkKey(map, Number(npcIndex), field) })
    break
  }

  case "tlk-roundtrip": {
    // rest: map npcIndex field1=value1 field2=value2 ...
    const [map, npcIndexRaw, ...pairs] = rest
    const fields = {}
    for (const pair of pairs) {
      const eq = pair.indexOf("=")
      fields[pair.slice(0, eq)] = pair.slice(eq + 1)
    }
    const npcIndex = Number(npcIndexRaw)
    const buffer = buildTlkRecord({ fields })
    const record = parseTlkRecord(buffer, 0)
    const decoded = {}
    for (const field of TLK_FIELD_ORDER) decoded[field] = record.fields[field].toString("latin1")
    printAndExit({
      unused: isUnusedRecord(record),
      decoded,
      keys: TLK_FIELD_ORDER.map((field) => tlkKey(map, npcIndex, field))
    })
    break
  }

  case "binary-key": {
    const [resource, table, index] = rest
    printAndExit({ key: binaryKey(resource, table, Number(index)) })
    break
  }

  case "binary-roundtrip": {
    // rest: resource table value1 value2 value3 ...
    const [resource, table, ...values] = rest
    const parts = values.map((value) => Buffer.from(`${value}\0`, "latin1"))
    const buffer = Buffer.concat(parts)
    const { strings } = readNullTerminatedStrings(buffer, 0, values.length)
    printAndExit({
      decoded: strings.map((bytes) => bytes.toString("latin1")),
      keys: values.map((_, index) => binaryKey(resource, table, index))
    })
    break
  }

  case "placeholder-match": {
    const [source, translation] = rest
    const sourcePlaceholders = extractPlaceholders(source)
    printAndExit({
      sourcePlaceholders,
      translationPlaceholders: extractPlaceholders(translation),
      equal: placeholdersEqual(sourcePlaceholders, translation)
    })
    break
  }

  case "display-width": {
    const [text] = rest
    printAndExit({ width: displayWidth(text), budget: STATUS_AREA_WIDTH_COLUMNS })
    break
  }

  case "alias-collisions": {
    // rest: id1 alias1 canonical1 id2 alias2 canonical2 ...
    const entries = {}
    for (let i = 0; i < rest.length; i += 3) {
      entries[rest[i]] = { alias: rest[i + 1], canonical: rest[i + 2] }
    }
    printAndExit({ collisions: findAliasCollisions(entries) })
    break
  }

  case "boron-literals": {
    const [source] = rest
    printAndExit({ literals: extractBoronLiterals(source) })
    break
  }

  case "cpp-literals": {
    const [source] = rest
    printAndExit({ literals: extractCppLiterals(source) })
    break
  }

  default:
    fail(`unknown selftest command: ${command}`)
}
