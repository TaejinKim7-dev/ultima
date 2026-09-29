import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { extractBoronLiterals } from "../../scripts/lib/boron-strings.mjs"
import { boronRuntimeText, buildVendorTemplateMap } from "../../scripts/lib/vendor-templates.mjs"
import { generateI18nTables } from "../../scripts/i18n-generate.mjs"

// Todo 25: vendors.b's `web-say` cfunc sends the UNSUBSTITUTED template the
// engine is about to print (its runtime bytes, hashed by web_hash.h) plus the
// symbol/value pairs `construct` will apply. i18n:generate must therefore key
// its Korean templates by the hash of those runtime bytes -- which differ from
// the extractor's source text for `{{ ... }}` strings (Boron un-indents them,
// vendor/boron/support/trim_string.c) -- and pre-normalize the Korean side the
// same way.

type Entry = { sourceHash: string; placeholders: string[]; translation: string; status: string }
function entry(literal: string, translation: string, status = "ready"): Entry {
  return { sourceHash: sourceHash(literal), placeholders: [], translation, status }
}

describe("boronRuntimeText", () => {
  it("leaves quoted and single-brace literals unchanged", () => {
    expect(boronRuntimeText("\nWe Have:\n", "quoted")).toBe("\nWe Have:\n")
    expect(boronRuntimeText("plain", "braced")).toBe("plain")
  })

  it("turns a {{ ... }} literal into its un-indented lines (first-text-line margin, trailing newline kept)", () => {
    const source = "{\n            Welcome to\n            @\n\n            % says:\n              Buy? \n        }"
    expect(boronRuntimeText(source, "braced")).toBe("Welcome to\n@\n\n% says:\n  Buy? \n")
  })

  it("removes at most the margin from later lines, stopping at the first text character", () => {
    expect(boronRuntimeText("{\n    a\n  b\n      c\n    }", "braced")).toBe("a\nb\n  c\n")
  })
})

describe("buildVendorTemplateMap", () => {
  const literals = [
    { form: "quoted", text: "\n% says:\nFare thee well!\n" },
    { form: "braced", text: "{\n    Welcome to\n    @\n    Buy or Sell? \n}" },
    { form: "quoted", text: "no symbols\n" },
    { form: "quoted", text: "\nCost $gp\n" },
    { form: "quoted", text: "" }
  ]
  const entries: Record<string, Entry> = {
    "m:0": entry(literals[0]!.text, "\n%(이)가 말한다:\n평안히 가시게!\n"),
    "m:1": entry(literals[1]!.text, "{\n    어서 오십시오\n    @\n    사시겠습니까 파시겠습니까? \n}"),
    "m:2": entry(literals[2]!.text, "기호 없음\n"),
    "m:3": entry(literals[3]!.text, "\n가격 gp\n") // dropped the $ symbol
  }
  const { templates, excluded } = buildVendorTemplateMap([{ idPrefix: "m", literals }], entries)

  it("keys the runtime-bytes hash to the Korean runtime text", () => {
    expect(templates[fnv1a32("\n% says:\nFare thee well!\n")]).toBe("\n%(이)가 말한다:\n평안히 가시게!\n")
    expect(templates[fnv1a32("no symbols\n")]).toBe("기호 없음\n")
  })

  it("keys a {{ }} literal by its un-indented bytes, and by the trailing-newline-trimmed bytes input-shop sends", () => {
    const korean = "어서 오십시오\n@\n사시겠습니까 파시겠습니까? \n"
    expect(templates[fnv1a32("Welcome to\n@\nBuy or Sell? \n")]).toBe(korean)
    expect(templates[fnv1a32("Welcome to\n@\nBuy or Sell? ")]).toBe(korean.slice(0, -1))
  })

  it("excludes a translation whose substitution symbols differ from the source", () => {
    expect(templates[fnv1a32("\nCost $gp\n")]).toBeUndefined()
    const row = excluded.find((item: { id: string }) => item.id === "m:3")
    expect(row?.reason).toMatch(/symbol/)
  })
})

describe("i18n:generate vendorTemplates / vendorNames (real locales/ko + vendors.b)", () => {
  const tables = generateI18nTables("locales/ko")
  const source = readFileSync("vendor/xu4/module/Ultima-IV/vendors.b", "utf8")
  const literals = extractBoronLiterals(source)

  it("maps the Moonglow-relevant templates (the farewell and the input-shop welcome) to Korean", () => {
    const farewell = "\n% says:\nFare thee well!\n"
    expect(literals.some((row) => row.text === farewell)).toBe(true)
    expect(tables.vendorTemplates[fnv1a32(farewell)]).toMatch(/\p{Script=Hangul}/u)
    const welcome = tables.vendorTemplates[fnv1a32("Welcome to\n@\n\n% says:\nWelcome friend!\nArt thou here to\nBuy or Sell? ")]
    expect(welcome).toMatch(/@/)
    expect(welcome).not.toMatch(/^\s|\{|\}/)
  })

  it("translates shop and owner names through vendorNames", () => {
    for (const name of ["The Sage Deli", "Shaman", "Harmony"]) {
      const id = tables.vendorNames[name]
      expect(id, name).toMatch(/^module:Ultima-IV:vendors:\d+$/)
      expect(tables.entries[id!]?.translation, name).toMatch(/\p{Script=Hangul}/u)
    }
  })

  it("covers every {{ }} template printed by => and input-shop", () => {
    const braced = literals.filter((row) => row.form === "braced" && row.text.startsWith("{\n"))
    expect(braced.length).toBeGreaterThan(10)
    const missing = braced.filter((row) => tables.vendorTemplates[fnv1a32(boronRuntimeText(row.text, "braced"))] === undefined)
    expect(missing.map((row) => row.text.slice(0, 40))).toEqual([])
  })
})
