// Todo 38: pure counter for the engine-to-JS text channels that drop or fall
// back silently. It stores ONLY hashes (8 lowercase hex FNV-1a digits) and
// semantic ids -- never English text or raw %s argument text: every key is
// validated and anything else is counted in `rejected` and discarded. No DOM,
// no console output, no effect on what the player sees.

export const COVERAGE_KINDS = [
  "ui-unmapped",
  "vendor-unmapped",
  "talk-unmapped",
  "resolve-fallback",
  "arg-passthrough"
] as const

export type CoverageKind = (typeof COVERAGE_KINDS)[number]

export type CoverageMiss =
  | { kind: "ui-unmapped" | "vendor-unmapped" | "talk-unmapped"; hash: string }
  | { kind: "resolve-fallback"; id: string }
  | { kind: "arg-passthrough"; id: string; position: number; argHash: string }

export interface CoverageCount {
  key: string
  count: number
}

export type CoverageSnapshot = Record<CoverageKind, CoverageCount[]> & { rejected: number }

export interface CoverageRecorder {
  record(miss: CoverageMiss): void
  snapshot(): CoverageSnapshot
}

const HASH_PATTERN = /^[0-9a-f]{8}$/
// `ui:intro:3`, `module:Ultima-IV:config:68`, TLK ids such as `BRITAIN:3:name`: a
// namespace plus colon-separated segments, with no spaces or other prose characters.
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?::[A-Za-z0-9_.-]+)+$/

/** 32-bit FNV-1a over each UTF-16 code unit's low byte, 8 lowercase hex digits (scripts/lib/ui-templates.mjs fnv1a32). */
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index) & 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function keyOf(miss: CoverageMiss): string | undefined {
  switch (miss.kind) {
    case "ui-unmapped":
    case "vendor-unmapped":
    case "talk-unmapped":
      return HASH_PATTERN.test(miss.hash) ? miss.hash : undefined
    case "resolve-fallback":
      return ID_PATTERN.test(miss.id) ? miss.id : undefined
    case "arg-passthrough":
      return ID_PATTERN.test(miss.id) && Number.isInteger(miss.position) && miss.position >= 0 && HASH_PATTERN.test(miss.argHash)
        ? `${miss.id}|${miss.position}|${miss.argHash}`
        : undefined
  }
}

export function createCoverageRecorder(): CoverageRecorder {
  const counts = new Map<CoverageKind, Map<string, number>>(COVERAGE_KINDS.map((kind) => [kind, new Map()]))
  let rejected = 0
  return {
    record(miss) {
      const key = keyOf(miss)
      const bucket = counts.get(miss.kind)
      if (key === undefined || bucket === undefined) {
        rejected += 1
        return
      }
      bucket.set(key, (bucket.get(key) ?? 0) + 1)
    },
    snapshot() {
      const out = { rejected } as CoverageSnapshot
      for (const kind of COVERAGE_KINDS) {
        out[kind] = [...(counts.get(kind) ?? [])]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      }
      return out
    }
  }
}

/** The page-wide recorder behind `window.ultimaI18nCoverage` (read-only snapshot()). */
export const sharedCoverage: CoverageRecorder = createCoverageRecorder()

/**
 * Wraps a resolve(id, fallback) so an id without a translation is recorded as
 * `resolve-fallback`. Returns exactly what `resolve` returns.
 */
export function createRecordingResolve(
  resolve: (id: string, fallback: string) => string,
  hasTranslation: (id: string) => boolean,
  recorder: CoverageRecorder
): (id: string, fallback: string) => string {
  return (id, fallback) => {
    if (!hasTranslation(id)) {
      recorder.record({ kind: "resolve-fallback", id })
    }
    return resolve(id, fallback)
  }
}
