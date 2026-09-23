/**
 * printf-style placeholder detection ("%s", "%d", "%-3.2f", "%%", ...) plus
 * the "{0}"-style indexed placeholders used nowhere in xu4 today but kept
 * for forward compatibility with UI strings we may add ourselves.
 *
 * We intentionally return a SORTED multiset (not the original order):
 * Korean word order legitimately differs from English, so a translation
 * that reorders "%s has %d gold" as "%d 골드를 %s 가 얻었다" must still be
 * accepted -- only the *set* (count + kind) of placeholders must match.
 */
const PLACEHOLDER_PATTERN = /%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]|\{\d+\}/g

export function extractPlaceholders(text) {
  if (typeof text !== "string" || text.length === 0) return []
  const matches = text.match(PLACEHOLDER_PATTERN) ?? []
  return matches.slice().sort((left, right) => left.localeCompare(right))
}

export function placeholdersEqual(sourcePlaceholders, translationText) {
  const expected = [...sourcePlaceholders].sort((left, right) => left.localeCompare(right))
  const actual = extractPlaceholders(translationText)
  if (expected.length !== actual.length) return false
  return expected.every((token, index) => token === actual[index])
}
