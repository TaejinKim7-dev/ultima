import { describe, expect, it } from "vitest"
import {
  HAWKWIND_TOPIC_KEYWORDS,
  LB_TOPIC_KEYWORDS,
  PROMPT_KIND_CHOICE,
  TALK_END_DELAY_MS,
  createTalkKeywords,
  type NpcTopic,
  type TalkKeywords
} from "../../src/dialogue/talk-keywords.ts"
import aliasesSchema from "../../locales/ko/aliases.json" with { type: "json" }

// Todo 48: the conversation-state module that produces the usable talk-
// keyword chips. Pure (no DOM, no engine; injected timers/lookups), so the
// whole session lifecycle is unit-testable here:
//   - speaker detection (NPC / Lord British / Hawkwind) from talk lines;
//   - the chip list per state (common, this NPC's topic glosses, the
//     answer group while a question/choice is pending, castle lists);
//   - asked marking in the engine's own matching order, the bye rule, the
//     soft end (stash) and its restore across the ask-pause;
//   - a different speaker always starts a fresh session.

const ALIAS_LABELS: Record<string, string> = {}
for (const entry of Object.values(
  (aliasesSchema as unknown as { entries: Record<string, { alias: string; canonical: string }> }).entries
)) {
  if (entry.alias.length > 0 && ALIAS_LABELS[entry.canonical] === undefined) {
    ALIAS_LABELS[entry.canonical] = entry.alias
  }
}

const MOONGLOW_TOPICS: readonly NpcTopic[] = [
  { keyword: "ADVE", gloss: "모험" },
  { keyword: "MAGI", gloss: "마법" }
]

function harness(
  npcTopics: Record<string, readonly NpcTopic[]> = { "MOONGLOW:0": MOONGLOW_TOPICS, "MOONGLOW:1": MOONGLOW_TOPICS }
) {
  let now = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  let nextId = 1
  let changeCount = 0
  const tk: TalkKeywords = createTalkKeywords({
    npcTopics: (key) => npcTopics[key] ?? [],
    aliasFor: (canonical) => ALIAS_LABELS[canonical],
    setTimer: (fn, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimer: (id) => {
      timers.delete(id as number)
    },
    onChange: () => {
      changeCount += 1
    }
  })
  return {
    tk,
    changes: () => changeCount,
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.fn()
        }
      }
    },
    pending: () => timers.size
  }
}

function openNpcConversation(tk: TalkKeywords, npc = "MOONGLOW:0"): void {
  tk.talkLine("ui:discourse_tlk:1", [`@${npc}:look`])
}

function group(view: ReturnType<TalkKeywords["view"]>, title: string) {
  return view.groups.find((candidate) => candidate.title === title)
}

