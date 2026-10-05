import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
const screen = read("vendor/xu4/src/screen.cpp")

function hookBody(): string {
  const match = /EM_JS\(void, u4_web_screen_wind, \(int mode, int direction\), \{([\s\S]*?)\n\}\);/.exec(screen)
  expect(match, "wind EM_JS exists").not.toBeNull()
  return match?.[1] ?? ""
}

function webOnlyAt(offset: number): boolean {
  const stack: boolean[] = []
  for (const line of screen.slice(0, offset).split("\n")) {
    const directive = /^\s*#\s*(ifdef|ifndef|if|else|endif)\b(.*)$/.exec(line)
    if (directive === null) continue
    switch (directive[1]) {
      case "ifdef": stack.push(directive[2]?.trim() === "__EMSCRIPTEN__"); break
      case "ifndef": case "if": stack.push(false); break
      case "else": stack.push(!stack.pop()); break
      case "endif": stack.pop(); break
    }
  }
  return stack.includes(true)
}

describe("native wind signal boundary", () => {
  it("matches the direction enum used by Korean cardinal mapping", () => {
    const source = read("vendor/xu4/src/direction.h")
    const names = /enum Direction\s*\{([^}]+)\}/.exec(source)?.[1]?.split(",").map((name) => name.trim())
    expect(names).toEqual(["DIR_NONE", "DIR_WEST", "DIR_NORTH", "DIR_EAST", "DIR_SOUTH", "DIR_ADVANCE", "DIR_RETREAT"])
  })

  it.each([{}, { u4Screen: {} }, { u4Screen: { wind: 1 } }])("ignores absent or incompatible receivers", (module) => {
    const body = hookBody()
    expect(() => runInNewContext(body, { Module: module, mode: 1, direction: 2 })).not.toThrow()
  })

  it("forwards mode and direction unchanged", () => {
    const seen: number[][] = []
    const module = { u4Screen: { wind: (mode: number, direction: number) => seen.push([mode, direction]) } }
    runInNewContext(hookBody(), { Module: module, mode: 2, direction: 4 })
    expect(seen).toEqual([[2, 4]])
  })

  it("does not unwind the native game loop if the display receiver throws", () => {
    const module = { u4Screen: { wind: () => { throw new Error("display failure") } } }
    expect(() => runInNewContext(hookBody(), { Module: module, mode: 1, direction: 1 })).not.toThrow()
  })

  it("keeps the definition and every wind signal call Emscripten-only", () => {
    const matches = [...screen.matchAll(/EM_JS\(void, u4_web_screen_wind|\bu4_web_screen_wind\(/g)]
    expect(matches).toHaveLength(4)
    for (const match of matches) expect(webOnlyAt(match.index)).toBe(true)
  })

  it("selects native dungeon orientation, wind direction, and clears other contexts", () => {
    const body = /void screenUpdateWind\(\) \{([\s\S]*?)\n\}/.exec(screen)?.[1] ?? ""
    expect(body).toMatch(/context == CTX_DUNGEON[\s\S]*?u4_web_screen_wind\(2, c->saveGame->orientation\)/)
    expect(body).toMatch(/else if \(\(c->location->context & CTX_NON_COMBAT\) == c->location->context\)[\s\S]*?u4_web_screen_wind\(1, c->windDirection\)/)
    expect(body).toMatch(/else\s*\{\s*u4_web_screen_wind\(0, DIR_NONE\)/)
  })
})
