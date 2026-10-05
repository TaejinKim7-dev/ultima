// User request 2026-10-05: key points log what happened so an issue can be
// traced. Quiet by default (audit:dist allows only console.warn/error and a
// live session must not be noisy); `?debug=1` turns console output on. The
// last entries are always kept in memory so they can be dumped afterwards.
import { describe, expect, it, vi } from "vitest"
import { createDebugLog, debugEnabledFromUrl } from "../../src/debug-log.ts"

describe("debug log", () => {
  it("keeps entries in a bounded buffer and stays off the console when disabled", () => {
    const warn = vi.fn()
    const log = createDebugLog({ enabled: false, limit: 3, warn, now: () => 1000 })
    for (let i = 0; i < 5; i += 1) log.log("prompt", { i })
    expect(warn).not.toHaveBeenCalled()
    expect(log.entries().map((entry) => entry.data)).toEqual([{ i: 2 }, { i: 3 }, { i: 4 }])
    expect(log.entries()[0]).toMatchObject({ t: 1000, event: "prompt" })
  })

  it("writes to console.warn with a [u4] tag when enabled", () => {
    const warn = vi.fn()
    const log = createDebugLog({ enabled: true, limit: 10, warn, now: () => 5 })
    log.log("korean-enter", { route: "game" })
    expect(warn).toHaveBeenCalledWith("[u4]", "korean-enter", { route: "game" })
  })

  it("is enabled by ?debug=1 only", () => {
    expect(debugEnabledFromUrl("http://x/ultima/?debug=1")).toBe(true)
    expect(debugEnabledFromUrl("http://x/ultima/")).toBe(false)
    expect(debugEnabledFromUrl("http://x/ultima/?debug=0")).toBe(false)
  })
})

describe("debug log sink", () => {
  it("forwards every entry to the sink (dev server file log), even when console output is off", () => {
    const sink = vi.fn()
    const log = createDebugLog({ enabled: false, sink, now: () => 7 })
    log.log("key-wait", { on: true })
    expect(sink).toHaveBeenCalledWith({ t: 7, event: "key-wait", data: { on: true } })
  })

  it("never lets a failing sink break the game", () => {
    const log = createDebugLog({ enabled: false, sink: () => { throw new Error("offline") } })
    expect(() => log.log("x")).not.toThrow()
    expect(log.entries()).toHaveLength(1)
  })
})
