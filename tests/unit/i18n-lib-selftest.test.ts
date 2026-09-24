import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const cliPath = "scripts/lib/selftest-cli.mjs"

function run(...args: string[]) {
  const result = spawnSync("node", [cliPath, ...args], { cwd: projectRoot, encoding: "utf8" })
  return result
}

function runJson(...args: string[]) {
  const result = run(...args)
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}

describe("tlk-codec: map:npcIndex:field key shape", () => {
  it("builds the exact three-part key shape required by the Todo 4 acceptance criteria", () => {
    const { key } = runJson("tlk-key", "BRITAIN", "3", "job")
    expect(key).toBe("BRITAIN:3:job")
    expect(key.split(":")).toEqual(["BRITAIN", "3", "job"])
  })

  it("round-trips a synthetic 288-byte record back to its original field text", () => {
    const { decoded, keys, unused } = runJson(
      "tlk-roundtrip",
      "BRITAIN",
      "5",
      "name=Godfrey",
      "pronoun=he",
      "look=a tall man.",
      "job=I am the guard.",
      "topic1=guard"
    )
    expect(unused).toBe(false)
    expect(decoded.name).toBe("Godfrey")
    expect(decoded.pronoun).toBe("he")
    expect(decoded.look).toBe("a tall man.")
    expect(decoded.job).toBe("I am the guard.")
    expect(decoded.topic1).toBe("guard")
    expect(decoded.health).toBe("")
    expect(keys).toContain("BRITAIN:5:name")
    expect(keys).toContain("BRITAIN:5:topic1")
  })

  it("flags a record with an empty name as unused (no translatable entries)", () => {
    const { unused } = runJson("tlk-roundtrip", "BRITAIN", "9")
    expect(unused).toBe(true)
  })
})

describe("binary-strings: resource:table:index key shape", () => {
  it("builds the exact three-part key shape required by the Todo 4 acceptance criteria", () => {
    const { key } = runJson("binary-key", "title.exe", "introQuestions", "5")
    expect(key).toBe("title.exe:introQuestions:5")
    expect(key.split(":")).toEqual(["title.exe", "introQuestions", "5"])
  })

  it("round-trips synthetic sequential NUL-terminated strings", () => {
    const { decoded, keys } = runJson(
      "binary-roundtrip",
      "avatar.exe",
      "shrineAdvice",
      "Seek thee the Codex",
      "Meditate upon Truth",
      "Beware the abyss"
    )
    expect(decoded).toEqual(["Seek thee the Codex", "Meditate upon Truth", "Beware the abyss"])
    expect(keys).toEqual([
      "avatar.exe:shrineAdvice:0",
      "avatar.exe:shrineAdvice:1",
      "avatar.exe:shrineAdvice:2"
    ])
  })
})

describe("placeholder signature matching", () => {
  it("accepts a translation whose placeholders are reordered but match in count and kind", () => {
    const { equal } = runJson("placeholder-match", "%s has %d gold", "%d 골드를 %s 가 가지고 있다")
    expect(equal).toBe(true)
  })

  it("rejects a translation missing a placeholder the source has", () => {
    const { equal } = runJson("placeholder-match", "%s has %d gold", "%s 는 금을 가지고 있다")
    expect(equal).toBe(false)
  })

  it("rejects a translation with an extra placeholder the source does not have", () => {
    const { equal } = runJson("placeholder-match", "Torch: %d", "%s 횃불: %d")
    expect(equal).toBe(false)
  })
})

describe("status-line display width heuristic", () => {
  it("counts plain ASCII at one column per character", () => {
    const { width } = runJson("display-width", "Torch: 5")
    expect(width).toBe(8)
  })

  it("counts Hangul syllables at two columns per character", () => {
    const { width, budget } = runJson("display-width", "횃불: 5")
    // 횃 불 : space 5 -> 2+2+1+1+1 = 7
    expect(width).toBe(7)
    expect(budget).toBe(15)
  })
})

describe("alias collision detection", () => {
  it("reports no collisions for distinct aliases with distinct canonicals", () => {
    const { collisions } = runJson("alias-collisions", "a1", "예", "yes", "a2", "아니오", "no")
    expect(collisions).toEqual([])
  })

  it("flags two entries that register the same normalized alias text", () => {
    const { collisions } = runJson("alias-collisions", "a1", "안녕", "hail", "a2", "안녕", "bye")
    expect(collisions.some((c: { type: string }) => c.type === "duplicate-alias")).toBe(true)
  })

  it("flags an alias whose text shadows a different entry's canonical keyword", () => {
    const { collisions } = runJson("alias-collisions", "a1", "guard", "hail", "a2", "경비병", "guard")
    expect(collisions.some((c: { type: string }) => c.type === "alias-shadows-canonical")).toBe(true)
  })

  it("does not treat two not-yet-translated (empty alias) scaffold entries as a collision", () => {
    const { collisions } = runJson("alias-collisions", "a1", "", "yes", "a2", "", "no")
    expect(collisions).toEqual([])
  })
})

describe("Boron module literal extraction", () => {
  it("extracts a quoted string, unescapes caret sequences, and classifies display text", () => {
    const source = 'weapons: [\n  "Sword"  "A fine blade^/for battle" 64\n]'
    const { literals } = runJson("boron-literals", source)
    const texts = literals.map((literal: { text: string }) => literal.text)
    expect(texts).toContain("Sword")
    expect(texts).toContain("A fine blade\nfor battle")
    const sword = literals.find((literal: { text: string }) => literal.text === "Sword")
    expect(sword.kind).toBe("identifier")
    const blade = literals.find((literal: { text: string }) => literal.text.startsWith("A fine"))
    expect(blade.kind).toBe("display")
  })

  it("extracts a braced string with a balanced nested brace pair", () => {
    const source = "about: {{\n    Ultima IV with original graphics.\n}}"
    const { literals } = runJson("boron-literals", source)
    expect(literals).toHaveLength(1)
    expect(literals[0].form).toBe("braced")
    expect(literals[0].text).toContain("Ultima IV with original graphics.")
  })

  it("ignores line comments and block comments", () => {
    const source = '; "not a real string"\n/* "also not real" */\n"real string"'
    const { literals } = runJson("boron-literals", source)
    expect(literals).toHaveLength(1)
    expect(literals[0].text).toBe("real string")
  })
})

describe("C++ UI literal extraction", () => {
  it("extracts the literal argument of screenMessage calls", () => {
    const source = 'void f() { screenMessage("Pass\\n"); screenMessage(dynamicMsg); }'
    const { literals } = runJson("cpp-literals", source)
    expect(literals.map((literal: { text: string }) => literal.text)).toEqual(["Pass\n"])
  })

  it("extracts Menu::add label literals, including ones wrapped in a MenuItem constructor", () => {
    const source =
      'confMenu.add(MI_CONF_VIDEO, "\\010 Video Options", 2, 2, 2);\n' +
      'videoMenu.add(MI_VIDEO_04, new IntMenuItem("Scale                x%d", 2, 4, 0, ptr, 1, 5, 1));'
    const { literals } = runJson("cpp-literals", source)
    const texts = literals.map((literal: { text: string }) => literal.text)
    expect(texts).toContain(" Video Options")
    expect(texts).toContain("Scale                x%d")
  })
})
