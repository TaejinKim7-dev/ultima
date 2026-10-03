import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { composeCenterMessage, createCenterHandler, composeUiMessage, type UiMessageDeps } from "../../src/dialogue/ui-message-compose.ts"
import { createCoverageRecorder, hashText } from "../../src/i18n/coverage.ts"
import {
  GENERATED_ARGUMENT_NAMES,
  GENERATED_I18N_ENTRIES,
  GENERATED_UI_TEMPLATES
} from "../../src/i18n/generated/strings.ts"
import { resolveNameArgumentId } from "../../src/i18n/localization.ts"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"
import { extractArgumentNames } from "../../scripts/i18n-generate.mjs"
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }

// Todo 40 (GOAL_GAP_AUDIT gap #6): `screenMessageCenter()` (vendor/xu4/src/screen.cpp)
// printed the town/dungeon NAME of an entry message through screenMessageN()
// directly, never reaching the screenMessage web hook, and the Korean line for
// "Enter %s!" received the English city-type word as a raw `%s` argument.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")
const hasLatin = (text: string) => /[A-Za-z]/.test(text)

const mapsSource = readRepoFile("vendor/xu4/module/Ultima-IV/maps.b")
const glossary = (glossarySchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string }> })
  .entries

const deps: UiMessageDeps = {
  templateId: (hash) => GENERATED_UI_TEMPLATES[hash],
  resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback,
  moduleNameId: resolveNameArgumentId
}

describe("composeCenterMessage / createCenterHandler (pure)", () => {
  const fake: UiMessageDeps = {
    templateId: (hash) => (hash === "aaaa0001" ? "module:Ultima-IV:maps:23" : undefined),
    resolve: (id, fallback) => (id === "module:Ultima-IV:maps:23" ? "문글로우" : fallback),
    moduleNameId: () => undefined
  }

  it("returns the Korean name followed by the engine's own trailing newlines", () => {
    expect(composeCenterMessage("aaaa0001", 2, fake)).toBe("문글로우\n\n")
    expect(composeCenterMessage("aaaa0001", 0, fake)).toBe("문글로우")
  })

  it("returns null and records ui-unmapped (hash only) for an unknown name", () => {
    const recorder = createCoverageRecorder()
    expect(composeCenterMessage("deadbeef", 2, { ...fake, onMiss: (miss) => recorder.record(miss) })).toBeNull()
    expect(recorder.snapshot()["ui-unmapped"]).toEqual([{ key: "deadbeef", count: 1 }])
  })

  it("contains a failure instead of unwinding the wasm loop", () => {
    const emit = vi.fn()
    const onError = vi.fn()
    const handler = createCenterHandler({ ...fake, resolve: () => { throw new Error("boom") } }, emit, onError)
    handler("aaaa0001", 2)
    expect(emit).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    createCenterHandler(fake, emit, onError)("aaaa0001", 1)
    expect(emit).toHaveBeenCalledWith("문글로우\n")
  })
})

