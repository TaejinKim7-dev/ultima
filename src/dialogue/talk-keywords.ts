// Todo 48: conversation state that produces the usable talk-keyword chips.
//
// The player asked (2026-10-04) to see, during a conversation, which
// keywords work. This pure module keeps the conversation state from the
// talk channel (src/shell.ts feeds it the same lines/echoes/prompts the
// panel sees) and answers two questions:
//   - `view()`: what chips to show (common keywords, this NPC's topic
//     glosses, the answer group while a question is open, and the Lord
//     British / Hawkwind keyword lists), with which ones were already asked;
//   - `topicAliases()`: the per-NPC Korean gloss -> keyword overlay that
//     `withTopicAliases` merges over the global alias table while a TLK
//     conversation is active.
//
// Native facts this module mirrors (verified against the sources, not
// guessed -- see the Todo 48 plan and the test file for the exact lines):
//   - runTalkDialogue (vendor/xu4/src/discourse_tlk.cpp) matches input
//     against topic1, topic2 (prefix of the topic's own length), then
//     "job" (3), "heal" (4), then look/name/give/join (4); "bye" (3) is
//     checked first and ends the conversation. Every input echoes through
//     `talkTextReceiver.input()` (`TALK_INPUT`).
//   - The castle loops (discourse_castle.cpp) send NO input echo; a
//     keyword reply carries `@avatar.exe:lordBritishText:<k>` (k is the
//     lbKeyLine index), and Hawkwind's lines carry `@avatar.exe:hawkwindText:<v>`.
//   - The talk "You meet" line is `ui:discourse_tlk:1`; Lord British's
//     opening lines are `ui:discourse_castle:12/13/17`; Hawkwind's welcome
//     is `@avatar.exe:hawkwindText:43` (40 when the avatar is disabled).
//   - Only ReadStringController (TEXT) and ReadChoiceController (CHOICE)
//     report open/close; waitAnyKey pauses report nothing, so the 400 ms
//     end signal fires during the ask-pause too -- hence the stash.
//
// Pure (no DOM, no engine; injected timers/lookups) so it is unit-testable.

import { FOCUS_RETURN_DELAY_MS } from "../i18n/focus-return.ts"

export type TalkSpeaker = "npc" | "lordBritish" | "hawkwind"

/** One talkable NPC topic (see src/i18n/localization.ts's NpcTopic). */
export interface NpcTopic {
  readonly keyword: string
  readonly gloss: string
}

export interface TalkKeywordDeps {
  /** Resolves the two topic glosses of a `MAP:npcIndex` NPC key. */
  npcTopics(key: string): readonly NpcTopic[]
  /** The Korean label of a canonical common keyword (e.g. "name" -> "이름"), if any. */
  aliasFor(canonical: string): string | undefined
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(id: unknown): void
  /** Fired whenever the view may have changed; the shell re-renders (skipping unchanged signatures). */
  onChange(): void
}

/** One clickable chip: its Korean label, the keyword it submits, and whether it was asked already. */
export interface TalkChip {
  readonly label: string
  readonly keyword: string
  /** The raw English keyword shown as secondary text on an NPC topic chip. */
  readonly secondary?: string
  readonly asked: boolean
}

export interface TalkKeywordGroup {
  readonly title: string
  readonly chips: readonly TalkChip[]
}

export interface TalkKeywordsView {
  readonly active: boolean
  readonly speaker: TalkSpeaker | null
  readonly npcKey: string | null
  readonly groups: readonly TalkKeywordGroup[]
}

export interface TalkKeywords {
  talkLine(templateId: string | undefined, args: readonly (string | null)[]): void
  inputEcho(text: string): void
  submitted(text: string): void
  promptOpened(kind: number): void
  promptClosed(): void
  /** The engine started (true) / stopped (false) waiting for any key (native waitAnyKey). */
  keyWait(on: boolean): void
  view(): TalkKeywordsView
  topicAliases(): readonly NpcTopic[]
}

/** The native prompt-epoch kind for `readChoice()` (event.cpp U4_WEB_PROMPT_CHOICE). */
export const PROMPT_KIND_CHOICE = 1 as const

/** The end signal reuses Todo 35's close/reopen delay. */
export const TALK_END_DELAY_MS = FOCUS_RETURN_DELAY_MS

/** The common-keyword order a town NPC conversation shows (canonical keywords). */
export const NPC_COMMON_KEYWORDS: readonly string[] = ["name", "job", "health", "look", "join", "give", "bye"]

/** Lord British's common group (the same four as every speaker). */
export const LB_COMMON_KEYWORDS: readonly string[] = ["name", "job", "look", "bye"]

