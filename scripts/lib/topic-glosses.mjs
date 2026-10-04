/**
 * Todo 48: shared topic-keyword gloss tables (NPC talk topics -> Korean).
 *
 * Each town NPC has two interest keywords (`topic1`/`topic2` in
 * locales/ko/tlk.json, stored as the raw 4-letter English matching key
 * with its original padding, e.g. "ALE "). This library maps every
 * distinct keyword to a Korean gloss in locales/ko/glossary.json
 * (`npc-topic-<slug>` rows, plus `npc-topic-<slug>--<map>-<n>` overrides
 * for the NPCs where one keyword means a different word), and emits the
 * raw-keyword -> gloss-id tables the generator writes into
 * src/i18n/generated/strings.ts.
 *
 * It is shared by scripts/i18n-generate.mjs (emit), scripts/i18n-check.mjs
 * (gate) and the unit tests. It never reads the original game data: the
 * raw keywords and their sha256 hashes are already public in tlk.json.
 */
import { sourceHash } from "./hash.mjs"

/** One topic slot found in a tlk.json entries map: `MAP:n:topic1|topic2`. */
export function topicSlots(tlkEntries) {
  const slots = []
  for (const [key, entry] of Object.entries(tlkEntries)) {
    const match = /^(.*):(topic[12])$/.exec(key)
    if (!match) continue
    const raw = entry?.translation
    if (typeof raw !== "string") continue
    if (raw.trim() === "A") continue // the unused-keyword marker "A   "
    if (entry.sourceHash !== sourceHash(raw)) continue // drifted source text
    slots.push({ npc: match[1], field: match[2], raw })
  }
  return slots
}

/** Lower-cased, trimmed keyword; '.' -> "-dot", an inner space -> "-" ("HO E" -> "ho-e", "BEH." -> "beh-dot"). */
export function topicSlug(raw) {
  return raw.trim().toLowerCase().replace(/\./g, "-dot").replace(/\s+/g, "-")
}

/** The default glossary id for one raw keyword. */
export function defaultGlossId(raw) {
  return `npc-topic-${topicSlug(raw)}`
}

/** The per-NPC override glossary id for one raw keyword at `MAP:n` (npc = "MAP:n"). */
export function overrideGlossId(raw, map, npc) {
  return `npc-topic-${topicSlug(raw)}--${map.toLowerCase()}-${npc}`
}

function npcParts(npc) {
  const split = npc.lastIndexOf(":")
  return [npc.slice(0, split), npc.slice(split + 1)]
}

function isReady(entry) {
  return (
    entry != null &&
    typeof entry === "object" &&
    entry.status !== "pending" &&
    typeof entry.translation === "string" &&
    entry.translation.trim().length > 0
  )
}

function hashMatches(entry, raw) {
  return typeof entry.sourceHash === "string" && entry.sourceHash === sourceHash(raw)
}

/**
 * Builds the runtime lookup tables from the committed locale data:
 *   - `glosses`: raw padded keyword -> default gloss id (only while a ready,
 *     hash-matching glossary row exists);
 *   - `overrides`: "MAP:n:topicN" -> per-slot override gloss id.
 */
export function buildTopicGlossTables(tlkEntries, glossaryEntries) {
  const glosses = {}
  const overrides = {}
  for (const slot of topicSlots(tlkEntries)) {
    const defaultEntry = glossaryEntries[defaultGlossId(slot.raw)]
    if (isReady(defaultEntry) && hashMatches(defaultEntry, slot.raw) && glosses[slot.raw] === undefined) {
      glosses[slot.raw] = defaultGlossId(slot.raw)
    }
    const [map, npc] = npcParts(slot.npc)
    const overrideEntry = glossaryEntries[overrideGlossId(slot.raw, map, npc)]
    if (isReady(overrideEntry) && hashMatches(overrideEntry, slot.raw)) {
      overrides[`${slot.npc}:${slot.field}`] = overrideGlossId(slot.raw, map, npc)
    }
  }
  return { glosses, overrides }
}

/** The reserved common-keyword aliases a topic gloss must never equal (they would change which native branch a typed word hits). */
export const RESERVED_TOPIC_GLOSSES = [
  "안녕", "예", "아니오", "이름", "직업", "건강", "외모", "합류", "기부", "가", "나", "남성", "여성"
]

