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

/**
 * Extract candidate display strings from one C++ source file's text.
 * Returns entries in file order with the 0-based occurrence index per
 * file (stable as long as the file's call order doesn't change --
 * `sourceHash` guards against silent drift if it does).
 */
export function extractCppLiterals(source) {
  const literals = []
  for (const pattern of CALL_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const text = unescapeCLiteral(match[1])
      if (text.length === 0) continue
      literals.push({ offset: match.index, text })
    }
  }
  literals.sort((left, right) => left.offset - right.offset)
  return literals
}
