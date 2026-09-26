import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import {
  allowsKoreanInField,
  fitsStatusWidth,
  hasTranslation,
  isCommandKeyId,
  resolveDisplayText,
  translationPlaceholdersMatch,
  type LocalizationTable,
} from "../../src/i18n/localization.ts"
import { GENERATED_ALIASES, GENERATED_I18N_ENTRIES } from "../../src/i18n/generated/strings.ts"
import { buildAliasTable, resolveInput } from "../../src/i18n/korean-aliases.ts"

// Todo 14: localization runtime boundaries. Every display surface (C++
// screenMessageN funnel, Boron translation overlay, TLK lookup
// `map:npcIndex:field`, binary text lookup `resource:table:index`, JS UI
// labels) resolves through the SAME semantic IDs emitted by
// `scripts/i18n-generate.mjs` from `locales/ko/*.json`. Game logic,
// printf/command keys, and fixed .SAV byte fields stay English/ASCII.

const SAMPLE_TABLE: LocalizationTable = {
  "ui:intro:0": { translation: "시작", placeholders: [], status: "ready" },
  "ui:speed:0": { translation: "속도: %d", placeholders: ["%d"], status: "ready" },
  "ui:broken:0": { translation: "속도 변경됨", placeholders: ["%d"], status: "ready" },
  "ui:status:0": { translation: "체력", placeholders: [], status: "ready", category: "status" },
  "cmd:attack:0": { translation: "공격", placeholders: [], status: "ready", category: "command" },
  "ui:pending:0": { translation: "", placeholders: [], status: "pending" },
}

describe("localization boundaries: same semantic IDs", () => {
  it("resolves a ready entry to its Korean display text", () => {
    expect(resolveDisplayText("ui:intro:0", "Start", SAMPLE_TABLE)).toBe("시작")
  })

  it("falls back to English for pending entries without a translation (Todo 15 fills the corpus)", () => {
    expect(resolveDisplayText("ui:pending:0", "Camp", SAMPLE_TABLE)).toBe("Camp")
  })

  it("falls back to English for unknown IDs instead of throwing", () => {
    expect(resolveDisplayText("nope:missing:0", "Fallback", SAMPLE_TABLE)).toBe("Fallback")
  })

  it("generated table only carries entries i18n:check accepted (no pending translations leak in)", () => {
    for (const [id, entry] of Object.entries(GENERATED_I18N_ENTRIES)) {
      expect(entry.translation.trim().length, id).toBeGreaterThan(0)
    }
    expect(hasTranslation("ui:intro:0", SAMPLE_TABLE)).toBe(true)
    expect(hasTranslation("ui:pending:0", SAMPLE_TABLE)).toBe(false)
    expect(hasTranslation("nope:missing:0", SAMPLE_TABLE)).toBe(false)
  })
})

describe("localization boundaries: internal command keys stay ASCII", () => {
  it("never localizes command-category IDs, even when a translation exists", () => {
    expect(isCommandKeyId("cmd:attack:0", SAMPLE_TABLE)).toBe(true)
    expect(resolveDisplayText("cmd:attack:0", "a", SAMPLE_TABLE)).toBe("a")
  })

  it("does not mistake ordinary UI IDs for command keys", () => {
    expect(isCommandKeyId("ui:intro:0", SAMPLE_TABLE)).toBe(false)
  })
})

describe("localization boundaries: placeholder signatures", () => {
  it("accepts a matching placeholder multiset", () => {
    expect(translationPlaceholdersMatch("ui:speed:0", SAMPLE_TABLE)).toBe(true)
  })

  it("rejects a translation that drops a placeholder (build must fail before runtime)", () => {
    expect(translationPlaceholdersMatch("ui:broken:0", SAMPLE_TABLE)).toBe(false)
  })
})

describe("localization boundaries: status width (Hangul = 2 cols, budget 15)", () => {
  it("fits a short Korean status label", () => {
    expect(fitsStatusWidth("체력")).toBe(true)
  })

  it("rejects an over-wide Korean status label", () => {
    expect(fitsStatusWidth("매우매우매우매우매우긴상태줄문자열입니다")).toBe(false)
  })
})

describe("localization boundaries: fixed save fields stay ASCII", () => {
  it("rejects Korean in avatar-name/number/command/direction/save fields", () => {
    for (const field of ["avatar-name", "number", "command", "direction", "save"]) {
      expect(allowsKoreanInField(field), field).toBe(false)
    }
  })

  it("allows Korean in dialogue/UI-label fields", () => {
    for (const field of ["dialogue", "ui-label"]) {
      expect(allowsKoreanInField(field), field).toBe(true)
    }
  })
})

describe("localization boundaries: aliases share the same generated IDs", () => {
  it("generated aliases resolve through the Todo 13 NFC resolver to canonical English", () => {
    const table = buildAliasTable(GENERATED_ALIASES)
    expect(table.byNormalizedAlias.size).toBeGreaterThan(0)
    for (const canonical of table.byNormalizedAlias.values()) {
      expect(canonical, "alias canonical must stay ASCII English").toMatch(/^[\x00-\x7f]+$/)
    }
    const firstAlias = [...table.byNormalizedAlias.keys()][0] as string
    const expected = table.byNormalizedAlias.get(firstAlias) as string
    expect(resolveInput("text", firstAlias, table)).toEqual({ ok: true, text: expected })
  })
})

describe("localization boundaries: no runtime JSON parser in the display path", () => {
  it("the TS runtime resolves from a static import, never fetch/JSON.parse", () => {
    const runtimePath = fileURLToPath(new URL("../../src/i18n/localization.ts", import.meta.url))
    const source = readFileSync(runtimePath, "utf8")
    expect(source).not.toMatch(/JSON\.parse/)
    expect(source).not.toMatch(/fetch\s*\(/)
  })
})