/** Hawkwind's common group is just the farewell. */
export const HAWKWIND_COMMON_KEYWORDS: readonly string[] = ["bye"]

/** Lord British's topic keywords in native `lbKeyLine` order (discourse_castle.cpp:254), then help and heal. */
export const LB_TOPIC_KEYWORDS: readonly string[] = [
  "truth", "love", "courage", "honesty", "compassion", "valor", "justice", "sacrifice",
  "honor", "spirituality", "humility", "pride", "avatar", "quest", "britannia", "ankh",
  "abyss", "mondain", "minax", "exodus", "virtue", "help", "heal"
]

/**
 * The FULL lbKeyLine keyword order -- including name/look/job, which the
 * menu shows in the common group. A keyword reply carries
 * `@avatar.exe:lordBritishText:<k>` where k is this array's index, so the
 * response-id -> keyword mapping must use THIS order, not LB_TOPIC_KEYWORDS.
 */
const LB_RESPONSE_KEYWORDS: readonly string[] = [
  "name", "look", "job", "truth", "love", "courage", "honesty", "compassion",
  "valor", "justice", "sacrifice", "honor", "spirituality", "humility", "pride",
  "avatar", "quest", "britannia", "ankh", "abyss", "mondain", "minax", "exodus", "virtue"
]

/** The eight virtue keywords Hawkwind answers, in native Virtue enum order. */
export const HAWKWIND_TOPIC_KEYWORDS: readonly string[] = [
  "honesty", "compassion", "valor", "justice", "sacrifice", "honor", "spirituality", "humility"
]

interface Session {
  readonly speaker: TalkSpeaker
  readonly npcKey: string | null
  readonly topics: readonly NpcTopic[]
  asked: Set<string>
  questionPending: boolean
  choicePending: boolean
  /** False once the 400 ms end signal fired -- the menu hides but the session is kept (the stash). */
  active: boolean
}

function startsWithPrefix(text: string, prefix: string): boolean {
  return text.toLowerCase().startsWith(prefix.toLowerCase())
}

/** Mirrors `strncasecmp(K, in, 4)` -- at least 4 chars of input matching the keyword's first 4. */
function matchesKeyword4(keyword: string, input: string): boolean {
  return input.length >= 4 && startsWithPrefix(input, keyword.slice(0, 4))
}

/** Mirrors `strncasecmp("job", in, 3)` / `strncasecmp("bye", in, 3)`. */
function matchesKeyword3(keyword: string, input: string): boolean {
  return input.length >= 3 && startsWithPrefix(input, keyword)
}

/** Mirrors the TLK topic match `strncasecmp(topic, input, strlen(topic))`. */
function matchesTopic(keyword: string, input: string): boolean {
  return startsWithPrefix(input, keyword)
}

function detectSpeaker(
  templateId: string | undefined,
  args: readonly (string | null)[]
): { speaker: TalkSpeaker; npcKey: string | null; identified: boolean } {
  for (const arg of args) {
    if (arg === null) continue
    if (arg.startsWith("@avatar.exe:hawkwindText:")) return { speaker: "hawkwind", npcKey: null, identified: true }
    if (arg.startsWith("@avatar.exe:lordBritishText:")) return { speaker: "lordBritish", npcKey: null, identified: true }
    const match = /^@([A-Z]+:\d+):/.exec(arg)
    if (match !== null) return { speaker: "npc", npcKey: match[1]!, identified: true }
  }
  if (templateId !== undefined && templateId.startsWith("ui:discourse_castle:")) {
    return { speaker: "lordBritish", npcKey: null, identified: true }
  }
  return { speaker: "npc", npcKey: null, identified: false }
}

function isOpeningLine(
  speaker: TalkSpeaker,
  templateId: string | undefined,
  args: readonly (string | null)[]
): boolean {
  if (speaker === "npc") {
    // runTalkDialogue's "\nYou meet %s\n" -- the conversation's first line.
    return templateId === "ui:discourse_tlk:1"
  }
  if (speaker === "hawkwind") {
    return args.some((arg) => arg === "@avatar.exe:hawkwindText:40" || arg === "@avatar.exe:hawkwindText:43")
  }
  // Lord British: resurrect / welcome / first meeting.
  return templateId === "ui:discourse_castle:12" || templateId === "ui:discourse_castle:13" || templateId === "ui:discourse_castle:17"
}

function fieldOf(arg: string): string | undefined {
  const match = /^@[A-Z]+:\d+:([a-z0-9]+)$/.exec(arg)
  return match === null ? undefined : match[1]
}

