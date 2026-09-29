import { describe, expect, it } from "vitest"
import { composeUiMessage, createUiMessageHandler, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"

// Todo 23: vendor/xu4/src/screen.cpp's web build sends each screenMessage()
// call as (FNV-1a hash of the format, pre-formatted conversion strings).
// This pure composer maps the hash to a ui id and fills the Korean
// template's conversions, in order, with those strings.

const TEMPLATES: Record<string, string> = { aaaa0001: "ui:game:15", aaaa0002: "ui:portal:1", aaaa0003: "ui:game:99" }
const TABLE: Record<string, string> = {
  "ui:game:15": "패스\n",
  "ui:portal:1": "%s(으)로 입장!\n\n",
  "ui:game:99": "%c%s: %3d 골드 (100%%)%c\n",
  "module:Ultima-IV:config:16": "단검"
}
const NAMES: Record<string, string> = { Dagger: "module:Ultima-IV:config:16" }
const deps: UiMessageDeps = {
  templateId: (hash) => TEMPLATES[hash],
  resolve: (id, fallback) => TABLE[id] ?? fallback,
  moduleNameId: (text) => NAMES[text]
}

describe("composeUiMessage", () => {
  it("returns the Korean line for a known hash with no conversions", () => {
    expect(composeUiMessage("aaaa0001", [], deps)).toBe("패스\n")
  })

  it("returns null for a hash that is not in the table (never emitted)", () => {
    expect(composeUiMessage("deadbeef", ["anything"], deps)).toBeNull()
  })

  it("substitutes pre-formatted conversions in order, keeping color bytes and widths as the engine formatted them", () => {
    expect(composeUiMessage("aaaa0003", ["\u0013", "Dupre", " 42", "\u0010"], deps)).toBe("\u0013Dupre:  42 골드 (100%)\u0010\n")
  })

  it("translates a %s argument that is a module config name", () => {
    expect(composeUiMessage("aaaa0003", ["\u0013", "Dagger", "  1", "\u0010"], deps)).toBe("\u0013단검:   1 골드 (100%)\u0010\n")
  })

  it("leaves a %s argument with no module id (e.g. the towne city type symbol) as the engine formatted it", () => {
    expect(composeUiMessage("aaaa0002", ["towne"], deps)).toBe("towne(으)로 입장!\n\n")
  })

  it("does not look up module names for non-%s conversions", () => {
    const numericDagger = composeUiMessage("aaaa0003", ["\u0013", "x", "Dagger", "\u0010"], deps)
    expect(numericDagger).toBe("\u0013x: Dagger 골드 (100%)\u0010\n")
  })

  it("returns null when the mapped id has no Korean translation (nothing English is available to show)", () => {
    expect(composeUiMessage("aaaa0001", [], { ...deps, resolve: (_id, fallback) => fallback })).toBeNull()
  })
})

describe("createUiMessageHandler", () => {
  it("emits the composed Korean line and skips unmapped hashes", () => {
    const lines: string[] = []
    const handle = createUiMessageHandler(deps, (text) => lines.push(text))
    handle("aaaa0001", [])
    handle("deadbeef", [])
    expect(lines).toEqual(["패스\n"])
  })

  it("never lets an exception escape back into the engine's EM_JS call (it would unwind the wasm game loop)", () => {
    const failures: unknown[] = []
    const handle = createUiMessageHandler(
      { ...deps, templateId: () => { throw new Error("boom") } },
      () => {},
      (error) => failures.push(error)
    )
    expect(() => handle("aaaa0001", [])).not.toThrow()
    expect(failures).toHaveLength(1)
  })
})
