import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { GENERATED_TALK_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { resolveDisplayText, resolveTalkTemplateId } from "../../src/i18n/localization.ts"

// Todo 22 (data side): the U4 talk template lines runTalkDialogue() /
// talkYNResponse() print (vendor/xu4/src/discourse_tlk.cpp) are open-source
// xu4 code literals, not original game data. They must be inventoried as
// `ui:discourse_tlk:<n>`, translated, and reachable from the exact format
// string the engine hands to screenMessage (the native side sends that
// literal; GENERATED_TALK_TEMPLATES maps it back to the semantic id).

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function makeTmpDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`
}

function extractWith(source: string, options: unknown): string[] {
  const script =
    "import { extractCppLiterals } from './scripts/lib/cpp-strings.mjs';" +
    "const [source, options] = JSON.parse(process.argv[1]);" +
    "process.stdout.write(JSON.stringify(extractCppLiterals(source, options).map((l) => l.text)))"
  const result = spawnSync("node", ["--input-type=module", "-e", script, JSON.stringify([source, options])], {
    cwd: projectRoot,
    encoding: "utf8"
  })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout) as string[]
}

interface UiEntry {
  sourceHash: string
  placeholders: string[]
  sourceFile?: string
  translation: string
  status: string
}

function uiEntries(dir = join(projectRoot, "locales/ko")): Record<string, UiEntry> {
  return (JSON.parse(readFileSync(join(dir, "ui.json"), "utf8")) as { entries: Record<string, UiEntry> }).entries
}

function talkEntries(entries: Record<string, UiEntry>): [string, UiEntry][] {
  return Object.entries(entries).filter(([key]) => key.startsWith("ui:discourse_tlk:"))
}

function edgeShape(text: string) {
  return { lead: /^\n*/.exec(text)![0].length, trail: /\n*$/.exec(text)![0].length, endsWithSpace: / $/.test(text) }
}

describe("cpp-strings: discourse_tlk call shapes", () => {
  it("captures the `message(...)` macro calls and joins adjacent literals only when asked", () => {
    const source = [
      'message("\\nYou meet %s\\n", DSTRING(DS_LOOK));',
      'message("%s says: Oh Thank thee! I shall never "',
      '        "forget thy kindness!\\n", DSTRING(DS_PRONOUN));',
      "message(reply);",
      'screenMessage("Yes or no!\\n");'
    ].join("\n")

    expect(extractWith(source, { extraCallNames: ["message"], joinAdjacent: true })).toEqual([
      "\nYou meet %s\n",
      "%s says: Oh Thank thee! I shall never forget thy kindness!\n",
      "Yes or no!\n"
    ])
  })

  it("keeps the legacy behavior for every other file (no `message(` calls, first literal only)", () => {
    const source = 'message("x\\n"); screenMessage("Key " "Reference\\n");'
    expect(extractWith(source, undefined)).toEqual(["Key "])
  })
})

describe("i18n:inventory: discourse_tlk.cpp talk templates", () => {
  it("inventories the U4 talk template lines as ui:discourse_tlk:<n> without any English text", () => {
    const publicDir = makeTmpDir("talk-templates-public-")
    const privateDir = makeTmpDir("talk-templates-private-")
    const result = spawnSync(
      "node",
      ["scripts/i18n-inventory.mjs", "--out-public", publicDir, "--out-private", privateDir],
      { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ULTIMA4_DATA: "" } }
    )
    expect(result.status, result.stderr).toBe(0)

    const entries = talkEntries(uiEntries(publicDir))
    const hashes = new Set(entries.map(([, entry]) => entry.sourceHash))
    expect(entries.length).toBeGreaterThanOrEqual(17)
    for (const literal of [
      "\nYou meet %s\n",
      "%s says: I am %s\n",
      "%s says: Oh Thank thee! I shall never forget thy kindness!\n",
      "Yes or no!\n",
      "\n%s\n\nYou say: "
    ]) {
      expect(hashes.has(sha256(literal)), literal).toBe(true)
    }
    const raw = readFileSync(join(publicDir, "ui.json"), "utf8")
    expect(raw).not.toContain("says: I am")
  })
})

describe("locales/ko/ui.json: talk template translations", () => {
  const entries = talkEntries(uiEntries())

  it("translates every talk template (ready, Korean, same %s count, same newline edges)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(17)
    const literalById = new Map(Object.entries(GENERATED_TALK_TEMPLATES).map(([literal, id]) => [id, literal]))
    for (const [id, entry] of entries) {
      expect(entry.status, id).toBe("ready")
      expect(entry.translation, id).toMatch(/\p{Script=Hangul}/u)
      const literal = literalById.get(id)
      expect(literal, id).toBeDefined()
      expect((entry.translation.match(/%s/g) ?? []).length, id).toBe((literal!.match(/%s/g) ?? []).length)
      expect(edgeShape(entry.translation), id).toEqual(edgeShape(literal!))
    }
  })
})

describe("GENERATED_TALK_TEMPLATES + resolveTalkTemplateId", () => {
  it("maps the exact screenMessage format string to its ui id, hash-consistent with ui.json", () => {
    const entries = uiEntries()
    const id = GENERATED_TALK_TEMPLATES["%s says: I am %s\n"]
    expect(id).toMatch(/^ui:discourse_tlk:\d+$/)
    for (const [literal, mappedId] of Object.entries(GENERATED_TALK_TEMPLATES)) {
      expect(entries[mappedId]?.sourceHash, mappedId).toBe(sha256(literal))
    }
  })

  it("resolves a known template literal to an id whose display text is Korean", () => {
    const id = resolveTalkTemplateId("\nYou meet %s\n")
    expect(id).toBeDefined()
    expect(resolveDisplayText(id!, "\nYou meet %s\n")).toMatch(/\p{Script=Hangul}/u)
  })

  it("returns undefined for a literal that is not a talk template", () => {
    expect(resolveTalkTemplateId("not a template %s\n")).toBeUndefined()
    expect(resolveTalkTemplateId("", {})).toBeUndefined()
  })
})