export function createTalkKeywords(deps: TalkKeywordDeps): TalkKeywords {
  let session: Session | null = null
  let timer: unknown = null
  let lastInputWasBye = false

  function cancelTimer(): void {
    if (timer !== null) {
      deps.clearTimer(timer)
      timer = null
    }
  }

  function freshSession(speaker: TalkSpeaker, npcKey: string | null): Session {
    cancelTimer()
    const next: Session = {
      speaker,
      npcKey,
      topics: speaker === "npc" && npcKey !== null ? deps.npcTopics(npcKey) : [],
      asked: new Set(),
      questionPending: false,
      choicePending: false,
      active: true
    }
    session = next
    lastInputWasBye = false
    return next
  }

  function noteBye(): void {
    lastInputWasBye = true
  }

  function chipChip(label: string, keyword: string, secondary: string | undefined, asked: boolean): TalkChip {
    return { label, keyword, ...(secondary !== undefined ? { secondary } : {}), asked }
  }

  function commonGroup(keywords: readonly string[]): TalkKeywordGroup {
    const chips: TalkChip[] = []
    for (const keyword of keywords) {
      const label = deps.aliasFor(keyword)
      if (label === undefined) continue
      chips.push(chipChip(label, keyword, undefined, session?.asked.has(keyword) ?? false))
    }
    return { title: "공통", chips }
  }

  function topicChips(keywords: readonly string[], topics: readonly NpcTopic[]): TalkKeywordGroup {
    // The NPC group shows the two glosses (keyword as secondary text); the
    // castle groups show the keyword alias labels in native order.
    if (topics.length > 0) {
      const chips = topics.map((topic) =>
        chipChip(topic.gloss, topic.keyword, topic.keyword, session?.asked.has(topic.keyword) ?? false)
      )
      return { title: "이 사람에게 물어볼 것", chips }
    }
    const chips = keywords.map((keyword) => {
      const label = deps.aliasFor(keyword)
      return chipChip(label ?? keyword, keyword, undefined, session?.asked.has(keyword) ?? false)
    })
    return { title: "이 사람에게 물어볼 것", chips }
  }

  function answerGroup(): TalkKeywordGroup {
    return {
      title: "대답",
      chips: [
        chipChip("예", "yes", undefined, session?.asked.has("yes") ?? false),
        chipChip("아니오", "no", undefined, session?.asked.has("no") ?? false)
      ]
    }
  }

  function view(): TalkKeywordsView {
    if (session === null || !session.active) {
      return { active: false, speaker: null, npcKey: null, groups: [] }
    }
    const groups: TalkKeywordGroup[] = []
    // User report 2026-10-05 (Sage Deli): a one-key yes/no prompt accepts only
    // its answer, so offering topic chips there just produced rejections.
    if (session.choicePending) {
      groups.push(answerGroup())
      return { active: true, speaker: session.speaker, npcKey: session.npcKey, groups }
    }
    if (session.speaker === "npc") {
      groups.push(commonGroup(NPC_COMMON_KEYWORDS))
      groups.push(topicChips([], session.topics))
    } else if (session.speaker === "lordBritish") {
      groups.push(commonGroup(LB_COMMON_KEYWORDS))
      groups.push(topicChips(LB_TOPIC_KEYWORDS, []))
    } else {
      groups.push(commonGroup(HAWKWIND_COMMON_KEYWORDS))
      groups.push(topicChips(HAWKWIND_TOPIC_KEYWORDS, []))
    }
    if (session.questionPending || session.choicePending) {
      groups.push(answerGroup())
    }
    return { active: true, speaker: session.speaker, npcKey: session.npcKey, groups }
  }

  function talkLine(templateId: string | undefined, args: readonly (string | null)[]): void {
    const { speaker, npcKey, identified } = detectSpeaker(templateId, args)
    if (!identified) {
      // A line with no speaker signal (a bare "\n" CRLF) never starts or
      // resets a conversation; it only carries field args (none here).
      if (session !== null) {
        deps.onChange()
      }
      return
    }
    const opening = isOpeningLine(speaker, templateId, args)

    if (session === null || session.speaker !== speaker || (speaker === "npc" && session.npcKey !== npcKey) || opening) {
      freshSession(speaker, npcKey)
    } else if (!session.active) {
      // A later line from the same speaker restores the stash -- unless the
      // conversation already ended with bye.
      if (lastInputWasBye) {
        freshSession(speaker, npcKey)
      } else {
        session.active = true
      }
    }

    if (session === null) return

    for (const arg of args) {
      if (arg === null) continue
      if (arg.startsWith("@avatar.exe:lordBritishText:")) {
        const index = Number(arg.split(":").pop())
        const keyword = LB_RESPONSE_KEYWORDS[index]
        if (keyword !== undefined) {
          session.asked.add(keyword)
        }
        continue
      }
      const field = fieldOf(arg)
      if (field !== undefined && session.speaker === "npc") {
        if (field === "question") {
          session.questionPending = true
        } else {
          // A yes/no field, or any other field of that NPC, clears it.
          session.questionPending = false
        }
      }
    }
    deps.onChange()
  }

  /** Marks the chip a native echo/submission resolves to, in the engine's own matching order. */
  function noteAsked(session: Session, input: string): void {
    if (session.speaker === "npc") {
      // The TLK loop checks bye first, then topic1/topic2/job/heal, then
      // look/name/give/join (discourse_tlk.cpp runTalkDialogue / U4Talk_dialogue).
      if (matchesKeyword3("bye", input)) {
        session.asked.add("bye")
        noteBye()
        return
      }
      for (const topic of session.topics) {
        if (matchesTopic(topic.keyword, input)) {
          session.asked.add(topic.keyword)
          return
        }
      }
      if (matchesKeyword3("job", input)) {
        session.asked.add("job")
        return
      }
      if (matchesKeyword4("heal", input)) {
        session.asked.add("health")
        return
      }
      if (matchesKeyword4("look", input)) {
        session.asked.add("look")
        return
      }
      if (matchesKeyword4("name", input)) {
        session.asked.add("name")
        return
      }
      if (matchesKeyword4("give", input)) {
        session.asked.add("give")
        return
      }
      if (matchesKeyword4("join", input)) {
        session.asked.add("join")
        return
      }
      return
    }

    // Castle loops send no echo, but a Korean submission still resolves to
    // the keyword -- mark it (the response id also marks it for Lord
    // British, so this is idempotent).
    if (matchesKeyword3("bye", input)) {
      session.asked.add("bye")
      noteBye()
      return
    }
    if (session.speaker === "lordBritish") {
      for (const keyword of LB_TOPIC_KEYWORDS) {
        if (keyword === "help" || keyword === "heal") {
          if (startsWithPrefix(input, keyword)) {
            session.asked.add(keyword)
            return
          }
          continue
        }
        if (matchesKeyword4(keyword, input)) {
          session.asked.add(keyword)
          return
        }
      }
      return
    }
    for (const keyword of HAWKWIND_TOPIC_KEYWORDS) {
      if (matchesKeyword4(keyword, input)) {
        session.asked.add(keyword)
        return
      }
    }
  }

  function inputEcho(text: string): void {
    if (session === null || session.speaker !== "npc") return
    // The echo of a yes/no answer (talkYNResponse) must not mark a chip.
    if (session.questionPending) return
    noteAsked(session, text)
    deps.onChange()
  }

  function submitted(text: string): void {
    if (session === null) return
    noteAsked(session, text)
    deps.onChange()
  }

  function promptOpened(kind: number): void {
    cancelTimer()
    if (session === null) {
      deps.onChange()
      return
    }
    if (kind === PROMPT_KIND_CHOICE) {
      session.choicePending = true
      session.active = true
    } else if (!lastInputWasBye) {
      // A text prompt reopening in the same conversation restores a stashed
      // session (the ask-pause can exceed the end delay).
      session.active = true
    }
    deps.onChange()
  }

  function promptClosed(): void {
    if (session === null) {
      deps.onChange()
      return
    }
    if (session.choicePending) {
      session.choicePending = false
    }
    cancelTimer()
    timer = deps.setTimer(() => {
      timer = null
      if (session !== null) {
        // Soft end: hide the menu, keep the session (the stash) so a later
        // line from the same speaker can restore the asked marks.
        session.active = false
      }
      deps.onChange()
    }, TALK_END_DELAY_MS)
    deps.onChange()
  }

  // User report 2026-10-05: an ask-pause (OP_PAUSE_ASK -> waitAnyKey) is not
  // the end of a conversation. While the engine waits for a key the end timer
  // is held; when the wait ends, the normal close-delay check runs again.
  function keyWait(on: boolean): void {
    if (session === null) return
    if (on) {
      if (timer !== null) {
        cancelTimer()
        session.active = true
        deps.onChange()
      }
      return
    }
    promptClosed()
  }

  function topicAliases(): readonly NpcTopic[] {
    return session !== null && session.speaker === "npc" ? session.topics : []
  }

  return { talkLine, inputEcho, submitted, promptOpened, promptClosed, keyWait, view, topicAliases }
}