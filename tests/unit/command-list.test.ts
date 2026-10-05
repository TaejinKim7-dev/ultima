// Todo 52 (user request 2026-10-05): first-time players do not know the
// one-letter commands, so the page lists them (in Korean) as clickable
// buttons that send the key. The keys must be real commands of the engine.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { COMMAND_GROUPS, allCommands, commandAvailable } from "../../src/ui/command-list.ts"

const game = readFileSync(new URL("../../vendor/xu4/src/game.cpp", import.meta.url), "utf8")

describe("command list", () => {
  it("has unique single-letter keys", () => {
    const keys = allCommands().map((command) => command.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z]$/)
  })

  it("only lists keys the engine's main key handler really handles", () => {
    for (const { key } of allCommands()) {
      expect(game, `engine has no case '${key}':`).toMatch(new RegExp(`case '${key}':`))
    }
  })

  it("covers the commands a new player needs first (talk, cast, use, open, search, ztats, save)", () => {
    const keys = allCommands().map((command) => command.key)
    for (const key of ["t", "c", "u", "o", "s", "z", "q", "e"]) expect(keys).toContain(key)
  })

  it("every entry has a Korean label and a short hint", () => {
    for (const command of allCommands()) {
      expect(command.label).toMatch(/\p{Script=Hangul}/u)
      expect(command.hint.length).toBeGreaterThan(0)
    }
    expect(COMMAND_GROUPS.length).toBeGreaterThanOrEqual(3)
  })
})

describe("commandAvailable", () => {
  it("is available only while playing with no native prompt open", () => {
    expect(commandAvailable({ playing: true, promptOpen: false, modal: false })).toBe(true)
    expect(commandAvailable({ playing: false, promptOpen: false, modal: false })).toBe(false)
    expect(commandAvailable({ playing: true, promptOpen: true, modal: false })).toBe(false)
    expect(commandAvailable({ playing: true, promptOpen: false, modal: true })).toBe(false)
  })
})
