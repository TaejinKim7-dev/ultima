// Todo 13: Korean NPC-keyword aliasing and prompt-kind-specific input rules.
//
// This module is intentionally pure (no DOM, no engine, no bridge I/O -- see
// `tests/unit/korean-aliases.test.ts`). It decides, client-side, what ASCII
// text (if any) should be synthesized toward the real native input path for
// a given prompt kind -- it never renames or bypasses any native comparison
// string, and it never writes anything into a native save-file field.
//
// Why aliasing has to happen HERE, client-side, rather than by "just letting
// the engine understand Korean": the native engine can never see Korean
// input at all, for ANY prompt kind. `vendor/xu4/src/event.cpp`'s
// `ReadStringController::keyPressed()` only accepts key codes below
// `MAX_BITS` (128) -- a plain ASCII bitset -- so a Hangul code point cannot
// reach the native input buffer no matter how it arrives (typed directly,
// pasted, or IME-composed). The only way Korean text can ever affect the
// game is if something upstream of that native controller first turns it
// into the literal ASCII string a sighted English-speaking player would
// have typed, which is exactly what `resolveInput` computes.
//
// Native comparison rules this module was designed against (read from
// source, not guessed -- see the module doc comment in
// `tests/unit/korean-aliases.test.ts` for exact citations):
//   - `discourse_tlk.cpp`'s `runTalkDialogue()`: "bye" is a 3-byte prefix
//     match, "look"/"name"/"give"/"join" are 4-byte prefix matches (the
//     `inputEq` macro), "job" is a 3-byte prefix match, "heal" is a 4-byte
//     prefix match (matches both "heal" and "health"). NPC-specific
//     topic1/topic2 are prefix-matched the same way, with the comparison
//     length equal to the topic string's own length.
//   - `discourse_tlk.cpp`'s `talkYNResponse()`: only the FIRST character of
//     the input is compared against 'y'/'Y'/'n'/'N'.
//   - `intro.cpp:823`: the avatar name prompt is
//     `EventHandler::readStringView(12, ...)` -- max 12 ASCII characters,
//     later `strcpy`'d into `savegame.h`'s fixed `char name[16]` on-disk
//     field (never Korean/UTF-8 -- see the "Must not accept Korean in
//     avatar name save field" rule).
//   - `event.cpp`'s `ReadChoiceController` (behind
//     `EventHandler::readChoice`): reads exactly ONE key and compares it
//     against the caller's ASCII choice set -- "yn \n\033" (Lord British's
//     "Art thou well?", `discourse_castle.cpp:510`), "mf" (the intro sex
//     prompt, `intro.cpp:999`, `if (sexChoice == 'm')`), "ab" (the gypsy's
//     virtue question, `intro.cpp:1254`, `doQuestion(choice == 'a' ? 0 :
//     1)`). See `resolveChoiceInput`/`CHOICE_ANSWER_CANONICALS` below.
//
// Because every alias this module can ever produce is fed back through the
// SAME native prefix matcher, aliasing must produce the *canonical* English
// keyword (or a prefix of it long enough to satisfy the native comparison
// length), never a shortened/rewritten form -- see the invariant test in
// `tests/unit/korean-aliases.test.ts` that checks every real
// `locales/ko/aliases.json` canonical against the native 16-byte interest
// prompt buffer.

/**
 * The distinct prompt shapes this module knows input rules for. Mirrors
 * `src/bridge/types.ts`'s `PromptKind` (kept as a separate literal union
 * here so this module stays free of any bridge/DOM dependency; the two are
 * intentionally identical value sets).
 */
export type ResolveKind = "text" | "yesno" | "direction" | "number" | "avatar-name" | "command"

/** One raw alias-table entry, matching `locales/ko/aliases.json`'s schema (only the two fields this module reads). */
export interface AliasSourceEntry {
  readonly alias: string
  readonly canonical: string
}

/** A resolved (normalized alias -> canonical English keyword) lookup table. Build with {@link buildAliasTable}. */
export interface AliasTable {
  readonly byNormalizedAlias: ReadonlyMap<string, string>
}

/**
 * Normalizes alias text for matching: Unicode NFC (so decomposed Hangul
 * jamo input matches a precomposed-syllable alias table entry), trimmed,
 * internal whitespace collapsed, lower-cased (a no-op for Hangul, meaningful
 * for the occasional ASCII alias). Mirrors `scripts/lib/alias-check.mjs`'s
 * `normalizeAliasText` exactly -- that script's build-time collision check
 * and this runtime resolver must never disagree about what "the same
 * alias" means, so this is copied rather than imported (that script lives
 * under `scripts/lib/`, a Node CLI tool's home, not a browser-bundled
 * runtime dependency).
 */
