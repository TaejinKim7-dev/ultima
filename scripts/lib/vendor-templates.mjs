/**
 * Todo 25: tables for the web build's vendor conversations.
 *
 * vendor/xu4/module/Ultima-IV/vendors.b prints shop text through `=>` and
 * `input-shop`, which run Boron `construct` over a template containing the
 * substitution symbols `@ % $ # =` (shop, owner, price, quantity, item name).
 * By the time `>>` reaches screenMessage() the symbols are already replaced,
 * so the Korean line cannot be found from it. The web build's `web-say`
 * cfunc therefore sends the FNV-1a hash of the template's RUNTIME bytes plus
 * the symbol/value pairs, and the shell looks the hash up here.
 *
 * Runtime bytes are not the source text for `{{ ... }}` literals: Boron drops
 * the `{{` line and the closing `}}` line and un-indents the rest
 * (vendor/boron/urlan/tokenize.c _bracketNewline + support/trim_string.c
 * trim_indent_char), and input-shop additionally strips one trailing
 * newline before announcing. Both sides are normalized the same way here so
 * the shell only substitutes symbols.
 */
import { sourceHash } from "./hash.mjs"
import { fnv1a32 } from "./ui-templates.mjs"

const SYMBOLS = /[@%$#=]/g

/** Port of trim_indent_char: strip the first text line's margin from every line. */
function trimIndent(text) {
  const end = text.length
  let cp = 0
  let margin = 0
  while (cp < end) {
    const code = text.charCodeAt(cp)
    if (code > 32) break
    if (code === 10) margin = 0
    else ++margin
    ++cp
  }
  if (margin === 0) return text

  let out = ""
  for (;;) {
    while (cp < end) {
      const ch = text[cp++]
      out += ch
      if (ch === "\n") break
    }
    let removed = 0
    let copyNext = false
    while (cp < end) {
      const code = text.charCodeAt(cp)
      if (code > 32) {
        copyNext = true
        break
      }
      if (code === 10) {
        out += text[cp++]
        removed = 0
      } else {
        ++cp
        if (++removed === margin) {
          copyNext = true
          break
        }
      }
    }
    if (!copyNext) return out
  }
}

/**
 * The string Boron builds from a source literal (`text` as extractBoronLiterals
 * returns it). Only a braced literal shaped like `{\n ... \n   }` (a source
 * `{{` ... `}}` block) is transformed.
 */
export function boronRuntimeText(text, form) {
  if (form !== "braced" || !/^\{\r?\n[\s\S]*\n[ \t]*\}$/.test(text)) return text
  const start = text.indexOf("\n") + 1
  const end = text.lastIndexOf("\n") + 1
  return trimIndent(end > start ? text.slice(start, end) : "")
}

function symbolSet(text) {
  return [...new Set(text.match(SYMBOLS) ?? [])].sort().join("")
}

function isReady(entry) {
  return entry != null && entry.status !== "pending" && typeof entry.translation === "string" && entry.translation.trim() !== ""
}

/**
 * @param {{ idPrefix: string, literals: { form: string, text: string }[] }[]} sources
 *   literals in inventory order (index = the id suffix, empty literals included)
 * @param {Record<string, { sourceHash: string, translation: string, status?: string }>} entries
 * @returns {{ templates: Record<string, string>, excluded: { id: string, reason: string }[] }}
 *   templates: FNV-1a hash of the English runtime bytes -> Korean runtime text
 */
export function buildVendorTemplateMap(sources, entries) {
  const excluded = []
  const chosen = new Map() // hash -> { english, korean }
  const conflicted = new Set()

  function add(id, english, korean) {
    const hash = fnv1a32(english)
    const previous = chosen.get(hash)
    if (previous === undefined) {
      chosen.set(hash, { id, english, korean })
    } else if (previous.english !== english || previous.korean !== korean) {
      conflicted.add(hash)
      excluded.push({ id, reason: `duplicate/collision with ${previous.id}` })
    }
  }

  for (const { idPrefix, literals } of sources) {
    literals.forEach(({ form, text }, index) => {
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
      if (symbolSet(text) !== symbolSet(entry.translation)) {
        excluded.push({ id, reason: "translation changes the substitution symbols (@ % $ # =)" })
        return
      }
      const english = boronRuntimeText(text, form)
      const korean = boronRuntimeText(entry.translation, form)
      add(id, english, korean)
      // input-shop trims one trailing newline off `{{ }}` strings before announcing.
      if (english !== text && english.endsWith("\n")) {
        add(id, english.slice(0, -1), korean.endsWith("\n") ? korean.slice(0, -1) : korean)
      }
    })
  }

  const templates = {}
  for (const [hash, { id, korean }] of chosen) {
    if (conflicted.has(hash)) excluded.push({ id, reason: "duplicate/collision conflict" })
    else templates[hash] = korean
  }
  return { templates, excluded }
}
