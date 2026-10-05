import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { composeTalkLine, MISSING_TLK_TRANSLATION, reflowSoftBreaks, type TalkComposeDeps } from "../../src/dialogue/talk-compose.ts"
import { GENERATED_I18N_ENTRIES, GENERATED_TALK_TEMPLATES } from "../../src/i18n/generated/strings.ts"

// Todo 24 (data side): Lord British / Hawkwind (vendor/xu4/src/
// discourse_castle.cpp) and the Codex / endgame (vendor/xu4/src/codex.cpp)
// print open-source xu4 code literals around the original AVATAR.EXE text.
// The AVATAR.EXE text itself is already inventoried in binary.json and is
// only ever sent by id; these tests cover the code literals, which the
// web build sends verbatim as talk-template formats.

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
  translation: string
  status: string
}

function uiEntries(dir = join(projectRoot, "locales/ko")): Record<string, UiEntry> {
  return (JSON.parse(readFileSync(join(dir, "ui.json"), "utf8")) as { entries: Record<string, UiEntry> }).entries
}

function castleCodexEntries(entries: Record<string, UiEntry>): [string, UiEntry][] {
  return Object.entries(entries).filter(([key]) => /^ui:(discourse_castle|codex):/.test(key))
}

function edgeShape(text: string) {
  return { lead: /^\n*/.exec(text)![0].length, trail: /\n*$/.exec(text)![0].length, endsWithSpace: / $/.test(text) }
}

const HELP_TO_SURVIVE =
  "To survive in this hostile land thou must first know thyself! Seek ye to master thy weapons and thy magical ability!\n" +
  "\nTake great care in these thy first travels in Britannia.\n" +
  "\nUntil thou dost well know thyself, travel not far from the safety of the townes!\n"
const XU4_ENDING = "\n turns! Report\n thy feat unto\nthe XU4 team at\nSourceForge.net!"

describe("cpp-strings: castle/codex call shapes (opt-in options)", () => {
  it("captures assignment literals (joined) for the configured names only", () => {
    const source = [
      'static const char* welcome = "\\n\\n\\nLord British says:  Welcome ";',
      'text = "To survive" " in this land!\\n";',
      'other = "not display";'
    ].join("\n")
    expect(extractWith(source, { assignNames: ["welcome", "text"], joinAdjacent: true })).toEqual([
      "\n\n\nLord British says:  Welcome ",
      "To survive in this land!\n"
    ])
  })

  it("captures the second argument of the configured calls (pausedMessage(sec, msg))", () => {
    const source = 'pausedMessage(2, "\\n\\nThe voice asks:\\n");\nscreenMessage("\\nA voice rings out:\\n");'
    expect(extractWith(source, { secondArgCallNames: ["pausedMessage"] })).toEqual([
      "\n\nThe voice asks:\n",
      "\nA voice rings out:\n"
    ])
  })

  it("captures the literal right after an /*i18n*/ marker comment", () => {
    const source = 'screenMessage("%s%d%s", a, b,\n  /*i18n*/ "\\n turns! Report\\n" "the XU4 team!");'
    expect(extractWith(source, { markerComments: true, joinAdjacent: true, skipFormatOnly: true })).toEqual([
      "\n turns! Report\nthe XU4 team!"
    ])
  })

  it("skips format-only literals when asked (no letters outside conversions)", () => {
    const source = 'message("%s%s%s", a, b, c);\nmessage("\\n\\n%s\\n", a);\nmessage("%s, Thou shalt live again!\\n", n);'
    expect(extractWith(source, { extraCallNames: ["message"], skipFormatOnly: true })).toEqual([
      "%s, Thou shalt live again!\n"
    ])
  })

  it("keeps the legacy defaults unchanged when no option is given", () => {
    const source = 'text = "x";\npausedMessage(2, "y");\nscreenMessage("%s\\n", a);'
    expect(extractWith(source, undefined)).toEqual(["%s\n"])
  })
})

describe("i18n:inventory: discourse_castle.cpp + codex.cpp code literals", () => {
  it("inventories them as ui:discourse_castle:<n> / ui:codex:<n>, without format-only strings or any English text", () => {
    const publicDir = makeTmpDir("castle-templates-public-")
    const privateDir = makeTmpDir("castle-templates-private-")
    const result = spawnSync(
      "node",
      ["scripts/i18n-inventory.mjs", "--out-public", publicDir, "--out-private", privateDir],
      { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ULTIMA4_DATA: "" } }
    )
    expect(result.status, result.stderr).toBe(0)

    const entries = castleCodexEntries(uiEntries(publicDir))
    const hashes = new Set(entries.map(([, entry]) => entry.sourceHash))
    for (const literal of [
      "\n\n\nLord British says:  Welcome ",
      "\nWhat else?\n",
      "\nHe says: ",
      HELP_TO_SURVIVE,
      "%s, Thou shalt live again!\n",
      "\n\nThe voice asks:\n",
      "\nPassage is not granted.\n\n",
      XU4_ENDING
    ]) {
      expect(hashes.has(sha256(literal)), JSON.stringify(literal)).toBe(true)
    }
    for (const formatOnly of ["%s%s%s", "\n\n%s\n", "%s%d%s", "\n%s\n\n"]) {
      expect(hashes.has(sha256(formatOnly)), JSON.stringify(formatOnly)).toBe(false)
    }
    const raw = readFileSync(join(publicDir, "ui.json"), "utf8")
    expect(raw).not.toContain("Thou shalt live again")
  })
})

