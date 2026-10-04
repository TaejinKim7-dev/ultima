import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { sourceHash } from "../../scripts/lib/hash.mjs"
import {
  buildTopicGlossTables,
  defaultGlossId,
  overrideGlossId,
  topicGlossProblems,
  topicSlots,
  topicSlug
} from "../../scripts/lib/topic-glosses.mjs"
import { generateI18nTables } from "../../scripts/i18n-generate.mjs"
import { resolveNpcTopics } from "../../src/i18n/localization.ts"
import {
  GENERATED_TOPIC_GLOSSES,
  GENERATED_TOPIC_GLOSS_OVERRIDES
} from "../../src/i18n/generated/strings.ts"
import tlkSchema from "../../locales/ko/tlk.json" with { type: "json" }
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }
import aliasesSchema from "../../locales/ko/aliases.json" with { type: "json" }

// Todo 48: every NPC talk topic keyword (locales/ko/tlk.json's topic1/
// topic2 rows) needs a ready Korean gloss in locales/ko/glossary.json
// (npc-topic-* rows), and the generator must emit the raw-keyword ->
// gloss-id tables into src/i18n/generated/strings.ts. These tests pin the
// committed data, the generator purity, and the runtime resolution.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const tlk = (tlkSchema as unknown as { entries: Record<string, { sourceHash: string; translation: string; status: string }> })
  .entries
const glossary = (
  glossarySchema as unknown as {
    entries: Record<string, { sourceHash: string; translation: string; status: string; category?: string }>
  }
).entries
const aliases = aliasesSchema as unknown as { entries: Record<string, { alias: string; canonical: string }> }

function distinctTopicKeywords(): string[] {
  const seen = new Set<string>()
  for (const [key, entry] of Object.entries(tlk)) {
    if (!/:(topic[12])$/.test(key)) continue
    seen.add(entry.translation)
  }
  return [...seen]
}

describe("topic slug / id helpers", () => {
  it("slugs a padded raw keyword: lowercase, trimmed, '.' -> -dot, inner space -> -", () => {
    expect(topicSlug("ALE ")).toBe("ale")
    expect(topicSlug("BEH.")).toBe("beh-dot")
    expect(topicSlug("HO E")).toBe("ho-e")
    expect(topicSlug("IT  ")).toBe("it")
    expect(topicSlug("PLAY")).toBe("play")
  })

  it("derives the default and override glossary ids", () => {
    expect(defaultGlossId("ALE ")).toBe("npc-topic-ale")
    expect(overrideGlossId("COUN", "LCB", "11")).toBe("npc-topic-coun--lcb-11")
    expect(overrideGlossId("BEH.", "YEW", "6")).toBe("npc-topic-beh-dot--yew-6")
  })
})

describe("committed topic gloss data", () => {
  it("covers every distinct topic keyword except the unused marker, ready and hash-matched", () => {
    const keywords = distinctTopicKeywords().filter((raw) => raw.trim() !== "A")
    const slots = topicSlots(tlk)
    expect(slots.length).toBeGreaterThan(0)
    for (const raw of keywords) {
      const id = defaultGlossId(raw)
      const entry = glossary[id]
      expect(entry, `keyword ${JSON.stringify(raw)} has no npc-topic gloss row`).toBeDefined()
      expect(entry!.sourceHash, `row ${id} hash mismatch for ${JSON.stringify(raw)}`).toBe(sourceHash(raw))
      expect(entry!.status, `row ${id} must be ready`).toBe("ready")
      expect(entry!.category, `row ${id} must be marked npc-topic`).toBe("npc-topic")
      expect(entry!.translation.length).toBeGreaterThan(0)
    }
    // "A   " itself must never appear as a glossed keyword.
    expect(glossary[defaultGlossId("A   ")]).toBeUndefined()
  })

  it("passes the strict problem gate: per-NPC unique, no reserved collision, no ASCII gloss, no orphan overrides", () => {
    const problems = topicGlossProblems(tlk, glossary, aliases, { strict: true })
    expect(problems, problems.join("\n")).toEqual([])
  })

  it("uses a Korean-only gloss for every keyword (no ASCII letters)", () => {
    for (const raw of distinctTopicKeywords()) {
      if (raw.trim() === "A") continue
      expect(/[A-Za-z]/.test(glossary[defaultGlossId(raw)]!.translation)).toBe(false)
    }
  })
})

