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

// (backslash-newline: a literal continued across a #define line)
const ADJACENT_LITERAL = /^(?:\s|\\\n)*"((?:[^"\\]|\\.)*)"/

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

// Todo 26: TextView::textAt/textAtKey/textAtFmt(x, y, "literal", ...) --
// the intro's own screens (vendor/xu4/src/intro.cpp) draw through these,
// not screenMessage. The x/y arguments may be expressions such as
// `virtue1.size() + 4` (one level of parentheses, no commas). Opt-in only,
// like the Todo 22 options, so no other file's ids move.
const TEXT_AT_ARG = String.raw`(?:[^,()"]|\([^()]*\))+`
const TEXT_AT_PATTERN = String.raw`\.textAt(?:Key|Fmt)?\s*\(\s*${TEXT_AT_ARG},\s*${TEXT_AT_ARG},\s*"((?:[^"\\]|\\.)*)"`

const LITERAL = String.raw`"((?:[^"\\]|\\.)*)"`

function callPatterns({ extraCallNames, secondArgCallNames, assignNames, markerComments, textAtCalls }) {
  const extra = extraCallNames.map((name) => new RegExp(`\\b${name}\\s*\\(\\s*${LITERAL}`, "g"))
  // Todo 24 (all opt-in): pausedMessage(sec, "msg"), text = "msg", and an i18n marker comment before a literal.
  const second = secondArgCallNames.map(
    (name) => new RegExp(`\\b${name}\\s*\\(\\s*[^,()"]*,\\s*${LITERAL}`, "g")
  )
  const assign = assignNames.map((name) => new RegExp(`\\b${name}\\s*=\\s*${LITERAL}`, "g"))
  const marker = markerComments ? [new RegExp(String.raw`/\*i18n\*/\s*${LITERAL}`, "g")] : []
  const textAt = textAtCalls ? [new RegExp(TEXT_AT_PATTERN, "g")] : []
  return [...CALL_PATTERNS, ...extra, ...second, ...assign, ...marker, ...textAt]
}

// A literal with no letters outside printf conversions ("%s%s", "\n\n%s\n")
// carries nothing to translate.
function isFormatOnly(text) {
  return !/[A-Za-z]/.test(text.replace(/%[-+ #0-9.]*[a-zA-Z%]/g, ""))
}

// Todo 26: `menu.setTitle("XU4 Configuration:", 0, 0)` -- the Configure
// menus' heading lines. They sit between the `.add(...)` calls in file
// order, so extracting them in file order would shift the existing
// ui:intro:0..55 ids; opt-in `setTitleCalls` therefore lists them AFTER
// every other literal of the file (see the base offset below).
const SET_TITLE_PATTERN = /\.setTitle\s*\(\s*"((?:[^"\\]|\\.)*)"/g
const TRAILING_GROUP_OFFSET = 1e9

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
 * Todo 24 options (discourse_castle.cpp, codex.cpp only): `secondArgCallNames`,
 * `assignNames`, `markerComments` (a literal right after an i18n marker comment) and
 * `skipFormatOnly`.
 *   - `textAtCalls` (Todo 26): also capture TextView textAt/textAtKey/
 *     textAtFmt literals (intro.cpp).
 *   - `setTitleCalls` (Todo 26): also capture Menu::setTitle literals,
 *     listed after all other literals so earlier ids don't move.
 */
export function extractCppLiterals(source, options = {}) {
  const {
    extraCallNames = [],
    joinAdjacent = false,
    secondArgCallNames = [],
    assignNames = [],
    markerComments = false,
    skipFormatOnly = false,
    textAtCalls = false,
    setTitleCalls = false
  } = options ?? {}
  const literals = []
  const groups = callPatterns({ extraCallNames, secondArgCallNames, assignNames, markerComments, textAtCalls }).map(
    (pattern) => ({ pattern, base: 0 })
  )
  if (setTitleCalls) groups.push({ pattern: new RegExp(SET_TITLE_PATTERN.source, "g"), base: TRAILING_GROUP_OFFSET })
  for (const { pattern, base } of groups) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      const raw = joinAdjacent ? joinAdjacentLiterals(source, pattern.lastIndex, match[1]) : match[1]
      const text = unescapeCLiteral(raw)
      if (text.length === 0) continue
      if (skipFormatOnly && isFormatOnly(text)) continue
      literals.push({ offset: base + match.index, text })
    }
  }
  literals.sort((left, right) => left.offset - right.offset)
  return literals
}
