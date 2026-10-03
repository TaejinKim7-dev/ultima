#!/usr/bin/env node
// Todo 38: merges the per-spec `i18n-coverage.json` snapshots a Playwright run
// produced and reverse-maps their hashes against OPEN-SOURCE literals
// (vendor/xu4/src/*.cpp, vendor/xu4/module/**/vendors.b|config.b) so each miss
// gets a `file:line`. The report never prints a literal or an argument: the
// snapshots hold hashes/ids only, and this script only emits ids, hashes,
// counts and file:line locations.
//
// Usage: node scripts/i18n-coverage-report.mjs [--in <dir|file> ...] [--out <md>]

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { extractBoronLiterals } from "./lib/boron-strings.mjs"
import { extractCppLiterals } from "./lib/cpp-strings.mjs"
import { boronRuntimeText } from "./lib/vendor-templates.mjs"
import { fnv1a32 } from "./lib/ui-templates.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const KINDS = ["ui-unmapped", "vendor-unmapped", "talk-unmapped", "resolve-fallback", "arg-passthrough"]
const HASH_KINDS = new Set(["ui-unmapped", "vendor-unmapped", "talk-unmapped"])
const COVERAGE_FILE = "i18n-coverage.json"

// Every call shape that hands a format string to the web hook, plus the
// discourse files' `message` / `TALK_MSG` wrappers.
const REPORT_CPP_OPTIONS = { extraCallNames: ["screenMessageN", "message", "TALK_MSG"], joinAdjacent: true }

function lineOf(text, offset) {
  let line = 1
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text.charCodeAt(index) === 10) line += 1
  }
  return line
}

function pushUnique(map, hash, location) {
  const list = map.get(hash) ?? []
  if (!list.some((hit) => hit.file === location.file && hit.line === location.line)) list.push(location)
  map.set(hash, list)
}