/**
 * Reports topic-gloss problems as human-readable strings. `aliases` is the
 * locales/ko/aliases.json data object ({ entries }). Checks:
 *   - a missing gloss for a slot (strict only);
 *   - two topic glosses equal within one NPC;
 *   - a gloss equal to a reserved common alias;
 *   - a gloss equal to a global alias whose canonical does not start with
 *     the keyword (different native effect);
 *   - a gloss containing ASCII letters;
 *   - an override glossary row that no tlk slot uses.
 */
export function topicGlossProblems(tlkEntries, glossaryEntries, aliases, { strict = false } = {}) {
  const problems = []
  const aliasList = Object.values(aliases?.entries ?? {})
  const slots = topicSlots(tlkEntries)

  const resolved = new Map() // slotKey -> { gloss, keyword }
  for (const slot of slots) {
    const [map, npc] = npcParts(slot.npc)
    const slotKey = `${slot.npc}:${slot.field}`
    const defaultEntry = glossaryEntries[defaultGlossId(slot.raw)]
    const overrideEntry = glossaryEntries[overrideGlossId(slot.raw, map, npc)]
    const defaultOk = isReady(defaultEntry) && hashMatches(defaultEntry, slot.raw)
    const overrideOk = isReady(overrideEntry) && hashMatches(overrideEntry, slot.raw)
    const entry = overrideOk ? overrideEntry : defaultOk ? defaultEntry : null

    if (entry === null) {
      if (strict) {
        problems.push(
          `npc-topic gloss missing for ${slot.npc}:${slot.field} (keyword "${slot.raw.trim()}" has no ready ` +
            `"npc-topic-${topicSlug(slot.raw)}" row)`
        )
      }
      continue
    }
    const gloss = entry.translation
    const keyword = slot.raw.trim()
    resolved.set(slotKey, { gloss, keyword, slot })

    if (/[A-Za-z]/.test(gloss)) {
      problems.push(`npc-topic gloss for ${slot.npc}:${slot.field} is not Korean: "${gloss}"`)
    }
    if (RESERVED_TOPIC_GLOSSES.includes(gloss)) {
      problems.push(
        `npc-topic gloss "${gloss}" for ${slot.npc}:${slot.field} collides with a reserved common alias`
      )
    }
    for (const alias of aliasList) {
      if (alias && alias.alias === gloss) {
        const canonical = typeof alias.canonical === "string" ? alias.canonical : ""
        if (!canonical.toLowerCase().startsWith(keyword.toLowerCase())) {
          problems.push(
            `npc-topic gloss "${gloss}" for ${slot.npc}:${slot.field} equals alias ` +
              `"${alias.alias}" (-> "${canonical}"), whose effect differs from keyword "${keyword}"`
          )
        }
      }
    }
  }

  // Duplicate gloss within one NPC.
  const byNpc = new Map()
  for (const [slotKey, { gloss, slot }] of resolved) {
    if (!byNpc.has(slot.npc)) byNpc.set(slot.npc, [])
    byNpc.get(slot.npc).push({ slotKey, gloss })
  }
  for (const [npc, entries] of byNpc) {
    const seen = new Set()
    for (const { slotKey, gloss } of entries) {
      if (seen.has(gloss)) {
        problems.push(`npc-topic duplicate gloss "${gloss}" within ${npc} (${slotKey})`)
      }
      seen.add(gloss)
    }
  }

  // Orphan override rows: an id shaped like an override that no slot uses.
  for (const [id, entry] of Object.entries(glossaryEntries)) {
    const match = /^npc-topic-(.*)--([a-z]+)-(\d+)$/.exec(id)
    if (!match) continue
    const map = match[2].toUpperCase()
    const npc = match[3]
    const npcKey = `${map}:${npc}`
    const used = slots.some(
      (slot) => slot.npc === npcKey && topicSlug(slot.raw) === match[1] && hashMatches(entry, slot.raw)
    )
    if (!used) {
      problems.push(`npc-topic override row "${id}" matches no ${npcKey} topic slot`)
    }
  }

  return problems
}