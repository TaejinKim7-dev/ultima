import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { GENERATED_STATUS_NAMES, GENERATED_STATUS_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { resolveStatusName, resolveStatusTemplateId } from "../../src/i18n/localization.ts"

// Todo 27: the status column's code literals (vendor/xu4/src/stats.cpp:
// setTitle("Weapons"), "%2d Torches", " MP:%02d  LV:%d", ...) become
// inventoried `ui:stats:*` ids, and weapon/armour/class names (open-source
// module config, vendor/xu4/module/Ultima-IV/config.b) map English ->
// `module:Ultima-IV:config:<n>` per field.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function sha256(text: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex")}`
}

interface Entry {
  sourceHash: string
  placeholders: string[]
  translation: string
  status: string
}

function entriesOf(file: string, dir = join(projectRoot, "locales/ko")): Record<string, Entry> {
  return (JSON.parse(readFileSync(join(dir, `${file}.json`), "utf8")) as { entries: Record<string, Entry> }).entries
}

function statsEntries(entries: Record<string, Entry>): [string, Entry][] {
  return Object.entries(entries)
    .filter(([key]) => key.startsWith("ui:stats:"))
    .sort(([a], [b]) => Number(a.split(":")[2]) - Number(b.split(":")[2]))
}

const STATS_LITERALS = [
  "Weapons",
  "Armour",
  "Equipment",
  "Items",
  "Mixtures",
  "A  -No Armour",
  "%2d Torches",
  "%2d Gems",
  "%2d Keys",
  "%2d Sextants",
  " MP:%02d  LV:%d",
  "STR:%02d  HP:%04d",
  "DEX:%02d  HM:%04d",
  "INT:%02d  EX:%04d",
  "W:%s",
  "A:%s",
  "Stones:%s",
  "Runes:%s",
  "3 Part Key:%s"
]

describe("i18n:inventory: stats.cpp", () => {
  it("inventories the status column's literals as ui:stats ids", () => {
    const publicDir = mkdtempSync(join(tmpdir(), "status-templates-public-"))
    const privateDir = mkdtempSync(join(tmpdir(), "status-templates-private-"))
    createdDirs.push(publicDir, privateDir)
    const result = spawnSync(
      "node",
      ["scripts/i18n-inventory.mjs", "--out-public", publicDir, "--out-private", privateDir],
      { cwd: projectRoot, encoding: "utf8", env: { ...process.env, ULTIMA4_DATA: "" } }
    )
    expect(result.status, result.stderr).toBe(0)
    const hashes = new Set(statsEntries(entriesOf("ui", publicDir)).map(([, entry]) => entry.sourceHash))
    for (const literal of STATS_LITERALS) {
      expect(hashes.has(sha256(literal)), literal).toBe(true)
    }
  })
})

describe("locales/ko/ui.json: status translations", () => {
  it("translates every ui:stats entry (ready, same placeholder count)", () => {
    const entries = statsEntries(entriesOf("ui"))
    expect(entries.length).toBeGreaterThanOrEqual(STATS_LITERALS.length)
    for (const [id, entry] of entries) {
      expect(entry.status, id).toBe("ready")
      expect((entry.translation.match(/%[-0-9]*[csd]/g) ?? []).length, id).toBe(entry.placeholders.length)
    }
    const hangul = entries.filter(([, entry]) => /\p{Script=Hangul}/u.test(entry.translation))
    expect(hangul.length).toBeGreaterThanOrEqual(STATS_LITERALS.length - 3)
  })
})

describe("GENERATED_STATUS_TEMPLATES + resolveStatusTemplateId", () => {
  it("maps each stats.cpp literal to its ui:stats id, hash-consistent with ui.json", () => {
    const entries = entriesOf("ui")
    for (const literal of STATS_LITERALS) {
      expect(GENERATED_STATUS_TEMPLATES[literal], literal).toMatch(/^ui:stats:\d+$/)
    }
    for (const [literal, id] of Object.entries(GENERATED_STATUS_TEMPLATES)) {
      expect(entries[id]?.sourceHash, id).toBe(sha256(literal))
    }
    expect(resolveStatusTemplateId("Weapons")).toBe(GENERATED_STATUS_TEMPLATES["Weapons"])
    expect(resolveStatusTemplateId("Some literal stats.cpp never draws")).toBeUndefined()
  })
})

describe("GENERATED_STATUS_NAMES + resolveStatusName", () => {
  it("maps names per field to module config ids (weapon full name vs abbreviation are distinct)", () => {
    const expected: Record<string, Record<string, number>> = {
      armor: { Skin: 3, Cloth: 4, "Chain Mail": 6, "Mystic Robe": 10 },
      weapon: { Hands: 12, Staff: 14, Dagger: 16, "Flaming Oil": 30, "Magic Wand": 40, "Mystic Sword": 42 },
      weaponAbbrev: { HND: 11, STF: 13, DAG: 15, OIL: 29, "+AX": 33, "^SW": 41 },
      class: { Mage: 45, Bard: 46, Fighter: 47, Shepherd: 52 }
    }
    const moduleEntries = entriesOf("module")
    for (const [kind, names] of Object.entries(expected)) {
      for (const [english, index] of Object.entries(names)) {
        expect(GENERATED_STATUS_NAMES[kind]?.[english], `${kind}:${english}`).toBe(`module:Ultima-IV:config:${index}`)
      }
    }
    for (const [kind, names] of Object.entries(GENERATED_STATUS_NAMES)) {
      for (const [english, id] of Object.entries(names)) {
        expect(moduleEntries[id]?.sourceHash, `${kind}:${english}`).toBe(sha256(english))
      }
    }
  })

  it("resolves a mapped name to its Korean translation and misses unmapped names", () => {
    expect(resolveStatusName("weapon", "Dagger")).toBe("단검")
    expect(resolveStatusName("weaponAbbrev", "STF")).toBe("지팡")
    expect(resolveStatusName("weapon", "Staff")).toBe("지팡이")
    expect(resolveStatusName("class", "Mage")).toBe("마법사")
    expect(resolveStatusName("armor", "Skin")).toBe("맨몸")
    expect(resolveStatusName("weapon", "Not A Weapon")).toBeUndefined()
    expect(resolveStatusName("bogus", "Dagger")).toBeUndefined()
  })
})