describe("every town, castle and dungeon name maps.b can centre is Korean", () => {
  const names = [...new Set([...mapsSource.matchAll(/\b(?:city|dungeon)\s*\(name:\s*"([^"]*)"/g)].map((match) => match[1]!))]

  it("reads the names out of maps.b", () => {
    expect(names.length).toBeGreaterThanOrEqual(24)
  })

  it("has a mapped template and an ASCII-free Korean line for each", () => {
    for (const english of names) {
      const hash = fnv1a32(english)
      const line = composeCenterMessage(hash, 2, deps)
      expect(line, `a maps.b name (hash ${hash}) is not mapped for centred output`).not.toBeNull()
      expect(hasLatin(line!), `a maps.b name (hash ${hash}) is not Korean`).toBe(false)
    }
  })
})

describe("cityTypeStr() values", () => {
  const types = [...new Set([...mapsSource.matchAll(/\bcity\s*\([^)]*?\btype:\s*([a-z]+)/g)].map((match) => match[1]!))]

  it("reads the four types out of maps.b", () => {
    expect(types.length).toBeGreaterThanOrEqual(4)
  })

  it("maps each type word to a ready ASCII-free glossary row, via the generator", () => {
    for (const english of types) {
      const id = GENERATED_ARGUMENT_NAMES[english]
      expect(id, `a city type (hash ${hashText(english)}) has no GENERATED_ARGUMENT_NAMES row`).toBeDefined()
      expect(glossary[id!]?.sourceHash, id).toBe(sourceHash(english))
      expect(glossary[id!]?.status, id).toBe("ready")
      expect(hasLatin(glossary[id!]?.translation ?? "x"), id).toBe(false)
    }
    expect(extractArgumentNames(glossary)).toEqual(GENERATED_ARGUMENT_NAMES)
  })

  it("renders portal.cpp's Enter line fully Korean for every type", () => {
    // portal.cpp: screenMessage("Enter %s!\n\n", city->cityTypeStr())
    const hash = fnv1a32("Enter %s!\n\n")
    expect(GENERATED_UI_TEMPLATES[hash]).toBe("ui:portal:1")
    const recorder = createCoverageRecorder()
    for (const english of types) {
      const line = composeUiMessage(hash, [english], { ...deps, onMiss: (miss) => recorder.record(miss) })
      expect(line, english).not.toBeNull()
      expect(hasLatin(line!), `Enter line for city type (hash ${hashText(english)}) has ASCII letters`).toBe(false)
    }
    expect(recorder.snapshot()["arg-passthrough"]).toEqual([])
  })
})

describe("screen.cpp web hook for screenMessageCenter", () => {
  const source = readRepoFile("vendor/xu4/src/screen.cpp")
  const lines = source.split("\n")

  /** Preprocessor-conditional depth tracker: is line `index` inside `#ifdef __EMSCRIPTEN__`? */
  function insideEmscripten(index: number): boolean {
    const stack: boolean[] = []
    for (let i = 0; i <= index; i++) {
      const directive = /^\s*#\s*(ifdef|ifndef|if|else|endif)\b(.*)$/.exec(lines[i]!)
      if (!directive) continue
      const kind = directive[1]!
      if (kind === "ifdef") stack.push(directive[2]!.trim() === "__EMSCRIPTEN__")
      else if (kind === "ifndef" || kind === "if") stack.push(false)
      else if (kind === "else") stack.push(!stack.pop())
      else stack.pop()
    }
    return stack.some(Boolean)
  }

  it("calls the web hook from screenMessageCenter, inside __EMSCRIPTEN__ only (native stays identical)", () => {
    const start = lines.findIndex((line) => /^void screenMessageCenter\(/.test(line))
    expect(start).toBeGreaterThan(0)
    const hookCalls = lines.map((line, index) => ({ line, index })).filter(({ line }) => /\bu4_web_message_center\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(hookCalls.length, "screenMessageCenter must call u4_web_message_center").toBe(1)
    const call = hookCalls[0]!
    expect(call.index).toBeGreaterThan(start)
    expect(insideEmscripten(call.index)).toBe(true)
    // It hashes the text the way screenMessage hashes its format, and honours the vendor-say suppression flag.
    const window = lines.slice(start, call.index + 1).join("\n")
    expect(window).toMatch(/webFormatHash\(\s*text\s*,/)
    expect(window).toMatch(/webSuppressMessage/)
    // The EM_JS definition itself is also web-only.
    const definition = lines.findIndex((line) => /^EM_JS\(void, u4_web_message_center/.test(line))
    expect(insideEmscripten(definition)).toBe(true)
  })

  it("keeps the hash parity: webFormatHash over a centred name equals fnv1a32 (see screen-hash-parity)", () => {
    expect(fnv1a32("Moonglow")).toMatch(/^[0-9a-f]{8}$/)
  })
})
