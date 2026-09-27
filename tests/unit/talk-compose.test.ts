import { describe, expect, it } from "vitest"
import { MISSING_TLK_TRANSLATION, composeTalkInput, composeTalkLine, type TalkComposeDeps } from "../../src/dialogue/talk-compose.ts"

// Todo 22: vendor/xu4/src/discourse_tlk.cpp's web build sends each talk
// line as (format literal, args) where every TLK-backed argument is an
// id ("@MAP:npcIndex:field") and never the original English TLK text.
// This pure composer turns that into the Korean panel line.

const TEMPLATES: Record<string, string> = {
  "\nYou meet %s\n": "ui:discourse_tlk:0",
  "%s says: I am %s\n": "ui:discourse_tlk:6",
  "Thou art not %s enough for me to join thee.\n": "ui:discourse_tlk:12"
}
const TABLE: Record<string, string> = {
  "ui:discourse_tlk:0": "\n%s을(를) 만났다\n",
  "ui:discourse_tlk:6": "%s 말하길: 나는 %s이오\n",
  "MOONGLOW:12:look": "키 큰 마법사.",
  "MOONGLOW:12:pronoun": "그",
  "MOONGLOW:12:name": "칼라브리니",
  "MOONGLOW:12:health": "좋다네."
}
const deps: TalkComposeDeps = {
  templateId: (literal) => TEMPLATES[literal],
  resolve: (id, fallback) => TABLE[id] ?? fallback
}

describe("composeTalkLine", () => {
  it("translates a known template and its TLK-id arguments", () => {
    expect(composeTalkLine("\nYou meet %s\n", ["@MOONGLOW:12:look"], deps)).toBe("\n키 큰 마법사.을(를) 만났다\n")
  })

  it("keeps argument order for multi-argument templates", () => {
    expect(composeTalkLine("%s says: I am %s\n", ["@MOONGLOW:12:pronoun", "@MOONGLOW:12:name"], deps)).toBe(
      "그 말하길: 나는 칼라브리니이오\n"
    )
  })

  it("renders a bare TLK reply sent as the %s format", () => {
    expect(composeTalkLine("%s", ["@MOONGLOW:12:health"], deps)).toBe("좋다네.")
  })

  it("marks a TLK id with no Korean translation instead of showing anything English", () => {
    const line = composeTalkLine("%s", ["@MOONGLOW:12:job"], deps)
    expect(line).toBe(MISSING_TLK_TRANSLATION)
    expect(line).not.toContain("MOONGLOW")
  })

  it("falls back to the English code literal for an untranslated template, still substituting arguments", () => {
    expect(
      composeTalkLine("Thou art not %s enough for me to join thee.\n", ["experienced"], {
        ...deps,
        resolve: (id, fallback) => (id.startsWith("MOONGLOW") ? (TABLE[id] ?? fallback) : fallback)
      })
    ).toBe("Thou art not experienced enough for me to join thee.\n")
  })

  it("passes plain (non-TLK) arguments through unchanged", () => {
    expect(composeTalkLine("%s says: I am %s\n", ["@MOONGLOW:12:pronoun", "Avatar"], deps)).toBe("그 말하길: 나는 Avatar이오\n")
  })

  it("shows an unknown literal with no arguments as-is (e.g. a bare line break)", () => {
    expect(composeTalkLine("\n", [], deps)).toBe("\n")
  })

  it("treats %% as a literal percent and a missing argument as empty", () => {
    expect(composeTalkLine("100%% %s", [], deps)).toBe("100% ")
  })
})

describe("composeTalkInput", () => {
  it("echoes the player's typed keyword as its own line", () => {
    expect(composeTalkInput("health")).toBe("> health\n")
  })
})