// Loose scan of every C string literal (for static tables such as deathMsgs[]
// or getVirtueAdjective(), which are not screenMessage("...") call shapes).
const ANY_C_LITERAL = /"((?:[^"\\\n]|\\.)*)"/g
function unescapeC(raw) {
  return raw
    .replace(/\\([0-7]{1,3})/g, (_m, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

/**
 * @param {{ cppSources: { file: string, text: string }[], vendorSource?: { file: string, text: string },
 *           moduleSources?: { file: string, text: string }[] }} input
 * @returns {{ ui: Map<string, {file:string,line:number}[]>, literal: Map<string, {file:string,line:number}[]>,
 *             vendor: Map<string, {file:string,line:number}[]> }}
 *   ui: screenMessage-style format literals; literal: any C/Boron string literal; vendor: vendors.b templates
 */
export function buildReverseMaps({ cppSources, vendorSource, moduleSources = [] }) {
  const ui = new Map()
  const literal = new Map()
  const vendor = new Map()
  for (const { file, text } of cppSources) {
    for (const entry of extractCppLiterals(text, REPORT_CPP_OPTIONS)) {
      pushUnique(ui, fnv1a32(entry.text), { file, line: lineOf(text, entry.offset) })
    }
    ANY_C_LITERAL.lastIndex = 0
    let match
    while ((match = ANY_C_LITERAL.exec(text)) !== null) {
      const value = unescapeC(match[1])
      if (value.length > 0) pushUnique(literal, fnv1a32(value), { file, line: lineOf(text, match.index) })
    }
  }
  if (vendorSource !== undefined) {
    for (const entry of extractBoronLiterals(vendorSource.text)) {
      if (entry.kind !== "display") continue
      pushUnique(vendor, fnv1a32(boronRuntimeText(entry.text, entry.form)), {
        file: vendorSource.file,
        line: lineOf(vendorSource.text, entry.offset)
      })
    }
  }
  for (const { file, text } of [...moduleSources, ...(vendorSource === undefined ? [] : [vendorSource])]) {
    for (const entry of extractBoronLiterals(text)) {
      if (entry.text.length > 0) pushUnique(literal, fnv1a32(entry.text), { file, line: lineOf(text, entry.offset) })
    }
  }
  return { ui, literal, vendor }
}

/** Sums snapshot counts per kind and key; `rejected` is summed too. */
export function mergeSnapshots(snapshots) {
  const merged = { rejected: 0 }
  const totals = Object.fromEntries(KINDS.map((kind) => [kind, new Map()]))
  for (const snapshot of snapshots) {
    merged.rejected += Number.isInteger(snapshot.rejected) ? snapshot.rejected : 0
    for (const kind of KINDS) {
      for (const { key, count } of snapshot[kind] ?? []) {
        totals[kind].set(key, (totals[kind].get(key) ?? 0) + count)
      }
    }
  }
  for (const kind of KINDS) {
    merged[kind] = [...totals[kind]]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }
  return merged
}

const sum = (rows) => rows.reduce((total, row) => total + row.count, 0)
const locs = (hits) => hits.map((hit) => `${hit.file}:${hit.line}`).join(", ")

function lookup(kind, key, maps) {
  if (kind === "ui-unmapped" || kind === "talk-unmapped") {
    const hits = maps.ui.get(key)
    if (hits !== undefined) return { hits, via: "format literal" }
    const other = maps.literal.get(key)
    return other === undefined ? undefined : { hits: other, via: "string literal" }
  }
  if (kind === "vendor-unmapped") {
    const hits = maps.vendor.get(key)
    return hits === undefined ? undefined : { hits, via: "vendors.b template" }
  }
  return undefined
}

function argHits(key, maps) {
  const hash = key.split("|")[2] ?? ""
  return maps.literal.get(hash)
}

const GAPS = [
  { id: "#3", title: "virtue adjectives (getVirtueAdjective)", files: ["vendor/xu4/src/names.cpp"] },
  { id: "#5", title: "death / spell-failure messages", files: ["vendor/xu4/src/death.cpp", "vendor/xu4/src/spell.cpp"] },
  { id: "#6", title: "entry messages (screenMessageCenter, cityTypeStr)", files: ["vendor/xu4/src/portal.cpp"] },
  { id: "#7", title: "creature names in combat lines", files: ["vendor/xu4/module/Ultima-IV/config.b", "vendor/xu4/module/U4-Upgrade/config.b"] }
]

function gapRows(merged, maps) {
  const rows = []
  for (const gap of GAPS) {
    let hits = 0
    let total = 0
    const where = new Set()
    const consider = (found, count) => {
      if (found === undefined) return
      const relevant = found.filter((hit) => gap.files.includes(hit.file))
      if (relevant.length === 0) return
      hits += 1
      total += count
      for (const hit of relevant) where.add(`${hit.file}:${hit.line}`)
    }
    for (const kind of ["ui-unmapped", "talk-unmapped"]) {
      for (const { key, count } of merged[kind]) consider(lookup(kind, key, maps)?.hits, count)
    }
    for (const { key, count } of merged["arg-passthrough"]) consider(argHits(key, maps), count)
    rows.push({ gap, hits, total, where: [...where].sort() })
  }
  return rows
}

/** Renders the Markdown report. Only ids, hashes, counts and file:line appear. */
export function renderReport(merged, maps, { specCount = 0, unavailableCount = 0 } = {}) {
  const out = []
  out.push("# i18n coverage report (Todo 38)", "")
  out.push(
    "Measured from the `i18n-coverage.json` snapshot each Playwright spec attached. Only hashes and ids are",
    "recorded; this report reverse-maps hashes against open-source literals and prints `file:line`, never the text.",
    ""
  )
  out.push(`- specs with a snapshot: ${specCount}`, `- specs where the hook was unavailable (shell never booted): ${unavailableCount}`)
  out.push(`- keys rejected by the recorder (not an id or hash, discarded): ${merged.rejected}`, "")

  out.push("## Counts per kind", "", "| kind | distinct keys | total occurrences |", "|---|---:|---:|")
  for (const kind of KINDS) out.push(`| ${kind} | ${merged[kind].length} | ${sum(merged[kind])} |`)
  out.push("")

  const unknown = []
  for (const kind of ["ui-unmapped", "vendor-unmapped", "talk-unmapped"]) {
    out.push(`## ${kind} (reverse-mapped)`, "")
    if (merged[kind].length === 0) out.push("(none)", "")
    else {
      out.push("| hash | count | source |", "|---|---:|---|")
      for (const { key, count } of merged[kind]) {
        const found = lookup(kind, key, maps)
        if (found === undefined) {
          unknown.push({ kind, key, count })
          out.push(`| ${key} | ${count} | UNKNOWN |`)
        } else {
          out.push(`| ${key} | ${count} | ${locs(found.hits)} (${found.via}) |`)
        }
      }
      out.push("")
    }
  }

  out.push("## resolve-fallback (ids with no Korean translation)", "")
  if (merged["resolve-fallback"].length === 0) out.push("(none)", "")
  else {
    out.push("| id | count |", "|---|---:|")
    for (const { key, count } of merged["resolve-fallback"]) out.push(`| ${key} | ${count} |`)
    out.push("")
  }

  out.push("## arg-passthrough (a `%s` argument that was shown raw)", "")
  const unmatchedArgs = []
  if (merged["arg-passthrough"].length === 0) out.push("(none)", "")
  else {
    out.push(
      "`template id | position | argument hash`. A match means the argument equals an open-source literal;",
      "unmatched hashes are computed or player-supplied values (names, numbers).",
      "",
      "| key | count | open-source source |",
      "|---|---:|---|"
    )
    for (const { key, count } of merged["arg-passthrough"]) {
      const found = argHits(key, maps)
      if (found === undefined) unmatchedArgs.push({ key, count })
      else out.push(`| ${key} | ${count} | ${locs(found.slice(0, 4))} |`)
    }
    out.push("", `Unmatched argument hashes (computed or player data): ${unmatchedArgs.length} distinct, ${sum(unmatchedArgs)} occurrences.`, "")
  }

  out.push("## Unknown hashes (possible bug)", "")
  out.push(
    "Hashes that match no open-source literal. Since Todo 24 castle and codex text arrives as ids, so an unknown",
    "hash is a possible bug (a format built at run time, or text that bypassed an id channel).",
    ""
  )
  if (unknown.length === 0) out.push("(none)", "")
  else for (const row of unknown) out.push(`- ${row.kind} ${row.key} x${row.count}`)
  if (unknown.length > 0) out.push("")

  out.push("## Audit gap cross-reference (docs/GOAL_GAP_AUDIT.md)", "")
  out.push("| gap | topic | observed | occurrences | locations |", "|---|---|---|---:|---|")
  for (const { gap, hits, total, where } of gapRows(merged, maps)) {
    const blind = gap.id === "#6" ? " (screenMessageCenter itself has no hook: not observable)" : ""
    out.push(
      `| ${gap.id} | ${gap.title} | ${hits > 0 ? "yes" : "no"}${blind} | ${total} | ${where.slice(0, 6).join(", ") || "-"} |`
    )
  }
  out.push("")

  out.push("## Blind spots", "")
  out.push(
    "- Canvas-only text: every `TextView::textAt*` / `screenMessageCenter` draw has no web hook, so English drawn only",
    "  on the canvas is invisible to this measurement (screenMessageCenter: town, shrine and dungeon entry text).",
    "- The 8x8 bitmap text of screens that never reach a hook (e.g. intro/menu screens not covered by an overlay).",
    "- Screens no spec reaches: anything past what the e2e suite plays (late dungeons, Abyss, Codex, most combat).",
    "- `arg-passthrough` only sees `%s` arguments of known templates; text inside an unmapped template is counted once per hash, not per word.",
    "- A spec that opens a second page or reloads loses the earlier page's counters (one snapshot per test, taken at its end).",
    "- Counts depend on which keys the suite happens to press; absence of a key is not proof of full Korean coverage.",
    ""
  )
  return out.join("\n")
}

function findSnapshotFiles(path) {
  if (!existsSync(path)) return []
  const info = statSync(path)
  if (info.isFile()) return [path]
  const found = []
  for (const name of readdirSync(path)) {
    const full = join(path, name)
    const child = statSync(full)
    if (child.isDirectory()) found.push(...findSnapshotFiles(full))
    else if (name === COVERAGE_FILE || name.endsWith(`-${COVERAGE_FILE}`) || /\.coverage\.json$/.test(name)) found.push(full)
  }
  return found
}

function listCpp(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".cpp"))
    .sort()
    .map((name) => ({ file: relative(repoRoot, join(dir, name)), text: readFileSync(join(dir, name), "utf8") }))
}

export function loadSnapshots(paths) {
  const snapshots = []
  let unavailable = 0
  for (const path of paths.flatMap(findSnapshotFiles)) {
    let parsed
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"))
    } catch {
      unavailable += 1
      continue
    }
    if (parsed === null || typeof parsed !== "object" || parsed.unavailable === true) unavailable += 1
    else snapshots.push(parsed)
  }
  return { snapshots, unavailable }
}