describe("NPC conversations", () => {
  it("shows the common chips and this NPC's two topic glosses (keyword as secondary)", () => {
    const h = harness()
    openNpcConversation(h.tk)
    const view = h.tk.view()
    expect(view.active).toBe(true)
    expect(view.speaker).toBe("npc")
    expect(view.npcKey).toBe("MOONGLOW:0")

    const common = group(view, "공통")
    expect(common?.chips.map((chip) => chip.label)).toEqual(["이름", "직업", "건강", "외모", "합류", "기부", "안녕"])
    expect(common?.chips.map((chip) => chip.keyword)).toEqual(["name", "job", "health", "look", "join", "give", "bye"])

    const topics = group(view, "이 사람에게 물어볼 것")
    expect(topics?.chips).toEqual([
      { label: "모험", keyword: "ADVE", secondary: "ADVE", asked: false },
      { label: "마법", keyword: "MAGI", secondary: "MAGI", asked: false }
    ])
    expect(group(view, "대답")).toBeUndefined()
  })

  it("hides the menu before any conversation and after the soft end", () => {
    const h = harness()
    expect(h.tk.view().active).toBe(false)
    openNpcConversation(h.tk)
    expect(h.tk.view().active).toBe(true)
    h.advance(TALK_END_DELAY_MS) // no prompt ever opened; a stray end signal hides nothing
    expect(h.tk.view().active).toBe(true)
  })

  it("shows the answer group while a question is pending and clears it on a yes/no field line", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.talkLine("ui:discourse_tlk:6", ["@MOONGLOW:0:question"])
    const answer = group(h.tk.view(), "대답")
    expect(answer?.chips.map((chip) => chip.label)).toEqual(["예", "아니오"])

    h.tk.talkLine("%s", ["@MOONGLOW:0:no"])
    expect(group(h.tk.view(), "대답")).toBeUndefined()

    // Any other field of the NPC also clears it.
    h.tk.talkLine("ui:discourse_tlk:6", ["@MOONGLOW:0:question"])
    expect(group(h.tk.view(), "대답")).toBeDefined()
    h.tk.talkLine("ui:discourse_tlk:7", ["@MOONGLOW:0:health"])
    expect(group(h.tk.view(), "대답")).toBeUndefined()
  })

  it("marks asked chips from the input echo in the engine's own matching order", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("heal")
    h.tk.inputEcho("ADVE")
    let view = h.tk.view()
    expect(group(view, "공통")?.chips.find((chip) => chip.keyword === "health")?.asked).toBe(true)
    expect(group(view, "이 사람에게 물어볼 것")?.chips.find((chip) => chip.keyword === "ADVE")?.asked).toBe(true)

    // A shorter input never matches a longer topic (native strncasecmp hits
    // the input's NUL); "adv" does not mark ADVE.
    openNpcConversation(h.tk, "MOONGLOW:1") // fresh session (different NPC)
    h.tk.inputEcho("adv")
    view = h.tk.view()
    expect(group(view, "이 사람에게 물어볼 것")?.chips.find((chip) => chip.keyword === "ADVE")?.asked).toBe(false)

    // "jobbery" does mark job (3-char prefix, like native strncasecmp("job", in, 3)).
    h.tk.inputEcho("jobbery")
    expect(group(h.tk.view(), "공통")?.chips.find((chip) => chip.keyword === "job")?.asked).toBe(true)
  })

  it("marks bye asked and discards the stash so a later same-speaker line does not restore it", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("bye")
    expect(group(h.tk.view(), "공통")?.chips.find((chip) => chip.keyword === "bye")?.asked).toBe(true)
    h.tk.promptClosed() // the interest prompt closes after the input
    h.advance(TALK_END_DELAY_MS)
    expect(h.tk.view().active).toBe(false)
    h.tk.talkLine("ui:discourse_tlk:3", [null, null]) // the "Bye.\n" line
    expect(h.tk.view().active).toBe(false)
  })

  it("keeps the asked marks across the ask-pause (soft end then a same-speaker line restores)", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("heal")
    h.tk.promptClosed()
    h.advance(TALK_END_DELAY_MS)
    expect(h.tk.view().active).toBe(false)
    h.tk.talkLine("ui:discourse_tlk:6", ["@MOONGLOW:0:question"]) // the ask-pause question line
    const view = h.tk.view()
    expect(view.active).toBe(true)
    expect(group(view, "공통")?.chips.find((chip) => chip.keyword === "health")?.asked).toBe(true)
    expect(group(view, "대답")).toBeDefined()
  })

  it("a reopened text prompt restores a stashed session", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("heal")
    h.tk.promptClosed()
    h.advance(TALK_END_DELAY_MS)
    expect(h.tk.view().active).toBe(false)
    h.tk.promptOpened(0) // U4_WEB_PROMPT_TEXT
    expect(h.tk.view().active).toBe(true)
  })

  it("skips the yes/no echo while a question is pending", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.talkLine("ui:discourse_tlk:6", ["@MOONGLOW:0:question"])
    h.tk.inputEcho("yes") // the talkYNResponse echo must not mark a chip
    expect(group(h.tk.view(), "공통")?.chips.find((chip) => chip.keyword === "health")?.asked).toBe(false)
  })

  it("a different NPC starts a fresh session", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("heal")
    openNpcConversation(h.tk, "MOONGLOW:1")
    const view = h.tk.view()
    expect(view.npcKey).toBe("MOONGLOW:1")
    expect(group(view, "공통")?.chips.find((chip) => chip.keyword === "health")?.asked).toBe(false)
  })

  it("exposes the current NPC's topics as the per-NPC alias overlay", () => {
    const h = harness()
    expect(h.tk.topicAliases()).toEqual([])
    openNpcConversation(h.tk)
    expect(h.tk.topicAliases()).toEqual(MOONGLOW_TOPICS)
  })
})

describe("Lord British conversations", () => {
  it("detects Lord British from an opening castle template and shows his chips", () => {
    const h = harness()
    h.tk.talkLine("ui:discourse_castle:17", ["Avatar"]) // first meeting
    const view = h.tk.view()
    expect(view.active).toBe(true)
    expect(view.speaker).toBe("lordBritish")
    expect(view.npcKey).toBeNull()
    expect(group(view, "공통")?.chips.map((chip) => chip.label)).toEqual(["이름", "직업", "외모", "안녕"])
    const topics = group(view, "이 사람에게 물어볼 것")
    expect(topics?.chips.map((chip) => chip.keyword)).toEqual(LB_TOPIC_KEYWORDS)
    expect(topics?.chips.find((chip) => chip.keyword === "truth")?.label).toBe("진실")
  })

  it("marks a Lord British topic asked from the response id and from a submission", () => {
    const h = harness()
    h.tk.talkLine("ui:discourse_castle:13", ["Avatar", "Dupre"]) // welcome
    h.tk.talkLine("%s", ["@avatar.exe:lordBritishText:3"]) // truth's response id
    let topics = group(h.tk.view(), "이 사람에게 물어볼 것")
    expect(topics?.chips.find((chip) => chip.keyword === "truth")?.asked).toBe(true)

    h.tk.submitted("help")
    topics = group(h.tk.view(), "이 사람에게 물어볼 것")
    expect(topics?.chips.find((chip) => chip.keyword === "help")?.asked).toBe(true)
  })

  it("shows the answer group while a choice prompt is open (the heal question)", () => {
    const h = harness()
    h.tk.talkLine("ui:discourse_castle:12", ["Avatar"]) // resurrect opening
    expect(group(h.tk.view(), "대답")).toBeUndefined()
    h.tk.promptOpened(PROMPT_KIND_CHOICE)
    expect(group(h.tk.view(), "대답")).toBeDefined()
    h.tk.promptClosed()
    expect(group(h.tk.view(), "대답")).toBeUndefined()
  })

  it("a non-opening castle line from the same speaker keeps the session", () => {
    const h = harness()
    h.tk.talkLine("ui:discourse_castle:17", ["Avatar"])
    h.tk.talkLine("ui:discourse_castle:18", [null, null]) // "A new age" (no args)
    const view = h.tk.view()
    expect(view.active).toBe(true)
    expect(view.speaker).toBe("lordBritish")
  })
})

