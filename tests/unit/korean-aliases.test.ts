import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  AVATAR_NAME_MAX_CHARS,
  NPC_INTEREST_MAX_BYTES,
  buildAliasTable,
  mergeAliasTables,
  resolveChoiceInput,
  resolveInput,
  type AliasTable
} from "../../src/i18n/korean-aliases.ts"
import aliasesSchema from "../../locales/ko/aliases.json" with { type: "json" }
import glossarySchema from "../../locales/ko/glossary.json" with { type: "json" }

// Todo 13: context-aware Korean alias mapping to the canonical English NPC
// keywords/answers xu4's own prefix matcher already expects, plus
// prompt-kind-specific input rules. See:
//   - vendor/xu4/src/discourse_tlk.cpp's runTalkDialogue(): "bye" is
//     strncasecmp(3), "look"/"name"/"give"/"join" are inputEq() (4-byte
//     prefix), "job" is strncasecmp(3), "heal" is strncasecmp(4) (matches
//     "health"). topic1/topic2 are NPC-specific, matched with
//     strncasecmp(topic, input, strlen(topic)).
//   - discourse_tlk.cpp's talkYNResponse(): only the FIRST character is
//     compared against 'y'/'Y'/'n'/'N'.
//   - vendor/xu4/src/event.cpp's ReadStringController::keyPressed(): only
//     accepts keys < MAX_BITS (128), i.e. plain ASCII -- Korean text can
//     never reach the native buffer directly, at all, for ANY prompt kind.
//   - vendor/xu4/src/intro.cpp:823 readStringView(12, ...): the avatar name
//     prompt is capped at 12 ASCII chars, later strcpy'd into
//     savegame.h's fixed `char name[16]` on-disk field.
//
// This module is pure (no DOM, no engine) -- see `.omo/drafts/step-11-13-korean-ui-design.md`'s
// design note. It never changes any native comparison string; it only
// decides, client-side, what ASCII text (if any) should be synthesized as
// keystrokes toward the real input path for a given prompt kind.

function fixtureTable(): AliasTable {
  return buildAliasTable({
    "alias:bye": { alias: "안녕", canonical: "bye" },
    "alias:job": { alias: "직업", canonical: "job" },
    "alias:health": { alias: "건강", canonical: "health" },
    "alias:yes": { alias: "예", canonical: "yes" },
    "alias:no": { alias: "아니오", canonical: "no" },
    // A scaffolded-but-not-yet-translated entry (matches locales/ko's own
    // convention): must never be treated as a real, matchable alias.
    "alias:give": { alias: "", canonical: "give" }
  })
}

