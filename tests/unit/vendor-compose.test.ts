import { describe, expect, it, vi } from "vitest"
import { composeVendorLine, createVendorHandler, type VendorComposeDeps } from "../../src/dialogue/vendor-compose.ts"

// Todo 25: the shell receives (template hash, [symbol, value, symbol, value...])
// from vendors.b's web-say and rebuilds what Boron `construct` would print,
// from the Korean template, with shop/owner/item names translated.

const TEMPLATES: Record<string, string> = {
  aaaa0001: "\n%(이)가 말한다:\n평안히 가시게!\n",
  aaaa0002: "어서 오십시오\n@\n%이(가) 반깁니다\n",
  aaaa0003: "\n#을(를) $gp에 팝니다. =이(가) 좋소\n",
  aaaa0004: "$ 골드\n",
  aaaa0005: "가진 것:\n+",
  aaaa0006: "@(으)로 가라\n"
}
const NAMES: Record<string, string> = { "The Sage Deli": "n:1", Shaman: "n:2", Dagger: "n:3" }
const KO: Record<string, string> = { "n:1": "현자의 델리", "n:2": "샤먼", "n:3": "단검" }
const deps: VendorComposeDeps = {
  template: (hash) => TEMPLATES[hash],
  nameId: (text) => NAMES[text],
  resolve: (id, fallback) => KO[id] ?? fallback
}

describe("composeVendorLine", () => {
  it("returns null when the template hash is unknown (never shows the untranslated/original text)", () => {
    expect(composeVendorLine("deadbeef", ["@", "x"], deps)).toBeNull()
  })

  it("replaces the shop-vars symbols with translated names, resolving a subject particle after the owner", () => {
    expect(composeVendorLine("aaaa0002", ["@", "The Sage Deli", "%", "Shaman"], deps)).toBe("어서 오십시오\n현자의 델리\n샤먼이 반깁니다\n")
    expect(composeVendorLine("aaaa0001", ["@", "The Sage Deli", "%", "Shaman"], deps)).toBe("\n샤먼이 말한다:\n평안히 가시게!\n")
  })

  it("picks 가 after a vowel-final owner and leaves unresolvable particles as written", () => {
    expect(composeVendorLine("aaaa0001", ["%", "Harmony"], { ...deps, resolve: (_id, fallback) => fallback })).toBe(
      "\nHarmony(이)가 말한다:\n평안히 가시게!\n"
    )
    expect(composeVendorLine("aaaa0001", ["%", "Shaman"], { ...deps, nameId: () => "x", resolve: () => "하나" })).toBe(
      "\n하나가 말한다:\n평안히 가시게!\n"
    )
  })

  it("substitutes numbers verbatim and picks the particle from the last digit's reading", () => {
    expect(composeVendorLine("aaaa0003", ["$", "20", "#", "3", "=", "Dagger"], deps)).toBe("\n3을 20gp에 팝니다. 단검이 좋소\n")
    expect(composeVendorLine("aaaa0003", ["$", "20", "#", "2", "=", "Dagger"], deps)).toBe("\n2를 20gp에 팝니다. 단검이 좋소\n")
  })

  it("translates an inventory listing (one `K name` line per item) line by line, keeping the key letters", () => {
    expect(composeVendorLine("aaaa0005", ["+", "B Dagger\nC Unknown\n"], deps)).toBe("가진 것:\nB 단검\nC Unknown\n")
  })

  it("drops a symbol whose value is empty (none), like construct", () => {
    expect(composeVendorLine("aaaa0004", ["$", ""], deps)).toBe(" 골드\n")
  })

  it("does not rescan substituted values and ignores unpaired trailing entries", () => {
    expect(composeVendorLine("aaaa0004", ["$", "$", "@"], deps)).toBe("$ 골드\n")
  })
})

describe("composeVendorLine details", () => {
  it("uses 로 (not 으로) after a ㄹ-final syllable or digit, 으로 after other final consonants, 로 after vowels", () => {
    const say = (value: string) => composeVendorLine("aaaa0006", ["@", value], { ...deps, nameId: () => undefined })
    expect(say("얼")).toBe("얼로 가라\n")
    expect(say("7")).toBe("7로 가라\n")
    expect(say("삼")).toBe("삼으로 가라\n")
    expect(say("3")).toBe("3으로 가라\n")
    expect(say("나")).toBe("나로 가라\n")
  })

  it("uses the FIRST pair for a duplicated symbol, like Boron construct", () => {
    expect(composeVendorLine("aaaa0004", ["$", "1", "$", "2"], deps)).toBe("1 골드\n")
  })

  it("silently drops an untranslated or unmapped template: null, no emit, no error (English original never leaves the engine)", () => {
    const emit = vi.fn()
    const onError = vi.fn()
    const handle = createVendorHandler({ ...deps, template: (hash) => (hash === "aaaa0009" ? "" : TEMPLATES[hash]) }, emit, onError)
    handle("aaaa0009", ["%", "Shaman"])
    handle("00000000", ["%", "Shaman"])
    expect(emit).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})

describe("createVendorHandler", () => {
  it("emits the composed line and swallows nothing silently for unmapped hashes", () => {
    const emit = vi.fn()
    const handle = createVendorHandler(deps, emit)
    handle("aaaa0001", ["%", "Shaman"])
    handle("deadbeef", ["%", "Shaman"])
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith("\n샤먼이 말한다:\n평안히 가시게!\n")
  })

  it("contains a throwing dependency so the wasm loop never unwinds", () => {
    const onError = vi.fn()
    const handle = createVendorHandler({ ...deps, template: () => { throw new Error("boom") } }, vi.fn(), onError)
    expect(() => handle("aaaa0001", [])).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