function main(argv) {
  const inputs = []
  let out = join(repoRoot, ".omo/evidence/ultima-web/task-38/coverage-report.md")
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--in") inputs.push(resolve(argv[++index] ?? ""))
    else if (argv[index] === "--out") out = resolve(argv[++index] ?? "")
  }
  if (inputs.length === 0) inputs.push(join(repoRoot, ".omo/evidence/ultima-web/task-38/coverage"))
  const { snapshots, unavailable } = loadSnapshots(inputs)
  const moduleSources = ["vendor/xu4/module/Ultima-IV/config.b", "vendor/xu4/module/U4-Upgrade/config.b"].map((file) => ({
    file,
    text: readFileSync(join(repoRoot, file), "utf8")
  }))
  const vendorFile = "vendor/xu4/module/Ultima-IV/vendors.b"
  const maps = buildReverseMaps({
    cppSources: listCpp(join(repoRoot, "vendor/xu4/src")),
    vendorSource: { file: vendorFile, text: readFileSync(join(repoRoot, vendorFile), "utf8") },
    moduleSources
  })
  const report = renderReport(mergeSnapshots(snapshots), maps, { specCount: snapshots.length, unavailableCount: unavailable })
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, report)
  process.stdout.write(`i18n-coverage-report: ${snapshots.length} snapshots (${unavailable} unavailable) -> ${relative(repoRoot, out)}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
}
