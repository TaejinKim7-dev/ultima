/**
 * Boron module-script string literal extractor.
 *
 * Boron (vendor/boron) source syntax:
 *   - `;` starts a line comment (to end of line).
 *   - `/* ... *\/` is a block comment (vendor/boron/urlan/tokenize.c has a
 *     matching block-comment scanner; confirmed present in
 *     vendor/xu4/module/Ultima-IV/vendors.b).
 *   - `"..."` is a single-line quoted string.
 *   - `{...}` is a (possibly multi-line) braced string; braces nest and
 *     only an unbalanced closing `}` ends the literal, so `{{like this}}`
 *     is one literal containing a balanced inner `{}` pair.
 *   - Inside EITHER string form, `^` starts a caret escape sequence.
 *     Real semantics from vendor/boron/urlan/tokenize.c:376-393
 *     (`ur_caretChar`): `^-` -> tab, `^/` -> newline, `^(HEX)` -> that
 *     character code, a single hex digit (`^0`.."^9`,"^A".."^F") -> that
 *     nibble as a raw control byte, anything else -> the literal character
 *     after the caret (so `^^` -> `^`, `^"` -> `"`).
 *
 * This module extracts every top-level string/braced literal as a
 * *candidate* localization entry. It does not attempt perfect
 * display-vs-identifier classification -- it tags a best-effort `kind`
 * ("display" | "identifier") so downstream tooling/humans can filter, and
 * the actual corpus curation happens in a later translation todo.
 */

function caretChar(source, index) {
  const ch = source[index]
  if (/[0-9a-fA-F]/.test(ch)) {
    return { text: String.fromCharCode(parseInt(ch, 16)), next: index + 1 }
  }
  if (ch === "-") return { text: "\t", next: index + 1 }
  if (ch === "/") return { text: "\n", next: index + 1 }
  if (ch === "(") {
    let j = index + 1
    let code = 0
    let any = false
    while (j < source.length && /[0-9a-fA-F]/.test(source[j])) {
      code = code * 16 + parseInt(source[j], 16)
      any = true
      j++
    }
    if (source[j] === ")") j++
    return { text: any ? String.fromCodePoint(code) : "", next: j }
  }
  return { text: ch ?? "", next: index + 1 }
}

function unescapeCarets(raw) {
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "^" && i + 1 < raw.length) {
      const { text, next } = caretChar(raw, i + 1)
      out += text
      i = next - 1
    } else {
      out += raw[i]
    }
  }
  return out
}

// A candidate is classified "identifier" (not player-visible display text)
// when it has no whitespace and looks like a bare word/path/symbol -- e.g.
// "weapons", "music/minstrel", "1.4". Anything containing a space, or
// ending in sentence punctuation, is classified "display".
function classify(text) {
  if (text.length === 0) return "identifier"
  if (/\s/.test(text)) return "display"
  if (/^[a-zA-Z0-9_./-]+$/.test(text)) return "identifier"
  return "display"
}

/**
 * Scan Boron source text and return every top-level string/braced literal.
 * `source` should be the raw file contents (UTF-8/ASCII source, not the
 * game's DOS binary data -- these module scripts are plain checked-in
 * text under vendor/xu4/module/).
 */
export function extractBoronLiterals(source) {
  const literals = []
  const n = source.length
  let i = 0

  while (i < n) {
    const ch = source[i]

    if (ch === ";") {
      const nl = source.indexOf("\n", i)
      i = nl === -1 ? n : nl + 1
      continue
    }

    if (ch === "/" && source[i + 1] === "*") {
      const close = source.indexOf("*/", i + 2)
      i = close === -1 ? n : close + 2
      continue
    }

    if (ch === '"') {
      let j = i + 1
      let raw = ""
      while (j < n && source[j] !== '"') {
        raw += source[j]
        j++
      }
      const text = unescapeCarets(raw)
      literals.push({ form: "quoted", offset: i, text, kind: classify(text) })
      i = j + 1
      continue
    }

    if (ch === "{") {
      let depth = 1
      let j = i + 1
      let raw = ""
      while (j < n && depth > 0) {
        if (source[j] === "{") depth++
        else if (source[j] === "}") {
          depth--
          if (depth === 0) break
        }
        raw += source[j]
        j++
      }
      const text = unescapeCarets(raw)
      literals.push({ form: "braced", offset: i, text, kind: classify(text) })
      i = j + 1
      continue
    }

    i++
  }

  return literals
}