describe("Hawkwind conversations", () => {
  it("detects Hawkwind from his welcome text and shows the eight virtues", () => {
    const h = harness()
    h.tk.talkLine("%s%s%s", ["@avatar.exe:hawkwindText:43", "Avatar", "@avatar.exe:hawkwindText:44"])
    const view = h.tk.view()
    expect(view.active).toBe(true)
    expect(view.speaker).toBe("hawkwind")
    expect(group(view, "공통")?.chips.map((chip) => chip.label)).toEqual(["안녕"])
    expect(group(view, "이 사람에게 물어볼 것")?.chips.map((chip) => chip.keyword)).toEqual(HAWKWIND_TOPIC_KEYWORDS)
  })

  it("marks a virtue asked from a Korean-path submission (the castle loops send no echo)", () => {
    const h = harness()
    h.tk.talkLine("%s%s%s", ["@avatar.exe:hawkwindText:43", "Avatar", "@avatar.exe:hawkwindText:44"])
    h.tk.submitted("honesty")
    const topics = group(h.tk.view(), "이 사람에게 물어볼 것")
    expect(topics?.chips.find((chip) => chip.keyword === "honesty")?.asked).toBe(true)
    expect(topics?.chips.find((chip) => chip.keyword === "compassion")?.asked).toBe(false)
  })
})

describe("speaker switches", () => {
  it("a switch from an NPC to Lord British starts a fresh session", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("heal")
    h.tk.talkLine("ui:discourse_castle:17", ["Avatar"])
    const view = h.tk.view()
    expect(view.speaker).toBe("lordBritish")
    expect(group(view, "공통")?.chips.find((chip) => chip.keyword === "health")).toBeUndefined()
  })

  it("the end delay reuses the focus-return delay", () => {
    expect(TALK_END_DELAY_MS).toBe(400)
  })
})
// User report 2026-10-05: during the ask-pause (OP_PAUSE_ASK -> native
// waitAnyKey) the keyword menu vanished after TALK_END_DELAY_MS and only came
// back when a click advanced the engine. The engine now reports the key wait.
describe("keyword menu during a native key wait", () => {
  it("stays visible while the engine waits for a key after a reply", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.inputEcho("job")
    h.tk.promptClosed()
    h.tk.keyWait(true)
    h.advance(TALK_END_DELAY_MS * 10)
    expect(h.tk.view().active).toBe(true)
  })

  it("ends normally if no prompt reopens after the key wait", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.promptClosed()
    h.tk.keyWait(true)
    h.tk.keyWait(false)
    h.advance(TALK_END_DELAY_MS)
    expect(h.tk.view().active).toBe(false)
  })

  it("ignores key waits when no conversation is open", () => {
    const h = harness()
    h.tk.keyWait(true)
    expect(h.tk.view().active).toBe(false)
  })
})

// User report 2026-10-05 (Sage Deli): while the engine waits for a one-key
// yes/no choice, clicking a topic chip ("보석") was rejected with
// "[한글 입력 거부] 이 낱말에 대응하는 선택지 답을 찾을 수 없습니다". During a
// choice prompt only the answer chips make sense.
describe("keyword menu during a one-key choice prompt", () => {
  it("shows only the answer chips (예/아니오), not topics or common words", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.promptOpened(PROMPT_KIND_CHOICE)
    const titles = h.tk.view().groups.map((g) => g.title)
    expect(titles).toEqual(["대답"])
  })

  it("brings the topic chips back once the choice prompt closes and a text prompt opens", () => {
    const h = harness()
    openNpcConversation(h.tk)
    h.tk.promptOpened(PROMPT_KIND_CHOICE)
    h.tk.promptClosed()
    h.tk.promptOpened(0)
    expect(h.tk.view().groups.map((g) => g.title)).toContain("공통")
  })
})

// User report 2026-10-05: during the key wait after a reply, a chip click was
// rejected ("지금은 열린 입력 요청이 없습니다"). The shell needs to know the
// engine is waiting for a key so a click can continue it instead.
describe("keyWaiting", () => {
  it("is true only between keyWait(true) and keyWait(false) of an open conversation", () => {
    const h = harness()
    expect(h.tk.keyWaiting()).toBe(false)
    openNpcConversation(h.tk)
    h.tk.keyWait(true)
    expect(h.tk.keyWaiting()).toBe(true)
    h.tk.keyWait(false)
    expect(h.tk.keyWaiting()).toBe(false)
  })
})
