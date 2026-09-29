import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { GENERATED_INTRO_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { resolveDisplayText, resolveIntroTemplateId } from "../../src/i18n/localization.ts"

// Todo 26 (data side): the intro's own code literals -- main menu, name/sex
// prompts, the gypsy card-scene glue lines, the About box -- are drawn with
// TextView::textAt/textAtKey/textAtFmt (vendor/xu4/src/intro.cpp), which the
// legacy extractor never matched. They are open-source xu4 strings (not
// original game data), so intro.cpp opts in to that call shape; the 56
// existing `ui:intro:*` ids (Configure menu items) must not move.

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

function introEntries(entries: Record<string, UiEntry>): [string, UiEntry][] {
  return Object.entries(entries)
    .filter(([key]) => key.startsWith("ui:intro:"))
    .sort(([a], [b]) => Number(a.split(":")[2]) - Number(b.split(":")[2]))
}

describe("cpp-strings: TextView textAt call shapes (opt-in)", () => {
  const source = [
    'menuArea.textAt(19 - len / 2, 5, xu4.errorMessage);',
    'menuArea.textAt(1,  1, "In another world, in a time to come.");',
    'menuArea.textAtKey(10, 6, "Journey Onward", 0);',
    'questionArea.textAtFmt(virtue1.size() + 4, 2, " %s.  She says",',
    '                       gypsyText[questionTree[i2] + 4].c_str());',
    'confMenu.add(MI_CONF_VIDEO, "\\010 Video Options", 2, 2, 2);'
  ].join("\n")

  it("captures the first literal after the x/y arguments of textAt/textAtKey/textAtFmt, in file order", () => {
    expect(extractWith(source, { textAtCalls: true })).toEqual([
      "In another world, in a time to come.",
      "Journey Onward",
      " %s.  She says",
      "\u0008 Video Options"
    ])
  })

  it("keeps the legacy behavior when the option is off", () => {
    expect(extractWith(source, undefined)).toEqual(["\u0008 Video Options"])
  })
})

describe("i18n:inventory: intro.cpp", () => {
  it("adds the intro's textAt literals after the existing Configure-menu ids, leaving ui:intro:0..55 unchanged", () => {
    const publicDir = makeTmpDir("intro-templates-public-")
    const privateDir = makeTmpDir("intro-templates-private-")
    const result = spawnSync(
      "node",
      ["scripts/i18n-inventory.mjs", "--out-public", publicDir, "--out-private", privateDir],
      { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ULTIMA4_DATA: "" } }
    )
    expect(result.status, result.stderr).toBe(0)

    const committed = uiEntries()
    const fresh = introEntries(uiEntries(publicDir))
    for (const [id, entry] of fresh) {
      if (Number(id.split(":")[2]) <= 55) {
        expect(entry.sourceHash, id).toBe(committed[id]?.sourceHash)
      }
    }
    const hashes = new Set(fresh.map(([, entry]) => entry.sourceHash))
    for (const literal of [
      "Journey Onward",
      "Initiate New Game",
      "By what name shalt thou be known",
      "Art thou Male or Female?",
      "%s and",
      " %s.  She says",
      '"Consider this:"'
    ]) {
      expect(hashes.has(sha256(literal)), literal).toBe(true)
    }
  })
})

describe("locales/ko/ui.json: intro translations", () => {
  it("translates every ui:intro entry (ready, Korean, same placeholders)", () => {
    const entries = introEntries(uiEntries())
    expect(entries.length).toBeGreaterThan(56)
    for (const [id, entry] of entries) {
      expect(entry.status, id).toBe("ready")
      expect(entry.translation, id).toMatch(/\p{Script=Hangul}|^[\s\x00-\x1fA-Za-z0-9%().:,'"-]*$/u)
      expect((entry.translation.match(/%[-0-9]*[sd]/g) ?? []).length, id).toBe(entry.placeholders.length)
    }
  })
})

describe("GENERATED_INTRO_TEMPLATES + resolveIntroTemplateId", () => {
  it("maps each intro.cpp literal to its ui:intro id, hash-consistent with ui.json", () => {
    const entries = uiEntries()
    expect(GENERATED_INTRO_TEMPLATES["Journey Onward"]).toMatch(/^ui:intro:\d+$/)
    expect(GENERATED_INTRO_TEMPLATES["Debug Mode (Cheats)        %s"]).toMatch(/^ui:intro:\d+$/)
    for (const [literal, id] of Object.entries(GENERATED_INTRO_TEMPLATES)) {
      expect(entries[id]?.sourceHash, id).toBe(sha256(literal))
    }
  })

  it("resolves a known literal to Korean display text and misses unknown ones", () => {
    const id = resolveIntroTemplateId("Journey Onward")
    expect(id).toBeDefined()
    expect(resolveDisplayText(id!, "Journey Onward")).toMatch(/\p{Script=Hangul}/u)
    expect(resolveIntroTemplateId("Some literal xu4 never draws")).toBeUndefined()
    expect(resolveIntroTemplateId("XU4 Configuration:")).toMatch(/^ui:intro:\d+$/)
  })
})
