// User request 2026-10-05: log key points (text prompts, Korean submissions,
// Enter routing, paging) so a reported issue can be traced.
//
// Quiet by default: audit:dist allows only console.warn/console.error in the
// shipped bundle, and a normal session must not spam the console. Add
// `?debug=1` to the page URL to see each entry as a console.warn. The last
// entries are always kept in memory; `window.ultimaDebugLog.entries()` dumps
// them from the browser console after the fact.

export interface DebugLogEntry {
  readonly t: number
  readonly event: string
  readonly data: unknown
}

export interface DebugLog {
  log(event: string, data?: unknown): void
  entries(): readonly DebugLogEntry[]
}

export interface DebugLogOptions {
  readonly enabled: boolean
  readonly limit?: number
  readonly warn?: (...args: unknown[]) => void
  readonly now?: () => number
  /** Receives every entry (the dev server's file log); a throwing sink is ignored. */
  readonly sink?: (entry: DebugLogEntry) => void
}

export function createDebugLog(options: DebugLogOptions): DebugLog {
  const limit = options.limit ?? 300
  const warn = options.warn ?? ((...args: unknown[]) => console.warn(...args))
  const now = options.now ?? (() => Date.now())
  const buffer: DebugLogEntry[] = []
  return {
    log(event, data) {
      const entry = { t: now(), event, data }
      buffer.push(entry)
      if (buffer.length > limit) buffer.splice(0, buffer.length - limit)
      if (options.enabled) warn("[u4]", event, data)
      try {
        options.sink?.(entry)
      } catch {
        // logging must never affect play
      }
    },
    entries() {
      return buffer.slice()
    }
  }
}

/** `?debug=1` in the page URL turns console output on. */
export function debugEnabledFromUrl(href: string): boolean {
  try {
    return new URL(href).searchParams.get("debug") === "1"
  } catch {
    return false
  }
}
