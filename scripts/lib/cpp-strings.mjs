/**
 * Best-effort extractor for player-visible C++ literal strings.
 *
 * Scope decision (documented in handoff.md "Todo 4 완료 기록"): we do not
 * scan all ~76 files under vendor/xu4/src/. We scan a curated list of
 * files that are the actual call sites for player-visible text --
 * screenMessage(...) calls (status/combat/command feedback) and
 * Menu::add(...) labels (menu screens) -- rather than every string
 * literal in the engine (which would also pull in debug/error/internal
 * strings that are never shown to a player).
 *
 * This is intentionally conservative: it only captures the FIRST literal
 * argument of a recognized call shape. Concatenated/computed messages
 * (e.g. `screenMessage(msg)` where msg is a variable) are not captured --
 * those are covered at their own literal definition site, or are already
 * data loaded from module/TLK/binary sources inventoried elsewhere.
 */

const CALL_PATTERNS = [
  // screenMessage("...", ...optional args)
  /\bscreenMessage\s*\(\s*"((?:[^"\\]|\\.)*)"/g,
  // xxxMenu.add(ID, "label", ...) or xxxMenu.add(ID, new XxxMenuItem("label", ...))
  /\.add\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*,\s*(?:new\s+[A-Za-z_][A-Za-z0-9_]*\s*\(\s*)?"((?:[^"\\]|\\.)*)"/g
]

function unescapeCLiteral(raw) {
  return raw
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
}

const ADJACENT_LITERAL = /^\s*"((?:[^"\\]|\\.)*)"/

// Todo 22: C concatenates adjacent string literals at compile time, so the
// format string screenMessage actually receives for e.g.
// `message("... shall never " "forget thy kindness!\n", ...)` is the joined
// text. Only applied when a caller opts in (discourse_tlk.cpp): turning it
// on for the legacy file list would change existing entries' sourceHash
// (game.cpp's multi-literal "Key Reference" help text) and mark their
// translations stale.
function joinAdjacentLiterals(source, endIndex, raw) {
  let text = raw
  let rest = source.slice(endIndex)
  let next
  while ((next = ADJACENT_LITERAL.exec(rest)) !== null) {
    text += next[1]
    rest = rest.slice(next[0].length)
  }
  return text
}

function callPatterns(extraCallNames) {
  const extra = extraCallNames.map((name) => new RegExp(`\\b${name}\\s*\\(\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g"))
  return [...CALL_PATTERNS, ...extra]
}

/**
 * Extract candidate display strings from one C++ source file's text.
 * Returns entries in file order with the 0-based occurrence index per
 * file (stable as long as the file's call order doesn't change --
 * `sourceHash` guards against silent drift if it does).
 *
 * Options (Todo 22, both default off so every existing file's ids and
 * hashes stay exactly as before):
 *   - `extraCallNames`: extra call names whose first literal argument is
 *     display text (discourse_tlk.cpp's `#define message screenMessage`).
 *   - `joinAdjacent`: join compile-time-concatenated adjacent literals.
 */
export function extractCppLiterals(source, options = {}) {
  const { extraCallNames = [], joinAdjacent = false } = options ?? {}
  const literals = []
  for (const pattern of callPatterns(extraCallNames)) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const raw = joinAdjacent ? joinAdjacentLiterals(source, pattern.lastIndex, match[1]) : match[1]
      const text = unescapeCLiteral(raw)
      if (text.length === 0) continue
      literals.push({ offset: match.index, text })
    }
  }
  literals.sort((left, right) => left.offset - right.offset)
  return literals
}