describe("generator emits the topic gloss tables", () => {
  it("committed generated tables equal the generator's output from locales/ko (no hand edits)", () => {
    const tables = generateI18nTables("locales/ko")
    expect(tables.topicGlosses).toEqual(GENERATED_TOPIC_GLOSSES)
    expect(tables.topicGlossOverrides).toEqual(GENERATED_TOPIC_GLOSS_OVERRIDES)
  })

  it("never reads the private .local inventory", () => {
    for (const relativePath of ["scripts/i18n-generate.mjs", "scripts/lib/topic-glosses.mjs"]) {
      const source = readFileSync(join(projectRoot, relativePath), "utf8")
      // ".local" as a path reference (followed by a separator or a quote);
      // `localeCompare` contains ".local" as a substring but is no path.
      expect(source, `${relativePath} must not reference the .local directory`).not.toMatch(/\.local[/"']/)
    }
  })

  it("keeps npc-topic rows out of the native tables", () => {
    for (const relativePath of ["native/i18n/u4_i18n_table.inc", "native/i18n/ko-overlay.b"]) {
      const source = readFileSync(join(projectRoot, relativePath), "utf8")
      expect(source, `${relativePath} must not contain npc-topic rows`).not.toContain("npc-topic")
    }
  })
})

describe("buildTopicGlossTables", () => {
  it("joins only ready, hash-matching rows and drops a drifted hash", () => {
    const fixtureTlk = {
      "YEW:0:topic1": { sourceHash: sourceHash("TRUT"), translation: "TRUT" },
      "YEW:0:topic2": { sourceHash: "sha256:0000drift", translation: "LOVE" }
    }
    const fixtureGlossary = {
      "npc-topic-trut": { sourceHash: sourceHash("TRUT"), translation: "진실", status: "ready" },
      "npc-topic-love": { sourceHash: sourceHash("LOVE"), translation: "사랑", status: "ready" },
      "npc-topic-love--yew-0": { sourceHash: sourceHash("LOVE"), translation: "드리프트", status: "ready" }
    }
    const { glosses, overrides } = buildTopicGlossTables(fixtureTlk, fixtureGlossary)
    expect(glosses).toEqual({ TRUT: "npc-topic-trut" }) // LOVE dropped: its slot hash is drifted
    expect(overrides).toEqual({}) // the override row has no matching slot hash either
  })

  it("attaches a per-slot override for the slot that carries the keyword", () => {
    const fixtureTlk = {
      "COVE:3:topic2": { sourceHash: sourceHash("GATE "), translation: "GATE " },
      "COVE:7:topic2": { sourceHash: sourceHash("GATE "), translation: "GATE " }
    }
    const fixtureGlossary = {
      "npc-topic-gate": { sourceHash: sourceHash("GATE "), translation: "문", status: "ready" },
      "npc-topic-gate--cove-3": { sourceHash: sourceHash("GATE "), translation: "게이트", status: "ready" },
      "npc-topic-gate--cove-7": { sourceHash: sourceHash("GATE "), translation: "게이트", status: "ready" }
    }
    const { glosses, overrides } = buildTopicGlossTables(fixtureTlk, fixtureGlossary)
    expect(glosses).toEqual({ "GATE ": "npc-topic-gate" })
    expect(overrides).toEqual({
      "COVE:3:topic2": "npc-topic-gate--cove-3",
      "COVE:7:topic2": "npc-topic-gate--cove-7"
    })
  })

  it("skips the unused marker and only reads ready rows", () => {
    const fixtureTlk = {
      "BRITAIN:0:topic1": { sourceHash: sourceHash("A   "), translation: "A   " },
      "BRITAIN:0:topic2": { sourceHash: sourceHash("PLAY"), translation: "PLAY" }
    }
    const fixtureGlossary = {
      "npc-topic-play": { sourceHash: sourceHash("PLAY"), translation: "", status: "pending" }
    }
    const { glosses } = buildTopicGlossTables(fixtureTlk, fixtureGlossary)
    expect(glosses).toEqual({})
  })
})

describe("topicGlossProblems", () => {
  it("reports a missing gloss only under strict", () => {
    const fixtureTlk = {
      "YEW:0:topic1": { sourceHash: sourceHash("TRUT"), translation: "TRUT" }
    }
    expect(topicGlossProblems(fixtureTlk, {}, aliases)).toEqual([])
    const strict = topicGlossProblems(fixtureTlk, {}, aliases, { strict: true })
    expect(strict.length).toBe(1)
    expect(strict[0]).toContain("TRUT")
  })

  it("reports a duplicate gloss within one NPC", () => {
    const fixtureTlk = {
      "YEW:0:topic1": { sourceHash: sourceHash("TRUT"), translation: "TRUT" },
      "YEW:0:topic2": { sourceHash: sourceHash("TRUT"), translation: "TRUT" }
    }
    const fixtureGlossary = {
      "npc-topic-trut": { sourceHash: sourceHash("TRUT"), translation: "진실", status: "ready" }
    }
    const problems = topicGlossProblems(fixtureTlk, fixtureGlossary, aliases)
    expect(problems.some((problem) => problem.includes("duplicate gloss"))).toBe(true)
  })

  it("reports a reserved-alias collision", () => {
    const fixtureTlk = {
      "YEW:0:topic1": { sourceHash: sourceHash("NAME"), translation: "NAME" }
    }
    const fixtureGlossary = {
      "npc-topic-name": { sourceHash: sourceHash("NAME"), translation: "이름", status: "ready" }
    }
    const problems = topicGlossProblems(fixtureTlk, fixtureGlossary, aliases)
    expect(problems.some((problem) => problem.includes("reserved common alias"))).toBe(true)
  })

  it("reports a gloss whose global-alias canonical has a different native effect", () => {
    const fixtureTlk = {
      "YEW:0:topic1": { sourceHash: sourceHash("MAGI"), translation: "MAGI" }
    }
    const fixtureGlossary = {
      "npc-topic-magi": { sourceHash: sourceHash("MAGI"), translation: "심연", status: "ready" }
    }
    // "심연" -> abyss (global alias), which does not start with the MAGI keyword.
    const problems = topicGlossProblems(fixtureTlk, fixtureGlossary, aliases)
    expect(problems.some((problem) => problem.includes("effect differs"))).toBe(true)
  })

  it("reports an orphan override row", () => {
    const fixtureTlk = {
      "COVE:3:topic2": { sourceHash: sourceHash("GATE "), translation: "GATE " }
    }
    const fixtureGlossary = {
      "npc-topic-gate--cove-7": { sourceHash: sourceHash("GATE "), translation: "게이트", status: "ready" }
    }
    const problems = topicGlossProblems(fixtureTlk, fixtureGlossary, aliases)
    expect(problems.some((problem) => problem.includes("matches no COVE:7 topic slot"))).toBe(true)
  })
})

describe("resolveNpcTopics runtime lookup", () => {
  it("returns the two topics in native order with glosses, dropping the unused marker", () => {
    const topics = resolveNpcTopics("BRITAIN:0")
    expect(topics).toEqual([
      { keyword: "PLAY", gloss: "연주" },
      { keyword: "COMP", gloss: "자비" }
    ])
  })

  it("applies the per-slot override", () => {
    const topics = resolveNpcTopics("PAWS:13")
    expect(topics).toContainEqual({ keyword: "SERV", gloss: "시중" })
  })

  it("never emits a keyword failing ^[A-Za-z0-9 ]+$ (BEH. is unreachable) and never BEH-dot", () => {
    const topics = resolveNpcTopics("YEW:6")
    for (const topic of topics) {
      expect(/^[A-Za-z0-9 ]+$/.test(topic.keyword)).toBe(true)
      expect(topic.keyword).not.toBe("BEH.")
    }
    expect(topics.some((topic) => topic.keyword === "BEH")).toBe(true)
  })

  it("returns nothing for an unknown NPC key", () => {
    expect(resolveNpcTopics("NOPE:0")).toEqual([])
  })
})