describe("locales/ko/ui.json: castle/codex translations + GENERATED_TALK_TEMPLATES", () => {
  const entries = castleCodexEntries(uiEntries())
  // Duplicate literals ("Passage is not granted.") share one template entry,
  // so look each id's literal up by source hash instead of by id.
  const literalByHash = new Map(Object.keys(GENERATED_TALK_TEMPLATES).map((literal) => [sha256(literal), literal]))

  it("translates every castle/codex literal (ready, Korean, same %s count, same newline edges)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(30)
    for (const [id, entry] of entries) {
      expect(entry.status, id).toBe("ready")
      expect(entry.translation, id).toMatch(/\p{Script=Hangul}/u)
      const literal = literalByHash.get(entry.sourceHash)
      expect(literal, id).toBeDefined()
      expect((entry.translation.match(/%s/g) ?? []).length, id).toBe((literal!.match(/%s/g) ?? []).length)
      expect(edgeShape(entry.translation), id).toEqual(edgeShape(literal!))
    }
  })

  it("maps the literals the web build sends (help text, welcome, xu4 ending) to their ids", () => {
    expect(GENERATED_TALK_TEMPLATES[HELP_TO_SURVIVE]).toMatch(/^ui:discourse_castle:\d+$/)
    expect(GENERATED_TALK_TEMPLATES["\n\n\nLord British says:  Welcome "]).toMatch(/^ui:discourse_castle:\d+$/)
    expect(GENERATED_TALK_TEMPLATES[XU4_ENDING]).toMatch(/^ui:codex:\d+$/)
  })
})

describe("panel fragment composition for castle/codex (real generated tables)", () => {
  const deps: TalkComposeDeps = {
    templateId: (literal) => GENERATED_TALK_TEMPLATES[literal],
    resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback
  }
  const compose = (format: string, ...args: (string | null)[]) => composeTalkLine(format, args, deps)
  const koreanOf = (id: string) => GENERATED_I18N_ENTRIES[id]!.translation

  it("Hawkwind greeting: hawkwindText:43 + player name + hawkwindText:44, in that order", () => {
    const fragments = [
      compose("%s", "@avatar.exe:hawkwindText:43"),
      compose("%s", "Avatar"),
      compose("%s", "@avatar.exe:hawkwindText:44")
    ]
    expect(fragments.join("")).toBe(`${koreanOf("avatar.exe:hawkwindText:43")}Avatar${koreanOf("avatar.exe:hawkwindText:44")}`)
    expect(fragments[0]).toMatch(/\p{Script=Hangul}/u)
  })

  it("Lord British keyword reply and the help text are Korean, from ids and from the code literal", () => {
    // 2026-10-05: TLK replies are reflowed (single line breaks -> spaces) for the wider screen.
    expect(compose("%s", "@avatar.exe:lordBritishText:0")).toBe(reflowSoftBreaks(koreanOf("avatar.exe:lordBritishText:0")))
    expect(compose(HELP_TO_SURVIVE)).toMatch(/\p{Script=Hangul}/u)
    expect(compose(HELP_TO_SURVIVE)).not.toContain("hostile")
  })

  it("Lord British welcome: translated code literal, then the name fragment", () => {
    const welcome = compose("\n\n\nLord British says:  Welcome ")
    expect(welcome).toMatch(/\p{Script=Hangul}/u)
    expect(welcome).not.toContain("Welcome")
    expect(compose("%s and thee also %s!\n", "Avatar", "Iolo")).toMatch(/Avatar.*Iolo/su)
  })

  it("Codex question ids and endgame text resolve to Korean; the move count is plain digits", () => {
    expect(compose("\n%s\n\n", "@avatar.exe:virtueQuestions:3")).toBe(`\n${koreanOf("avatar.exe:virtueQuestions:3")}\n\n`)
    expect(compose("\n\n%s", "@avatar.exe:endgameText1:0")).toBe(`\n\n${koreanOf("avatar.exe:endgameText1:0")}`)
    const ending = [compose("%s", "@avatar.exe:endgameText2:3"), compose("%s", "1234"), compose(XU4_ENDING)].join("")
    expect(ending).toContain("1234")
    expect(ending).toMatch(/\p{Script=Hangul}/u)
    expect(ending).not.toContain("Report")
  })

  it("a binary id with no ready translation shows the marker, never English, and composition continues", () => {
    const line = compose("%s", "@avatar.exe:hawkwindText:9999")
    expect(line).toBe(MISSING_TLK_TRANSLATION)
    expect(line).not.toContain("avatar")
  })
})