describe("korean-aliases: resolveInput for 'text' (NPC free-answer) prompts", () => {
  it("passes plain ASCII input through completely unchanged, preserving the native 4-byte prefix matcher's own behavior", () => {
    const table = fixtureTable()
    // Deliberately NOT a full canonical word -- xu4 prefix-matches, so a
    // real player may type more or less than the canonical spelling; this
    // layer must never rewrite/truncate/case-fold ASCII input.
    expect(resolveInput("text", "JoB", table)).toEqual({ ok: true, text: "JoB" })
    expect(resolveInput("text", "he", table)).toEqual({ ok: true, text: "he" })
  })

  it("maps a known Korean alias to its exact canonical English keyword", () => {
    const table = fixtureTable()
    expect(resolveInput("text", "건강", table)).toEqual({ ok: true, text: "health" })
    expect(resolveInput("text", "직업", table)).toEqual({ ok: true, text: "job" })
  })

  it("matches after Unicode NFC normalization (decomposed Hangul jamo == precomposed syllables) and trims surrounding whitespace", () => {
    const table = fixtureTable()
    const decomposed = "건강".normalize("NFD")
    expect(decomposed).not.toBe("건강") // sanity: the fixture really is decomposed
    expect(resolveInput("text", `  ${decomposed}  `, table)).toEqual({ ok: true, text: "health" })
  })

  it("rejects Korean input with no matching alias, without inventing or passing through any text", () => {
    const table = fixtureTable()
    const result = resolveInput("text", "알수없는단어", table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("unknown-keyword")
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it("treats a scaffolded entry with an empty alias as not-yet-translated -- it must never be a matchable table entry", () => {
    // Mirrors locales/ko/aliases.json's own "pending" scaffold convention
    // (empty alias, canonical already set): buildAliasTable must not turn
    // that into a real (normalized-empty-string -> canonical) mapping,
    // which could otherwise spuriously match on later, unrelated input.
    const table = buildAliasTable({ "alias:give": { alias: "", canonical: "give" } })
    expect(table.byNormalizedAlias.size).toBe(0)
  })
})

describe("korean-aliases: resolveInput for 'yesno' prompts", () => {
  it("passes any ASCII input through unchanged -- native talkYNResponse only ever reads the first character itself", () => {
    const table = fixtureTable()
    expect(resolveInput("yesno", "y", table)).toEqual({ ok: true, text: "y" })
    expect(resolveInput("yesno", "Yes please", table)).toEqual({ ok: true, text: "Yes please" })
    expect(resolveInput("yesno", "n", table)).toEqual({ ok: true, text: "n" })
  })

  it("maps Korean 예/아니오 to the canonical y/n answers", () => {
    const table = fixtureTable()
    expect(resolveInput("yesno", "예", table)).toEqual({ ok: true, text: "yes" })
    expect(resolveInput("yesno", "아니오", table)).toEqual({ ok: true, text: "no" })
  })

  it("does not let an unrelated Korean alias (e.g. the 'job' keyword) answer a yes/no prompt", () => {
    const table = fixtureTable()
    const result = resolveInput("yesno", "직업", table)
    expect(result.ok).toBe(false)
  })
})

describe("korean-aliases: prompt kinds that must reject Korean outright (never alias, never transliterate)", () => {
  it("rejects Korean in the avatar-name prompt with a name-specific message and injects nothing", () => {
    const table = fixtureTable()
    const result = resolveInput("avatar-name", "홍길동", table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("korean-not-allowed")
      expect(result.message).toContain("이름")
    }
  })

  it("accepts a plain ASCII avatar name within the native 12-character limit", () => {
    const table = fixtureTable()
    expect(resolveInput("avatar-name", "Avatar", table)).toEqual({ ok: true, text: "Avatar" })
  })

  it("rejects an ASCII avatar name longer than the native 12-character limit", () => {
    const table = fixtureTable()
    const tooLong = "A".repeat(AVATAR_NAME_MAX_CHARS + 1)
    const result = resolveInput("avatar-name", tooLong, table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("too-long")
  })

  it("rejects an ASCII avatar name with a character outside the native bitset (e.g. an apostrophe)", () => {
    const table = fixtureTable()
    const result = resolveInput("avatar-name", "O'Brien", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid-charset")
  })

  it("rejects Korean in a numeric prompt with a number-specific message", () => {
    const table = fixtureTable()
    const result = resolveInput("number", "삼백", table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("korean-not-allowed")
      expect(result.message).toContain("숫자")
    }
  })

  it("accepts plain digits in a numeric prompt", () => {
    const table = fixtureTable()
    expect(resolveInput("number", "300", table)).toEqual({ ok: true, text: "300" })
  })

  it("rejects non-digit ASCII in a numeric prompt", () => {
    const table = fixtureTable()
    const result = resolveInput("number", "300g", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("invalid-charset")
  })

  it("rejects Korean in a direction prompt", () => {
    const table = fixtureTable()
    const result = resolveInput("direction", "북쪽", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("korean-not-allowed")
  })

  it("rejects Korean in a single-key command prompt", () => {
    const table = fixtureTable()
    const result = resolveInput("command", "공격", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("korean-not-allowed")
  })

  it("gives a distinct message per rejecting prompt kind (never a single generic string)", () => {
    const table = fixtureTable()
    const messages = new Set(
      (["avatar-name", "number", "direction", "command"] as const).map((kind) => {
        const result = resolveInput(kind, "한글", table)
        if (result.ok) throw new Error(`expected ${kind} to reject Korean input`)
        return result.message
      })
    )
    expect(messages.size).toBe(4)
  })
})

describe("korean-aliases: context-aware NPC-specific aliasing (mergeAliasTables)", () => {
  it("resolves an NPC-specific topic alias merged on top of the global table, without disturbing global entries", () => {
    const globalTable = fixtureTable()
    const npcTable = buildAliasTable({
      "npc:britain-guard:topic1": { alias: "성문", canonical: "gate" }
    })
    const merged = mergeAliasTables(globalTable, npcTable)

    expect(resolveInput("text", "성문", merged)).toEqual({ ok: true, text: "gate" })
    // The global alias set still resolves after merging.
    expect(resolveInput("text", "건강", merged)).toEqual({ ok: true, text: "health" })
  })

  it("lets an NPC-specific entry override a global alias's canonical mapping", () => {
    const globalTable = fixtureTable()
    const npcOverride = buildAliasTable({
      "npc:special:bye-alias": { alias: "안녕", canonical: "topic1-specific-farewell" }
    })
    const merged = mergeAliasTables(globalTable, npcOverride)
    expect(resolveInput("text", "안녕", merged)).toEqual({ ok: true, text: "topic1-specific-farewell" })
  })
})

describe("korean-aliases: invariant over the real locales/ko/aliases.json content", () => {
  it("every filled-in alias's canonical keyword is pure ASCII and fits the native 16-byte interest-prompt buffer (discourse_tlk.cpp's gameGetInput(16))", () => {
    const entries = (aliasesSchema as { entries: Record<string, { alias: string; canonical: string }> }).entries
    const filledIn = Object.values(entries).filter((entry) => entry.alias.trim().length > 0)

    // This is the actual Todo 13 deliverable: the scaffold must no longer
    // be all-empty by the time this Todo is done.
    expect(filledIn.length).toBeGreaterThan(0)

    for (const entry of filledIn) {
      expect(/^[\x00-\x7f]*$/.test(entry.canonical)).toBe(true)
      expect(new TextEncoder().encode(entry.canonical).length).toBeLessThanOrEqual(NPC_INTEREST_MAX_BYTES)
    }
  })
})

// Todo 37: Korean aliases for Lord British's topic keywords and Hawkwind's
// virtue names. vendor/xu4/src/discourse_castle.cpp:254-258 lists the 24 topic
// keywords; :495 matches only the first 4 letters of the INPUT, and :504-506
// add help/heal; Hawkwind compares against getVirtueName() full names (:569).
// A Korean alias resolves to the FULL canonical English word, so the native
// 4-letter prefix rule is applied to that word, never to Korean text.
const LORD_BRITISH_TOPICS: ReadonlyArray<{
  readonly canonical: string
  readonly alias: string
  readonly glossaryId: string
  readonly english: string
}> = [
  { canonical: "truth", alias: "진실", glossaryId: "principle-truth", english: "Truth" },
  { canonical: "love", alias: "사랑", glossaryId: "principle-love", english: "Love" },
  { canonical: "courage", alias: "용기", glossaryId: "principle-courage", english: "Courage" },
  { canonical: "honesty", alias: "정직", glossaryId: "virtue-honesty", english: "Honesty" },
  { canonical: "compassion", alias: "자비", glossaryId: "virtue-compassion", english: "Compassion" },
  { canonical: "valor", alias: "용맹", glossaryId: "virtue-valor", english: "Valor" },
  { canonical: "justice", alias: "정의", glossaryId: "virtue-justice", english: "Justice" },
  { canonical: "sacrifice", alias: "희생", glossaryId: "virtue-sacrifice", english: "Sacrifice" },
  { canonical: "honor", alias: "명예", glossaryId: "virtue-honor", english: "Honor" },
  { canonical: "spirituality", alias: "영성", glossaryId: "virtue-spirituality", english: "Spirituality" },
  { canonical: "humility", alias: "겸손", glossaryId: "virtue-humility", english: "Humility" },
  { canonical: "virtue", alias: "미덕", glossaryId: "term-virtue", english: "Virtue" },
  { canonical: "pride", alias: "오만", glossaryId: "principle-pride", english: "Pride" },
  { canonical: "avatar", alias: "아바타", glossaryId: "term-avatar", english: "Avatar" },
  { canonical: "quest", alias: "사명", glossaryId: "term-quest", english: "Quest" },
  { canonical: "britannia", alias: "브리타니아", glossaryId: "term-britannia", english: "Britannia" },
  { canonical: "ankh", alias: "앙크", glossaryId: "term-ankh", english: "Ankh" },
  { canonical: "abyss", alias: "심연", glossaryId: "term-abyss", english: "Abyss" },
  { canonical: "mondain", alias: "몬데인", glossaryId: "term-mondain", english: "Mondain" },
  { canonical: "minax", alias: "미낙스", glossaryId: "term-minax", english: "Minax" },
  { canonical: "exodus", alias: "엑소더스", glossaryId: "term-exodus", english: "Exodus" },
  { canonical: "help", alias: "도움", glossaryId: "term-help", english: "Help" },
  { canonical: "heal", alias: "치유", glossaryId: "term-heal", english: "Heal" }
]

type AliasFileEntry = { alias: string; canonical: string; status: string }
const REAL_ALIAS_ENTRIES = (aliasesSchema as { entries: Record<string, AliasFileEntry> }).entries
const GLOSSARY_ENTRIES = (glossarySchema as { entries: Record<string, { sourceHash: string; translation: string }> })
  .entries

describe("korean-aliases: Todo 37 Lord British / Hawkwind topic keywords (real locales/ko/aliases.json)", () => {
  const realTable = buildAliasTable(REAL_ALIAS_ENTRIES)

  it.each(LORD_BRITISH_TOPICS)("resolves $alias to the full canonical keyword $canonical on a text prompt", (topic) => {
    expect(resolveInput("text", topic.alias, realTable)).toEqual({ ok: true, text: topic.canonical })
  })

  it("registers each new topic as a ready alias:<id> entry with the expected canonical", () => {
    for (const topic of LORD_BRITISH_TOPICS) {
      const entry = REAL_ALIAS_ENTRIES[`alias:${topic.canonical}`]
      expect(entry, topic.canonical).toEqual({ alias: topic.alias, canonical: topic.canonical, status: "ready" })
    }
  })

  it("keeps alias text identical to the glossary translation, and the glossary hash equal to the English term's sha256", () => {
    for (const topic of LORD_BRITISH_TOPICS) {
      const term = GLOSSARY_ENTRIES[topic.glossaryId]
      expect(term, topic.glossaryId).toBeDefined()
      expect(term?.translation, topic.glossaryId).toBe(topic.alias)
      expect(term?.sourceHash, topic.glossaryId).toBe(
        `sha256:${createHash("sha256").update(Buffer.from(topic.english, "utf8")).digest("hex")}`
      )
    }
  })

  it("has no duplicate normalized alias text, and no alias text shared by two different canonicals", () => {
    const seen = new Map<string, string>()
    for (const entry of Object.values(REAL_ALIAS_ENTRIES)) {
      const normalized = entry.alias.normalize("NFC").trim().toLowerCase()
      if (normalized.length === 0) {
        continue
      }
      expect(seen.has(normalized), `duplicate alias ${normalized}`).toBe(false)
      seen.set(normalized, entry.canonical)
    }
  })

  it("never lets two topic canonicals collide on the native 4-letter prefix (strncasecmp(...,4))", () => {
    const prefixes = new Map<string, string>()
    for (const topic of LORD_BRITISH_TOPICS) {
      const prefix = topic.canonical.slice(0, 4)
      expect(prefixes.has(prefix), `${topic.canonical} collides with ${prefixes.get(prefix)}`).toBe(false)
      prefixes.set(prefix, topic.canonical)
    }
  })

  it("keeps the existing NPC keywords and rejects an unknown Korean word as before", () => {
    expect(resolveInput("text", "직업", realTable)).toEqual({ ok: true, text: "job" })
    const unknown = resolveInput("text", "없는낱말", realTable)
    expect(unknown.ok).toBe(false)
    expect(unknown.ok === false && unknown.reason).toBe("unknown-keyword")
  })

  it("does not let a topic alias answer a yes/no prompt or a single-key choice prompt", () => {
    const yesno = resolveInput("yesno", "진실", realTable)
    expect(yesno.ok).toBe(false)
    const choice = resolveChoiceInput("정직", realTable)
    expect(choice.ok === false && choice.reason).toBe("not-a-choice-answer")
  })
})
