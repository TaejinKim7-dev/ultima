import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { composeUiMessage, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder, hashText } from "../../src/i18n/coverage.ts"
import { GENERATED_ARGUMENT_NAMES, GENERATED_I18N_ENTRIES, GENERATED_UI_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { resolveNameArgumentId } from "../../src/i18n/localization.ts"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { extractArgumentNames } from "../../scripts/i18n-generate.mjs"
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }

// Todo 40 (gap #6, shrine branch): portal.cpp's Map::SHRINE case prints
// screenMessage("Enter the %s!\n\n", destination->getName()), and
// Shrine::getName() (shrine.cpp) builds a prefix literal plus getVirtueName().
// That composed string is in no module/virtue-name table, so it reached
// ui:portal:2 as a raw English `%s`. (Todo 32's test calls getName() cheat-menu-only;
// portal.cpp contradicts that.)

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")
const hasLatin = (text: string) => /[A-Za-z]/.test(text)

const glossary = (glossarySchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string }> })
  .entries
const deps: UiMessageDeps = {
  templateId: (hash) => GENERATED_UI_TEMPLATES[hash],
  resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
  moduleNameId: resolveNameArgumentId
}

const shrineSource = readRepoFile("vendor/xu4/src/shrine.cpp")
const namesSource = readRepoFile("vendor/xu4/src/names.cpp")
const prefix = /str = "([^"]*)";\s*\n\s*str \+= getVirtueName\(virtue\)/.exec(shrineSource)?.[1] ?? ""
const virtues = [...(/virtueNames\[\] = \{([\s\S]*?)\};/.exec(namesSource)?.[1] ?? "").matchAll(/"([^"]*)"/g)].map((match) => match[1]!)
const composed = virtues.map((name) => prefix + name)

describe("shrine entry: Enter the %s! receives Shrine::getName()", () => {
  it("reads the prefix and the eight virtue names out of the engine sources", () => {
    expect(prefix).not.toBe("")
    expect(virtues).toHaveLength(8)
  })

  it("maps every composed shrine name to a ready ASCII-free glossary row, made by the generator", () => {
    for (const english of composed) {
      const id = GENERATED_ARGUMENT_NAMES[english]
      expect(id, `a shrine name (hash ${hashText(english)}) has no GENERATED_ARGUMENT_NAMES row`).toBeDefined()
      expect(glossary[id!]?.sourceHash, id).toBe(sourceHash(english))
      expect(glossary[id!]?.status, id).toBe("ready")
      expect(hasLatin(glossary[id!]?.translation ?? "x"), id).toBe(false)
    }
    expect(extractArgumentNames(glossary)).toEqual(GENERATED_ARGUMENT_NAMES)
  })

  it("renders ui:portal:2 fully Korean for all eight shrines with no raw argument", () => {
    const hash = fnv1a32("Enter the %s!\n\n")
    expect(GENERATED_UI_TEMPLATES[hash]).toBe("ui:portal:2")
    const recorder = createCoverageRecorder()
    for (const english of composed) {
      const line = composeUiMessage(hash, [english], { ...deps, onMiss: (miss) => recorder.record(miss) })
      expect(line, "shrine entry line").not.toBeNull()
      expect(hasLatin(line!), `shrine entry line (hash ${hashText(english)}) has ASCII letters`).toBe(false)
    }
    expect(recorder.snapshot()["arg-passthrough"]).toEqual([])
  })
})
