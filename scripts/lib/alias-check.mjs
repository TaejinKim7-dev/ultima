/**
 * Korean NPC-keyword alias collision detection.
 *
 * Normalization: Unicode NFC, trimmed, internal whitespace collapsed to a
 * single space, lower-cased (a no-op for Hangul, meaningful for the
 * English canonical keywords aliases point at).
 */
export function normalizeAliasText(text) {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * @param entries {Record<string, {alias: string, canonical: string}>}
 * @returns collision descriptors; empty array means no collisions.
 */
export function findAliasCollisions(entries) {
  const collisions = []
  const byNormalizedAlias = new Map()

  // An entry with no alias text yet (still `pending`, e.g. a scaffolded
  // canonical keyword waiting for a Todo 15 translator) is not "an alias"
  // -- it must not be compared against other not-yet-filled-in entries,
  // or every pending entry would spuriously "collide" on the empty string.
  const activeEntries = Object.entries(entries).filter(
    ([, entry]) => normalizeAliasText(entry.alias).length > 0
  )

  for (const [id, entry] of activeEntries) {
    const normalized = normalizeAliasText(entry.alias)
    if (!byNormalizedAlias.has(normalized)) byNormalizedAlias.set(normalized, [])
    byNormalizedAlias.get(normalized).push({ id, canonical: entry.canonical })
  }

  // Case 1: the same alias text (normalized) is registered more than once,
  // whether or not it points at the same canonical keyword -- either it is
  // a redundant duplicate entry or, worse, an ambiguous one.
  for (const [normalizedAlias, occurrences] of byNormalizedAlias) {
    if (occurrences.length > 1) {
      collisions.push({
        type: "duplicate-alias",
        alias: normalizedAlias,
        entries: occurrences
      })
    }
  }

  // Case 2: an alias's text equals ANOTHER entry's canonical keyword. This
  // means typing that alias is ambiguous with typing the real keyword
  // directly, which routes to a different answer than the alias author
  // intended.
  for (const [id, entry] of activeEntries) {
    const normalizedAlias = normalizeAliasText(entry.alias)
    const shadowed = Object.entries(entries).find(
      ([otherId, other]) => otherId !== id && normalizeAliasText(other.canonical) === normalizedAlias
    )
    if (shadowed) {
      collisions.push({
        type: "alias-shadows-canonical",
        entryId: id,
        alias: entry.alias,
        shadowedEntryId: shadowed[0],
        shadowedCanonical: shadowed[1].canonical
      })
    }
  }

  return collisions
}
