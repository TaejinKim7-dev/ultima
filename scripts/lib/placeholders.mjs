/**
 * printf-style placeholder detection ("%s", "%d", "%-3.2f", "%%", ...) plus
 * the "{0}"-style indexed placeholders used nowhere in xu4 today but kept
 * for forward compatibility with UI strings we may add ourselves.
 *
 * Tokens are returned in SOURCE ORDER. The composers substitute engine
 * arguments strictly in order, so a translation must carry the same tokens
 * in the same order; reordering "%s has %d gold" as "%d gold %s" would put
 * a number into a name slot. (Positional "%1$s" is not supported.)
 */
const PLACEHOLDER_PATTERN = /%[-+0#]*\d*(?:\.\d+)?[a-zA-Z%]|\{\d+\}/g

export function extractPlaceholders(text) {
  if (typeof text !== "string" || text.length === 0) return []
  return text.match(PLACEHOLDER_PATTERN) ?? []
}

export function placeholdersEqual(sourcePlaceholders, translationText) {
  const actual = extractPlaceholders(translationText)
  if (sourcePlaceholders.length !== actual.length) return false
  return sourcePlaceholders.every((token, index) => token === actual[index])
}