function normalizeAliasText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Builds a lookup table from a `locales/ko/aliases.json`-shaped entry
 * record. Entries whose `alias` is empty (the scaffold's "pending, not yet
 * translated" convention -- see that file's own `$notes`) are skipped: an
 * empty string is not an alias, and must never match an empty/whitespace
 * raw input.
 */
export function buildAliasTable(entries: Readonly<Record<string, AliasSourceEntry>>): AliasTable {
  const byNormalizedAlias = new Map<string, string>()
  for (const entry of Object.values(entries)) {
    const normalized = normalizeAliasText(entry.alias)
    if (normalized.length === 0) {
      continue
    }
    byNormalizedAlias.set(normalized, entry.canonical)
  }
  return { byNormalizedAlias }
}

/**
 * Layers `overlay` on top of `base` (overlay entries win on a normalized-
 * alias collision). Models Todo 13's "context-aware" requirement: a
 * specific NPC's topic1/topic2 Korean aliases (once a future Todo wires
 * live NPC context through the bridge -- see this module's own doc comment
 * in `tests/unit/korean-aliases.test.ts` on what is and isn't wired yet)
 * are merged over the 9 always-available global keywords, never replacing
 * them wholesale.
 */
export function mergeAliasTables(base: AliasTable, overlay: AliasTable): AliasTable {
  return { byNormalizedAlias: new Map([...base.byNormalizedAlias, ...overlay.byNormalizedAlias]) }
}

/** Native `discourse_tlk.cpp`'s `gameGetInput(16)` -- the NPC "Your Interest:" prompt's max buffer size, in bytes. */
export const NPC_INTEREST_MAX_BYTES = 16 as const

/** Native `intro.cpp:823`'s `EventHandler::readStringView(12, ...)` -- the avatar name prompt's max length, in ASCII characters. */
export const AVATAR_NAME_MAX_CHARS = 12 as const

/** Why a `resolveInput` call was rejected. */
export type RejectReason =
  | "korean-not-allowed"
  | "unknown-keyword"
  | "too-long"
  | "invalid-charset"
  /** Todo 30: the word is a real alias, but its canonical keyword is not a single-key choice answer. */
  | "not-a-choice-answer"
  /** Todo 30: nothing was submitted; synthesizing a bare Enter would pick one of several readChoice sets' own answers. */
  | "empty-answer"

export interface ResolvedOk {
  readonly ok: true
  /** The exact ASCII text to synthesize toward the real native input path -- never Korean, never rewritten beyond what this module documents. */
  readonly text: string
}

export interface ResolvedReject {
  readonly ok: false
  readonly reason: RejectReason
  /** A prompt-kind-specific, user-facing Korean message (never a single generic string across kinds). */
  readonly message: string
}

export type ResolveResult = ResolvedOk | ResolvedReject

function isAscii(text: string): boolean {
  for (const ch of text) {
    const codePoint = ch.codePointAt(0)
    if (codePoint !== undefined && codePoint > 0x7f) {
      return false
    }
  }
  return true
}

function ok(text: string): ResolvedOk {
  return { ok: true, text }
}

function reject(reason: RejectReason, message: string): ResolvedReject {
  return { ok: false, reason, message }
}

const AVATAR_NAME_CHARSET = /^[A-Za-z0-9 ]*$/
const NUMBER_CHARSET = /^[0-9 ]*$/

const KOREAN_REJECT_MESSAGES: Readonly<Record<"avatar-name" | "number" | "direction" | "command", string>> = {
  "avatar-name": "아바타 이름에는 한글을 사용할 수 없습니다. 영문/숫자만 입력하세요.",
  number: "숫자 입력란에는 한글을 사용할 수 없습니다. 숫자만 입력하세요.",
  direction: "이동 방향 입력에는 한글을 사용할 수 없습니다. 방향키를 사용하세요.",
  command: "명령 입력에는 한글을 사용할 수 없습니다. 지정된 명령 키를 사용하세요."
}

/** Resolves the canonical "yes"/"no" answer for a Korean word, restricted to entries whose canonical is actually "yes"/"no" (an unrelated alias like the "job" keyword must never answer a yes/no prompt). */
function resolveYesNoAlias(normalizedRaw: string, table: AliasTable): string | undefined {
  const canonical = table.byNormalizedAlias.get(normalizedRaw)
  if (canonical === "yes" || canonical === "no") {
    return canonical
  }
  return undefined
}

/**
 * Resolves raw prompt input for a specific native prompt kind. Pure, total,
 * never throws. See the module doc comment for the native rules this
 * mirrors and the per-kind rationale below.
 */
export function resolveInput(kind: ResolveKind, raw: string, table: AliasTable): ResolveResult {
  switch (kind) {
    case "text": {
      // NPC free-answer keyword prompt (discourse_tlk.cpp's "Your
      // Interest:" loop). ASCII passes through completely unchanged --
      // rewriting/truncating/case-folding it would change which native
      // prefix branch matches. Korean is exact-matched (NFC-normalized)
      // against the alias table; an empty or unmatched Korean string is
      // rejected outright rather than passed through as garbage the native
      // bitset would silently swallow character-by-character anyway.
      if (isAscii(raw)) {
        return ok(raw)
      }
      const normalized = normalizeAliasText(raw)
      const canonical = table.byNormalizedAlias.get(normalized)
      if (canonical === undefined) {
        return reject("unknown-keyword", `이 낱말에 대응하는 대화 키워드를 찾을 수 없습니다: "${raw}"`)
      }
      return ok(canonical)
    }

    case "yesno": {
      // talkYNResponse() only ever reads the FIRST character of the
      // input -- any ASCII string (not just a bare "y"/"n") is native's own
      // business to accept or re-prompt on, so it always passes through.
      if (isAscii(raw)) {
        return ok(raw)
      }
      const normalized = normalizeAliasText(raw)
      const canonical = resolveYesNoAlias(normalized, table)
      if (canonical === undefined) {
        return reject("unknown-keyword", "예/아니오로만 답할 수 있습니다.")
      }
      return ok(canonical)
    }

    case "avatar-name": {
      // Must NOT accept Korean here, ever -- not aliased, not
      // transliterated (see this Todo's own "Must not accept Korean in
      // avatar name save field" rule; savegame.h's `char name[16]` is a
      // fixed-size C buffer with no Korean/UTF-8 encoding).
      if (!isAscii(raw)) {
        return reject("korean-not-allowed", KOREAN_REJECT_MESSAGES["avatar-name"])
      }
      if (raw.length > AVATAR_NAME_MAX_CHARS) {
        return reject(
          "too-long",
          `아바타 이름은 ${AVATAR_NAME_MAX_CHARS}자 이하여야 합니다 (입력: ${raw.length}자).`
        )
      }
      if (!AVATAR_NAME_CHARSET.test(raw)) {
        return reject("invalid-charset", "아바타 이름에는 영문자, 숫자, 공백만 사용할 수 있습니다.")
      }
      return ok(raw)
    }

    case "number": {
      if (!isAscii(raw)) {
        return reject("korean-not-allowed", KOREAN_REJECT_MESSAGES.number)
      }
      if (!NUMBER_CHARSET.test(raw)) {
        return reject("invalid-charset", "숫자와 공백만 입력할 수 있습니다.")
      }
      return ok(raw)
    }

    case "direction": {
      // Native reads a direction directly from arrow-key codes
      // (`ReadDirController::keyPressed`) -- there is no native text buffer
      // here at all, so the only real rule is "Korean can never mean
      // anything in this context."
      if (!isAscii(raw)) {
        return reject("korean-not-allowed", KOREAN_REJECT_MESSAGES.direction)
      }
      return ok(raw)
    }

    case "command": {
      // Native reads a single accepted key directly
      // (`ReadChoiceController`/`AlphaActionController`) -- same rationale
      // as "direction".
      //
      // Todo 30: the readChoice() PROMPTS that a player must be able to
      // answer in Korean (the Lord British heal question, the intro sex
      // prompt, the gypsy virtue question) are NOT handled here: they are
      // reported by the engine as their own prompt epoch kind, and go
      // through `resolveChoiceInput` instead. This kind stays exactly as
      // Todo 13 defined it.
      if (!isAscii(raw)) {
        return reject("korean-not-allowed", KOREAN_REJECT_MESSAGES.command)
      }
      return ok(raw)
    }
  }
}

// ---------------------------------------------------------------------------
// Todo 30: the readChoice() path (single-key choice prompts).
// ---------------------------------------------------------------------------

/**
 * The exact, closed set of `locales/ko/aliases.json` canonical keywords that
 * may answer a native `readChoice()` prompt, and the single key each one
 * stands for.
 *
 * A canonical is on this list only when a real xu4 call site asks a
 * progression-critical question that this answer is one of, read from source:
 *   - "yes" -> 'y' / "no" -> 'n': `discourse_castle.cpp:510`
 *     `readChoice("yn \n\033")`, answered by `lordBritishHeal(...)`.
 *   - "male" -> 'm' / "female" -> 'f': `intro.cpp:999` `readChoice("mf")`,
 *     answered by `if (sexChoice == 'm')`.
 *   - "choiceA" -> 'a' / "choiceB" -> 'b': `intro.cpp:1254`
 *     `readChoice("ab")`, answered by `doQuestion(choice == 'a' ? 0 : 1)`.
 *
 * The keys are written out rather than derived from each canonical's first
 * character on purpose: only `ReadChoiceController`'s call site decides what a
 * choice key is, and the engine must never be second-guessed from a keyword's
 * spelling (that is what made the "first letter of any canonical" idea wrong
 * in the first place).
 *
 * The gypsy question is NOT a yes/no question -- its two answers are two
 * different virtues, and the Korean question text labels them literally
 * "A)"/"B)" -- so 가/나 (the Korean option labels for that same A/B pair) map
 * to a/b and not 예/아니오.
 *
 * Being a closed set is the point: an alias that belongs to a *different*
 * prompt kind (안녕 -> "bye", 건강 -> "health") must never be truncated to
 * its first letter and pressed as a choice. Typing 안녕 during the gypsy's
 * question would otherwise silently answer "B)" and change the avatar's
 * class. See `choiceAnswerKeys` and the invariant test in
 * `tests/unit/readchoice-korean-answer.test.ts`.
 */
export const CHOICE_ANSWER_KEYS: Readonly<Record<string, string>> = {
  yes: "y",
  no: "n",
  male: "m",
  female: "f",
  choiceA: "a",
  choiceB: "b"
}

/** The canonicals allowed to answer a choice prompt -- the keys of {@link CHOICE_ANSWER_KEYS}. */
export const CHOICE_ANSWER_CANONICALS: readonly string[] = Object.keys(CHOICE_ANSWER_KEYS)

const CHOICE_ANSWER_MESSAGE = "이 단어는 예/아니오, 남성/여성, 또는 선택지 답에 해당하지 않습니다. 화면에 표시된 선택지를 입력하세요."
const CHOICE_UNKNOWN_MESSAGE = "이 낱말에 대응하는 선택지 답을 찾을 수 없습니다: 화면에 표시된 선택지를 입력하세요."
const CHOICE_EMPTY_MESSAGE = "답을 입력하세요."

/**
 * The single answer key a canonical keyword stands for on a choice prompt, or
 * `undefined` when the canonical is not a choice answer at all. Only one key is
 * ever returned, because that is all `ReadChoiceController` compares.
 */
export function choiceAnswerKey(canonical: string): string | undefined {
  return CHOICE_ANSWER_KEYS[canonical]
}

/** Every key a Korean word can press on a choice prompt, from this table, sorted. */
export function choiceAnswerKeys(table: AliasTable): string[] {
  const keys = new Set<string>()
  for (const canonical of table.byNormalizedAlias.values()) {
    const key = choiceAnswerKey(canonical)
    if (key !== undefined) {
      keys.add(key)
    }
  }
  return [...keys].sort()
}

/**
 * Resolves raw input for a native `readChoice()` prompt: one keystroke, one
 * accepted key, no trailing Enter.
 *
 * Why a Korean answer can never be a multi-byte key all the way down: the
 * engine's key path is single-byte by construction --
 * `ReadStringController::keyPressed` only accepts keys below `MAX_BITS`
 * (128) through an ASCII accepted-chars bitset, and
 * `ReadChoiceController::keyPressed` compares one key against an ASCII
 * choice set. GLFW reports key *codes*, so an IME-composed Hangul syllable
 * has no key code to report in the first place. The narrow, correct solution
 * is therefore to resolve the Korean word to the canonical English choice key
 * HERE, in the input path, and deliver that key as a real keystroke toward
 * the real controller -- never a panel-side cosmetic translation, and never a
 * change to the engine's comparison values.
 */
export function resolveChoiceInput(raw: string, table: AliasTable): ResolveResult {
  if (raw.length === 0) {
    return reject("empty-answer", CHOICE_EMPTY_MESSAGE)
  }
  // ASCII is xu4's own business, exactly as on the "text" path: an upper-case
  // 'Y' is folded by the controller itself, and a multi-character ASCII
  // answer is accepted or re-prompted on by the controller itself.
  if (isAscii(raw)) {
    return ok(raw)
  }
  const canonical = table.byNormalizedAlias.get(normalizeAliasText(raw))
  if (canonical === undefined) {
    return reject("unknown-keyword", CHOICE_UNKNOWN_MESSAGE)
  }
  const answerKey = choiceAnswerKey(canonical)
  if (answerKey === undefined) {
    return reject("not-a-choice-answer", CHOICE_ANSWER_MESSAGE)
  }
  return ok(answerKey)
}
