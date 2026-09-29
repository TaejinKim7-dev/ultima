import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Todo 25: static checks on the Boron/C++ glue (no browser): the web-say
// cfunc is registered in every build, and vendors.b calls it before printing
// a template with substitutions.

const vendors = readFileSync("vendor/xu4/module/Ultima-IV/vendors.b", "utf8")
const script = readFileSync("vendor/xu4/src/script_boron.cpp", "utf8")

describe("web-say cfunc registration (script_boron.cpp)", () => {
  it("has a CFUNC, a pfFuncs entry and a pfFuncSpecs line at the same (last) position", () => {
    const funcs = script.match(/static const BoronCFunc pfFuncs\[\] = \{([^}]*)\}/)?.[1] ?? ""
    const names = funcs.split(",").map((row) => row.trim()).filter(Boolean)
    const specs = (script.match(/pfFuncSpecs\[\] =((?:\s*"[^"]*")+);/)?.[1] ?? "").match(/"([^"]*)"/g) ?? []
    expect(names.at(-1)).toBe("cf_webSay")
    expect(specs.at(-1)).toMatch(/^"web-say msg string! data block!/)
    expect(names.length).toBe(specs.length)
    expect(script).toMatch(/CFUNC\(cf_webSay\)/)
  })

  it("keeps the native build a no-op (all engine hooks are behind __EMSCRIPTEN__)", () => {
    const body = script.slice(script.indexOf("CFUNC(cf_webSay)"))
    expect(body.slice(0, body.indexOf("static const BoronCFunc"))).toMatch(/#ifdef __EMSCRIPTEN__[\s\S]*#endif/)
  })
})

describe("vendors.b web-say call sites", () => {
  it("=> announces the template and its evaluated variables before printing", () => {
    expect(vendors).toMatch(/=>: func \[msg data\] \[\s*web-say msg reduce data\s+>> construct msg data\s*\]/)
  })

  it("input-shop announces the trimmed template with shop-vars, then prints unchanged", () => {
    expect(vendors).toMatch(/web-say msg reduce shop-vars\s+>> construct msg shop-vars\s+input-choice choices/)
  })
})
