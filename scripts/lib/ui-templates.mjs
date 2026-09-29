/**
 * Todo 23: tables for the web build's screenMessage() hook.
 *
 * vendor/xu4/src/screen.cpp (web build only) sends each screenMessage()
 * call to the shell as an FNV-1a hash of its format bytes plus the
 * pre-formatted conversion strings -- never the format text itself, since
 * some call sites pass original game data (castle/codex AVATAR.EXE lines)
 * as the format. These helpers build, at i18n:generate time:
 *   - hash -> ui/module id for every inventoried literal the shell may show,
 *   - English config-name literal -> module id, for translating `%s`
 *     arguments such as weapon/creature names (open-source module text).
 */
import { sourceHash } from "./hash.mjs"

const PRINTF_CONVERSION = /%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g

/** 32-bit FNV-1a over each UTF-16 code unit's low byte (= the C literal's bytes), as 8 hex digits. */
export function fnv1a32(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index) & 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/** printf conversions in source order (unlike placeholders.mjs's sorted multiset). */
export function orderedPlaceholders(text) {
  return text.match(PRINTF_CONVERSION) ?? []
}

/** True when nothing translatable remains once conversions are removed ("%s\n", "%c\n", ...). */
export function isPlaceholderOnly(text) {
  return !/[A-Za-z]/.test(text.replace(PRINTF_CONVERSION, ""))
}

function isReady(entry) {
  return entry != null && entry.status !== "pending" && typeof entry.translation === "string" && entry.translation.trim() !== ""
}

function sameSequence(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index])
}

/**
 * @param {{ idPrefix: string, literals: string[] }[]} sources literals in
 *   inventory order (index = the id suffix, empty literals included)
 * @param {Record<string, { sourceHash: string, translation: string, status?: string }>} entries
 * @returns {{ templates: Record<string, string>, excluded: { id: string, reason: string }[] }}
 */
export function buildUiTemplateMap(sources, entries) {
  const templates = {}
  const excluded = []
  const chosen = new Map() // hash -> { id, text, translation }
  const conflicted = new Set()

  for (const { idPrefix, literals } of sources) {
    literals.forEach((text, index) => {
      if (text.length === 0) return
      const id = `${idPrefix}:${index}`
      const entry = entries[id]
      if (entry === undefined) return
      if (entry.sourceHash !== sourceHash(text)) {
        excluded.push({ id, reason: "stale: sourceHash no longer matches the literal" })
        return
      }
      if (!isReady(entry)) {
        excluded.push({ id, reason: "no ready translation" })
        return
      }
      if (isPlaceholderOnly(text)) {
        excluded.push({ id, reason: "placeholder-only literal (nothing to translate)" })
        return
      }
      if (!sameSequence(orderedPlaceholders(text), orderedPlaceholders(entry.translation))) {
        excluded.push({ id, reason: "translation changes the conversion order (arguments are substituted in order)" })
        return
      }
      const hash = fnv1a32(text)
      const previous = chosen.get(hash)
      if (previous === undefined) {
        chosen.set(hash, { id, text, translation: entry.translation })
        return
      }
      if (previous.text !== text) {
        conflicted.add(hash)
        excluded.push({ id, reason: `FNV-1a collision with ${previous.id}` })
      } else if (previous.translation !== entry.translation) {
        conflicted.add(hash)
        excluded.push({ id, reason: `duplicate literal of ${previous.id} with a different translation` })
      }
    })
  }

  for (const [hash, { id }] of chosen) {
    if (conflicted.has(hash)) {
      excluded.push({ id, reason: "duplicate/collision conflict" })
    } else {
      templates[hash] = id
    }
  }
  return { templates, excluded }
}

/**
 * English module literal (config.b names such as "Dagger") -> id, for
 * `%s` argument translation. Only short, conversion-free, ready literals;
 * a literal that maps to two different translations is dropped.
 */
export function buildModuleNameMap(sources, entries, maxLength = 40) {
  const names = {}
  const translations = {}
  const dropped = new Set()
  for (const { idPrefix, literals } of sources) {
    literals.forEach((text, index) => {
      if (text.length === 0 || text.length > maxLength || orderedPlaceholders(text).length > 0) return
      const id = `${idPrefix}:${index}`
      const entry = entries[id]
      if (entry === undefined || entry.sourceHash !== sourceHash(text) || !isReady(entry)) return
      if (names[text] === undefined) {
        names[text] = id
        translations[text] = entry.translation
      } else if (translations[text] !== entry.translation) {
        dropped.add(text)
      }
    })
  }
  for (const text of dropped) delete names[text]
  return names
}
