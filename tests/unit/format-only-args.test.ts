import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composeUiMessage, FORMAT_ONLY_HASHES, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder, hashText } from "../../src/i18n/coverage.ts"
import { GENERATED_ARGUMENT_NAMES, GENERATED_I18N_ENTRIES } from "../../src/i18n/generated/strings.ts"
import { resolveNameArgumentId } from "../../src/i18n/localization.ts"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { extractArgumentNames } from "../../scripts/i18n-generate.mjs"
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }

// Todo 45 (b): format-only templates ("%s\n", "%s") carry their text in the
// argument, so a hash lookup of the format can never translate them. The
// player-visible ones are the movement/aim echo (getDirectionName) and the
// weapon/armour name a ready-weapon command echoes. They are translated by
// the ARGUMENT, through the same name tables the other %s templates use.
// English words are read out of the vendored sources, never restated here.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const namesSource = readFileSync(join(projectRoot, "vendor/xu4/src/names.cpp"), "utf8")
const configSource = readFileSync(join(projectRoot, "vendor/xu4/module/Ultima-IV/config.b"), "utf8")
const DIRECTIONS = [...(/directionNames\[\] = \{([\s\S]*?)\};/.exec(namesSource)?.[1] ?? "").matchAll(/"([^"]*)"/g)].map(
  (match) => match[1]!
)
const glossary = (glossarySchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string }> })
  .entries
const hasLatin = (text: string) => /[A-Za-z]/.test(text)

const deps: UiMessageDeps = {
  templateId: () => undefined,
  resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
  moduleNameId: resolveNameArgumentId
}

describe("direction names (names.cpp getDirectionName)", () => {
  it("reads the four directions out of the engine source", () => {
    expect(DIRECTIONS).toHaveLength(4)
  })

  it("maps each to a ready, ASCII-free glossary row through the generator", () => {
    for (const english of DIRECTIONS) {
      const id = GENERATED_ARGUMENT_NAMES[english]
      expect(id, `a direction (hash ${hashText(english)}) has no GENERATED_ARGUMENT_NAMES row`).toBeDefined()
      const row = glossary[id!]
      expect(row, `${id} missing from locales/ko/glossary.json`).toBeDefined()
      expect(row!.sourceHash).toBe(sourceHash(english))
      expect(row!.status).toBe("ready")
      expect(hasLatin(row!.translation)).toBe(false)
      expect(extractArgumentNames(glossary)[english]).toBe(id)
    }
  })
})

describe("composeUiMessage with a format-only template", () => {
  it("recognizes exactly the text-free formats by hash", () => {
    expect(FORMAT_ONLY_HASHES).toEqual({ [hashText("%s\n")]: "\n", [hashText("%s")]: "" })
  })

  it("translates the argument of \"%s\\n\" and keeps the newline", () => {
    for (const english of DIRECTIONS) {
      const line = composeUiMessage(hashText("%s\n"), [english], deps)
      expect(line, `direction hash ${hashText(english)}`).not.toBeNull()
      expect(line!.endsWith("\n")).toBe(true)
      expect(hasLatin(line!)).toBe(false)
      expect(/\p{Script=Hangul}/u.test(line!)).toBe(true)
    }
  })

  it("translates a weapon name the same way (config.b module names)", () => {
    const weapon = /weapons: \[[^"]*"[^"]*"\s+"([^"]*)"/.exec(configSource)?.[1] ?? ""
    expect(weapon).not.toBe("")
    const line = composeUiMessage(hashText("%s\n"), [weapon], deps)
    expect(line).not.toBeNull()
    expect(hasLatin(line!)).toBe(false)
  })

  it("adds no newline for the bare \"%s\" format", () => {
    expect(composeUiMessage(hashText("%s"), [DIRECTIONS[0]!], deps)!.endsWith("\n")).toBe(false)
  })

  it("never shows an argument it cannot translate and still records the hash as unmapped", () => {
    const recorder = createCoverageRecorder()
    const line = composeUiMessage(hashText("%s\n"), ["Zzyzx Player"], { ...deps, onMiss: (miss) => recorder.record(miss) })
    expect(line).toBeNull()
    expect(recorder.snapshot()["ui-unmapped"]).toEqual([{ key: hashText("%s\n"), count: 1 }])
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(/Zzyzx/)
  })
})
