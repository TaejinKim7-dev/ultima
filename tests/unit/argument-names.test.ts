import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composeTalkLine, type TalkComposeDeps } from "../../src/dialogue/talk-compose.ts"
import { composeUiMessage, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder } from "../../src/i18n/coverage.ts"
import {
  GENERATED_ARGUMENT_NAMES,
  GENERATED_I18N_ENTRIES,
  GENERATED_TALK_TEMPLATES,
  GENERATED_UI_TEMPLATES
} from "../../src/i18n/generated/strings.ts"
import { resolveArgumentNameId, resolveNameArgumentId } from "../../src/i18n/localization.ts"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { extractArgumentNames, generateI18nTables } from "../../scripts/i18n-generate.mjs"
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }

// Todo 39 (GOAL_GAP_AUDIT gaps #3 and #7).
//
// Gap #3: vendor/xu4/src/discourse_tlk.cpp's "join" refusal prints
// getVirtueAdjective(virt) -- or the literal "experienced" -- as the `%s` of a
// Korean template. The talk channel passed that argument through raw. The
// English words are xu4's own open-source literals (names.cpp / discourse_tlk.cpp),
// read out of the vendored sources at runtime here so no English is restated.
//
// Gap #7: creature names ("Rat", "Mage", ...) are config.b module names. The
// audit claimed they were missing from the name map; the real tables are
// exercised here for every creature and every combat format that prints one.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

const namesSource = readRepoFile("vendor/xu4/src/names.cpp")
const talkSource = readRepoFile("vendor/xu4/src/discourse_tlk.cpp")
const configSource = readRepoFile("vendor/xu4/module/Ultima-IV/config.b")

const ADJECTIVES = [...(/virtueAdjectives\[\] = \{([\s\S]*?)\};/.exec(namesSource)?.[1] ?? "").matchAll(/"([^"]*)"/g)].map(
  (match) => match[1]!
)
const EXPERIENCED = /getVirtueAdjective\(virt\) : "([^"]*)"/.exec(talkSource)?.[1] ?? ""

const glossary = (glossarySchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string }> })
  .entries

const hasLatin = (text: string) => /[A-Za-z]/.test(text)

