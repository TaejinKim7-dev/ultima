import { describe, expect, it } from "vitest"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import {
  buildModuleNameMap,
  buildUiTemplateMap,
  fnv1a32,
  isPlaceholderOnly,
  orderedPlaceholders
} from "../../scripts/lib/ui-templates.mjs"
import { generateI18nTables } from "../../scripts/i18n-generate.mjs"
import uiSchema from "../../locales/ko/ui.json" with { type: "json" }

// Todo 23: the web build's screenMessage() hook (vendor/xu4/src/screen.cpp)
// never sends its format string -- only an FNV-1a hash of the format bytes
// plus the pre-formatted arguments -- so original-data text that some call
// sites pass as the format (castle/codex AVATAR.EXE lines) can never leave
// the engine. i18n:generate builds the hash -> ui id table the shell uses.

type Entry = { sourceHash: string; placeholders: string[]; translation: string; status: string }

function entry(literal: string, translation: string, status = "ready"): Entry {
  return { sourceHash: sourceHash(literal), placeholders: [], translation, status }
}

describe("fnv1a32", () => {
  it("matches the standard 32-bit FNV-1a test vectors (the native hook uses the same algorithm)", () => {
    expect(fnv1a32("")).toBe("811c9dc5")
    expect(fnv1a32("a")).toBe("e40c292c")
    expect(fnv1a32("foobar")).toBe("bf9cf968")
  })

  it("hashes each UTF-16 code unit's low byte, i.e. the C literal's raw bytes (\\020-style color codes)", () => {
    expect(fnv1a32("\u0013x")).toBe(fnv1a32(String.fromCharCode(0x13) + "x"))
  })
})

describe("orderedPlaceholders / isPlaceholderOnly", () => {
  it("keeps printf conversions in source order", () => {
    expect(orderedPlaceholders("%cSlow %3d %s!%c\n")).toEqual(["%c", "%3d", "%s", "%c"])
  })

  it("treats literals with no letters outside their conversions as untranslatable (never mapped)", () => {
    expect(isPlaceholderOnly("%s\n")).toBe(true)
    expect(isPlaceholderOnly("%c\n")).toBe(true)
    expect(isPlaceholderOnly("\n%s\n\n")).toBe(true)
    expect(isPlaceholderOnly("Pass\n")).toBe(false)
  })
})

describe("buildUiTemplateMap", () => {
  const literals = ["Pass\n", "Enter %s!\n\n", "%s\n", "Stale\n", "Pending\n", "%s has %d gold\n", "Pass\n"]
  const entries: Record<string, Entry> = {
    "ui:fx:0": entry("Pass\n", "패스\n"),
    "ui:fx:1": entry("Enter %s!\n\n", "%s(으)로 입장!\n\n"),
    "ui:fx:2": entry("%s\n", "%s\n"),
    "ui:fx:3": { ...entry("Old text\n", "옛글\n") },
    "ui:fx:4": entry("Pending\n", "", "pending"),
    "ui:fx:5": entry("%s has %d gold\n", "%d 골드가 %s에게\n"),
    "ui:fx:6": entry("Pass\n", "패스\n")
  }
  const { templates, excluded } = buildUiTemplateMap([{ idPrefix: "ui:fx", literals }], entries)

  it("maps the hash of each ready literal whose sourceHash still matches to its id", () => {
    expect(templates[fnv1a32("Pass\n")]).toBe("ui:fx:0")
    expect(templates[fnv1a32("Enter %s!\n\n")]).toBe("ui:fx:1")
  })

  it("never maps placeholder-only literals, stale hashes, or pending translations", () => {
    expect(templates[fnv1a32("%s\n")]).toBeUndefined()
    expect(templates[fnv1a32("Stale\n")]).toBeUndefined()
    expect(templates[fnv1a32("Pending\n")]).toBeUndefined()
    expect(excluded.map((row) => row.id).sort()).toEqual(["ui:fx:2", "ui:fx:3", "ui:fx:4", "ui:fx:5"])
  })

  it("excludes a translation that reorders conversions (the shell substitutes arguments in order)", () => {
    expect(templates[fnv1a32("%s has %d gold\n")]).toBeUndefined()
    expect(excluded.find((row) => row.id === "ui:fx:5")?.reason).toMatch(/order/)
  })

  it("keeps one id for a duplicate literal whose translations agree, and drops it when they differ", () => {
    expect(Object.values(templates).filter((id) => id === "ui:fx:6")).toEqual([])
    const conflicting = buildUiTemplateMap(
      [{ idPrefix: "ui:fx", literals: ["Pass\n", "Pass\n"] }],
      { "ui:fx:0": entry("Pass\n", "패스\n"), "ui:fx:1": entry("Pass\n", "통과\n") }
    )
    expect(conflicting.templates[fnv1a32("Pass\n")]).toBeUndefined()
    expect(conflicting.excluded.some((row) => /duplicate/.test(row.reason))).toBe(true)
  })
})

describe("buildModuleNameMap", () => {
  it("maps short module identifier/display literals (config.b names) to their ids", () => {
    const names = buildModuleNameMap(
      [{ idPrefix: "module:Ultima-IV:config", literals: ["DAG", "Dagger", "", "%s gold"] }],
      {
        "module:Ultima-IV:config:0": entry("DAG", "단"),
        "module:Ultima-IV:config:1": entry("Dagger", "단검"),
        "module:Ultima-IV:config:3": entry("%s gold", "%s 골드")
      }
    )
    expect(names).toEqual({ DAG: "module:Ultima-IV:config:0", Dagger: "module:Ultima-IV:config:1" })
  })
})

describe("i18n:generate uiTemplates / moduleNames (real locales/ko)", () => {
  const tables = generateI18nTables("locales/ko")

  it("maps the literals the Todo 23 e2e provokes", () => {
    expect(tables.uiTemplates[fnv1a32("Pass\n")]).toBe("ui:game:15")
    expect(tables.uiTemplates[fnv1a32("Enter %s!\n\n")]).toBe("ui:portal:1")
  })

  it("maps config.b names so %s arguments like weapon names can be translated", () => {
    const daggerId = tables.moduleNames["Dagger"]
    expect(daggerId).toMatch(/^module:Ultima-IV:config:\d+$/)
    expect(tables.entries[daggerId!]?.translation).toBe("단검")
  })

  it("inventories and translates vendor/xu4/src/shrine.cpp's screenMessage literals", () => {
    const shrine = Object.entries((uiSchema as { entries: Record<string, Entry> }).entries).filter(([id]) =>
      id.startsWith("ui:shrine:")
    )
    expect(shrine.length).toBeGreaterThanOrEqual(10)
    for (const [id, row] of shrine) {
      expect(row.status, id).toBe("ready")
      // Letters inside a printf conversion (`%s`) are not English text.
      const withoutConversions = row.translation.replace(/%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g, "")
      expect(/\p{Script=Hangul}/u.test(row.translation) || !/[A-Za-z]/.test(withoutConversions), id).toBe(true)
    }
  })
})