describe("gap #3: virtue adjectives", () => {
  it("reads eight adjectives and the join-refusal fallback out of the engine sources", () => {
    expect(ADJECTIVES).toHaveLength(8)
    expect(EXPERIENCED).not.toBe("")
  })

  it("maps every one to a ready glossary row whose sourceHash is the English word's", () => {
    for (const english of [...ADJECTIVES, EXPERIENCED]) {
      const id = GENERATED_ARGUMENT_NAMES[english]
      expect(id, `an adjective has no GENERATED_ARGUMENT_NAMES row (hash ${sourceHash(english).slice(7, 15)})`).toBeDefined()
      const row = glossary[id!]
      expect(row, `${id} missing from locales/ko/glossary.json`).toBeDefined()
      expect(row!.sourceHash, id).toBe(sourceHash(english))
      expect(row!.status, id).toBe("ready")
      expect(hasLatin(row!.translation), `${id} translation has ASCII letters`).toBe(false)
      expect(GENERATED_I18N_ENTRIES[id!]?.translation, id).toBe(row!.translation)
    }
  })

  it("is produced by the generator (extractArgumentNames), not hand-edited", () => {
    const generated = generateI18nTables(join(projectRoot, "locales/ko")).argumentNames
    expect(generated).toEqual(GENERATED_ARGUMENT_NAMES)
    expect(extractArgumentNames(glossary)).toEqual(GENERATED_ARGUMENT_NAMES)
  })

  it("drops a row whose glossary sourceHash drifted instead of mis-mapping it", () => {
    const first = ADJECTIVES[0]!
    const drifted = extractArgumentNames(
      Object.fromEntries(
        Object.entries(glossary).map(([id, row]) => [id, id === GENERATED_ARGUMENT_NAMES[first] ? { ...row, sourceHash: sourceHash("x") } : row])
      )
    )
    expect(drifted[first]).toBeUndefined()
    expect(drifted[ADJECTIVES[1]!]).toBeDefined()
  })

  it("keeps the two lookups separate: a scoped table, with the module names still winning", () => {
    expect(resolveArgumentNameId(ADJECTIVES[0]!)).toBe(GENERATED_ARGUMENT_NAMES[ADJECTIVES[0]!])
    expect(resolveArgumentNameId("not-a-name")).toBeUndefined()
    expect(resolveNameArgumentId(ADJECTIVES[0]!)).toBe(GENERATED_ARGUMENT_NAMES[ADJECTIVES[0]!])
  })

  it("renders the join-refusal talk line fully Korean for every adjective and the fallback", () => {
    const literal = Object.keys(GENERATED_TALK_TEMPLATES).find((key) => GENERATED_TALK_TEMPLATES[key] === "ui:discourse_tlk:14")
    expect(literal, "ui:discourse_tlk:14 is the join-refusal template").toBeDefined()
    expect(literal).toContain("%s")
    const recorder = createCoverageRecorder()
    const deps: TalkComposeDeps = {
      templateId: (text) => GENERATED_TALK_TEMPLATES[text],
      resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
      nameId: resolveNameArgumentId,
      onMiss: (miss) => recorder.record(miss)
    }
    for (const english of [...ADJECTIVES, EXPERIENCED]) {
      const line = composeTalkLine(literal!, [english], deps)
      expect(hasLatin(line), `a join line still has ASCII letters (adjective hash ${fnv1a32(english)})`).toBe(false)
      expect(/\p{Script=Hangul}/u.test(line)).toBe(true)
    }
    expect(recorder.snapshot()["arg-passthrough"], "no argument passed through raw").toEqual([])
  })

  it("records an unmapped non-TLK talk argument as arg-passthrough (hash only)", () => {
    const recorder = createCoverageRecorder()
    composeTalkLine(
      "%s says: I am %s\n",
      ["@MOONGLOW:12:pronoun", "Avatar"],
      {
        templateId: () => "ui:discourse_tlk:6",
        resolve: (id) => (id.startsWith("MOONGLOW") ? "그" : "%s 말하길: 나는 %s이오\n"),
        nameId: () => undefined,
        onMiss: (miss) => recorder.record(miss)
      }
    )
    expect(recorder.snapshot()["arg-passthrough"]).toEqual([{ key: `ui:discourse_tlk:6|1|${fnv1a32("Avatar")}`, count: 1 }])
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(/Avatar/)
  })
})

describe("gap #7: creature names in combat lines", () => {
  const creatureNames = (() => {
    const section = /\ncreatures: \[([\s\S]*?)\n\]/.exec(configSource)?.[1] ?? ""
    return [...new Set([...section.matchAll(/name: "([^"]*)"/g)].map((match) => match[1]!))]
  })()
  const uiDeps: UiMessageDeps = {
    templateId: (hash) => GENERATED_UI_TEMPLATES[hash],
    resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
    moduleNameId: resolveNameArgumentId
  }
  // Formats from vendor/xu4/src/{combat,game}.cpp that print a creature name as the first %s.
  const CREATURE_FORMATS = ["\nAttacked by %s\n", "\n%s Hit!\n", "%s Destroyed!\n"]

  it("covers every creature name in config.b", () => {
    expect(creatureNames.length).toBeGreaterThan(40)
    expect(creatureNames).toContain(/name: "(Rat)"/.exec(configSource)?.[1])
  })

  it("maps every creature name to a ready, ASCII-free Korean row", () => {
    for (const english of creatureNames) {
      const id = resolveNameArgumentId(english)
      expect(id, `creature (hash ${fnv1a32(english)}) is not in the name map`).toBeDefined()
      const translation = GENERATED_I18N_ENTRIES[id!]?.translation ?? ""
      expect(translation.trim() !== "", `${id} has no ready translation`).toBe(true)
      expect(hasLatin(translation), `${id} translation has ASCII letters`).toBe(false)
    }
  })

  it("composes each creature-bearing combat line fully Korean for every creature", () => {
    for (const format of CREATURE_FORMATS) {
      const hash = fnv1a32(format)
      expect(GENERATED_UI_TEMPLATES[hash], `format hash ${hash} is not mapped`).toBeDefined()
      for (const english of creatureNames) {
        const line = composeUiMessage(hash, [english], uiDeps)
        expect(line, `${hash}/${fnv1a32(english)}`).not.toBeNull()
        expect(hasLatin(line!), `${hash}/${fnv1a32(english)} has ASCII letters`).toBe(false)
      }
    }
  })
})
