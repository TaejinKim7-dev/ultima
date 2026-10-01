import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import aliasesSchema from "../../locales/ko/aliases.json" with { type: "json" }
import { GENERATED_ALIASES } from "../../src/i18n/generated/strings.ts"
import {
  CHOICE_ANSWER_CANONICALS,
  CHOICE_ANSWER_KEYS,
  buildAliasTable,
  choiceAnswerKey,
  choiceAnswerKeys,
  resolveChoiceInput,
  resolveInput,
  type AliasTable
} from "../../src/i18n/korean-aliases.ts"

// Todo 30: Korean answers on the readChoice() path.
//
// THE DEFECT THIS TEST FILE PINS DOWN (read from source, not guessed):
//   - vendor/xu4/src/event.cpp's ReadStringController is the ONLY class
//     that opened/closed the web text-prompt epoch
//     (`u4_web_text_prompt_opened`/`_closed` -> Module.u4TextPrompt ->
//     src/i18n/text-prompt-gate.ts -> src/shell.ts's
//     #korean-keyword-input submit gate). ReadChoiceController -- the class
//     behind EventHandler::readChoice() -- never opened it, so the shell's
//     Korean field could never reach a choice prompt, and every progression
//     -critical yes/no (Lord British "Art thou well?",
//     vendor/xu4/src/discourse_castle.cpp:510), the intro sex prompt
//     (vendor/xu4/src/intro.cpp:999, "mf") and the gypsy's A)/B) virtue
//     question (vendor/xu4/src/intro.cpp:1254, "ab") rejected Korean.
//   - The NPC-talk (TLK) path is a DIFFERENT path and already worked:
//     discourse_tlk.cpp's gameGetInput(3) -> game.cpp's readString ->
//     ReadStringController, so 예/아니오 resolved there. Todo 30 must not
//     regress it -- see the "regression guard" describe block at the end.

const eventCpp = readFileSync("vendor/xu4/src/event.cpp", "utf8")
const shellTs = readFileSync("src/shell.ts", "utf8")

/** Source slice from one marker up to (not including) the next. */
function sliceBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from)
  expect(start, `marker not found: ${from}`).toBeGreaterThan(-1)
  const end = source.indexOf(to, start + from.length)
  return source.slice(start, end === -1 ? source.length : end)
}

const readStringClass = sliceBetween(eventCpp, "class ReadStringController", "class ReadChoiceController")
const readChoiceClass = sliceBetween(eventCpp, "class ReadChoiceController", "//----------------------------------------------------------------------------\n/**\n * A controller to read a direction")
const readStringCtor = sliceBetween(eventCpp, "ReadStringController::ReadStringController", "static void soundInvalidInput")
const readChoiceCtor = sliceBetween(eventCpp, "ReadChoiceController::ReadChoiceController", "bool ReadChoiceController::keyPressed")
const readChoiceKeyPressed = sliceBetween(eventCpp, "bool ReadChoiceController::keyPressed", "//----------------------------------------------------------------------------\n\n/**\n * A controller to read a direction")

function realTable(): AliasTable {
  return buildAliasTable(
    (aliasesSchema as { entries: Record<string, { alias: string; canonical: string }> }).entries
  )
}

function generatedTable(): AliasTable {
  return buildAliasTable(GENERATED_ALIASES)
}

describe("readChoice epoch: a choice prompt opens/closes the web text-prompt epoch like a string prompt", () => {
  it("ReadChoiceController's constructor opens the epoch, tagged as a choice prompt", () => {
    expect(readChoiceCtor).toMatch(/u4_web_text_prompt_opened\(\s*webPromptId\s*,\s*U4_WEB_PROMPT_CHOICE\s*\)/)
  })

  it("ReadChoiceController's destructor closes it, exactly like ReadStringController", () => {
    expect(readChoiceClass).toMatch(/~ReadChoiceController\(\)\s*\{[^}]*u4_web_text_prompt_closed\(webPromptId\)/)
    // The string controller's own close hook must be untouched.
    expect(readStringClass).toMatch(/~ReadStringController\(\)\s*\{[^}]*u4_web_text_prompt_closed\(webPromptId\)/)
  })

  it("both controllers draw epoch ids from ONE shared counter, so a choice id can never collide with a string id", () => {
    // Two independent `static int nextWebPromptId = 1;` counters would hand
    // out the SAME id for a string prompt and a choice prompt, and the
    // shell's text-prompt gate is keyed by id -- a colliding close() would
    // pop the wrong prompt and wedge the gate.
    expect(eventCpp.match(/static int nextWebPromptId/g) ?? []).toHaveLength(1)
    expect(readStringClass).not.toMatch(/static int nextWebPromptId/)
    expect(readStringCtor).toMatch(/allocWebPromptId\(\)/)
    expect(readChoiceCtor).toMatch(/allocWebPromptId\(\)/)
    expect(readChoiceClass).not.toMatch(/static int nextWebPromptId/)
  })

  it("every opened() hook has a matching closed() hook, so no prompt epoch can leak", () => {
    // A leaked epoch would leave the shell's gate permanently "open" and let
    // a Korean submission be synthesized into a prompt that is long gone.
    const opens = (eventCpp.match(/u4_web_text_prompt_opened\(webPromptId/g) ?? []).length
    const closes = (eventCpp.match(/u4_web_text_prompt_closed\(webPromptId\)/g) ?? []).length
    expect(opens).toBe(2) // ReadStringController + ReadChoiceController
    expect(closes).toBe(2)
  })

  it("the base destructor is virtual, so the one subclass (ReadPlayerController) still closes its epoch", () => {
    // vendor/xu4/src/event.cpp:816 -- ReadPlayerController derives from
    // ReadChoiceController and defines its own empty destructor, so only a
    // VIRTUAL base destructor guarantees the epoch is closed after it.
    expect(readChoiceClass).toMatch(/virtual ~ReadChoiceController\(\)/)
    expect(eventCpp).toMatch(/class ReadPlayerController : public ReadChoiceController/)
    expect(eventCpp).toMatch(/ReadPlayerController::~ReadPlayerController\(\)/)
  })

  it("the opened hook carries the prompt kind through to the shell (a string epoch is still reported as a text prompt)", () => {
    expect(eventCpp).toMatch(
      /EM_JS\(void, u4_web_text_prompt_opened, \(int id, int kind\), \{[^}]*Module\.u4TextPrompt\.opened\(id, kind\)/
    )
    expect(readStringCtor).toMatch(/u4_web_text_prompt_opened\(webPromptId, U4_WEB_PROMPT_TEXT\)/)
    // The two kinds must be distinct values or the shell cannot tell them apart.
    const kinds = [...eventCpp.matchAll(/(U4_WEB_PROMPT_(?:TEXT|CHOICE))\s*=\s*(\d+)/g)]
    expect(kinds.map((match) => match[1])).toEqual(["U4_WEB_PROMPT_TEXT", "U4_WEB_PROMPT_CHOICE"])
    expect(new Set(kinds.map((match) => match[2])).size).toBe(2)
  })
})

describe("readChoice key bound: no key is ever narrowed into the ASCII choice set (Todo 30 requirement B)", () => {
  it("compares a key only when it is a single byte, and never truncates an int into char to do it", () => {
    // `choices` is an ASCII byte set at every readChoice() call site, so a
    // multi-byte key can never BE one of the choices. The old code narrowed
    // the int to char unconditionally, so a multi-byte Korean code point (or
    // a GLFW keypad/modifier code such as 320 -> '@') could be silently
    // accepted as a choice it never was.
    expect(readChoiceKeyPressed).toMatch(/singleByteKey/)
    expect(readChoiceKeyPressed).toMatch(/key >= 0\) && \(key <= 0x7F\)/)
    expect(readChoiceKeyPressed).toMatch(/choices\.find_first_of\(static_cast<char>\(key\)\)/)
    expect(readChoiceKeyPressed).not.toMatch(/find_first_of\(key\)/)
  })

  it("still case-folds a single-byte upper-case key before comparing, so the 'yn' prompt keeps accepting 'Y'", () => {
    expect(readChoiceKeyPressed).toMatch(/singleByteKey && isupper\(key\)/)
    expect(readChoiceKeyPressed).toMatch(/key = tolower\(key\)/)
  })

  it("still compares against the caller's choice string and still echoes a printable ASCII key at the cursor", () => {
    expect(readChoiceKeyPressed).toMatch(/choices\.empty\(\) \|\|/)
    expect(readChoiceKeyPressed).toMatch(/key > ' ' && key <= 0x7F/)
    expect(readChoiceKeyPressed).toMatch(/screenShowChar\(toupper\(key\), ss->cursorX, ss->cursorY\)/)
    expect(readChoiceKeyPressed).toMatch(/value = key;/)
    expect(readChoiceKeyPressed).toMatch(/doneWaiting\(\);/)
  })

  it("the accepted-chars bitset that guards ReadStringController is untouched by this Todo", () => {
    // The string prompt's own ASCII bitset is what makes the TLK path work;
    // Todo 30 must not widen or narrow it.
    const bitset = sliceBetween(eventCpp, "static const uint8_t alphaNumBitset[MAX_BITS/8] = {", "};")
    expect(bitset).toMatch(/0x00, 0x25, 0x00, 0x00, 0x01, 0x00, 0xFF, 0x03,\s*0xFE, 0xFF, 0xFF, 0x07, 0xFE, 0xFF, 0xFF, 0x07/)
    expect(readStringClass).toMatch(/uint8_t accepted\[16\]/)
  })
})

describe("resolveChoiceInput: Korean answers for the progression-critical choice prompts", () => {
  it("maps 예/아니오 to the y/n keys the 'yn' heal question compares against", () => {
    const table = realTable()
    // vendor/xu4/src/discourse_castle.cpp:510 -- readChoice("yn \n\033"):
    // only the first character is ever compared, so the canonical keyword's
    // first character IS the answer.
    expect(resolveChoiceInput("예", table)).toEqual({ ok: true, text: "y" })
    expect(resolveChoiceInput("아니오", table)).toEqual({ ok: true, text: "n" })
  })

  it("maps 남성/여성 to the m/f keys the intro sex prompt compares against", () => {
    const table = realTable()
    // vendor/xu4/src/intro.cpp:999 -- readChoice("mf"), then
    // `if (sexChoice == 'm')`.
    expect(resolveChoiceInput("남성", table)).toEqual({ ok: true, text: "m" })
    expect(resolveChoiceInput("여성", table)).toEqual({ ok: true, text: "f" })
  })

  it("maps the gypsy A)/B) virtue answer, which is NOT a yes/no question, to a/b", () => {
    const table = realTable()
    // vendor/xu4/src/intro.cpp:1254 -- readChoice("ab"), then
    // `doQuestion(choice == 'a' ? 0 : 1)`: the two answers are two different
    // virtues, and the Korean question text labels them literally "A)"/"B)".
    // 가/나 are the Korean option labels for that same A/B pair; 예/아니오
    // would be a category error (the question is not a yes/no question).
    expect(resolveChoiceInput("가", table)).toEqual({ ok: true, text: "a" })
    expect(resolveChoiceInput("나", table)).toEqual({ ok: true, text: "b" })
  })

  it("passes any ASCII answer through completely unchanged (the English path is xu4's own business)", () => {
    const table = realTable()
    expect(resolveChoiceInput("y", table)).toEqual({ ok: true, text: "y" })
    expect(resolveChoiceInput("Y", table)).toEqual({ ok: true, text: "Y" })
    expect(resolveChoiceInput("m", table)).toEqual({ ok: true, text: "m" })
    expect(resolveChoiceInput("A", table)).toEqual({ ok: true, text: "A" })
  })

  it("never lets an unrelated NPC keyword alias answer a choice prompt", () => {
    const table = realTable()
    // 안녕 -> "bye" would otherwise be truncated to the key 'b' and would
    // silently answer the gypsy question with the wrong virtue.
    for (const alias of ["안녕", "건강", "직업", "이름", "기부", "외모", "합류"]) {
      const result = resolveChoiceInput(alias, table)
      expect(result.ok, `${alias} must not answer a choice prompt`).toBe(false)
      if (!result.ok) expect(result.reason).toBe("not-a-choice-answer")
    }
  })

  it("rejects Korean with no alias at all, with a choice-specific message", () => {
    const table = realTable()
    const result = resolveChoiceInput("무슨소리", table)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("unknown-keyword")
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it("matches after Unicode NFC normalization and trims surrounding whitespace", () => {
    const table = realTable()
    const decomposed = "남성".normalize("NFD")
    expect(decomposed).not.toBe("남성")
    expect(resolveChoiceInput(`  ${decomposed}  `, table)).toEqual({ ok: true, text: "m" })
  })

  it("rejects a multi-character Korean answer instead of picking one of its syllables", () => {
    const table = realTable()
    const result = resolveChoiceInput("예 아니오", table)
    expect(result.ok).toBe(false)
  })

  it("rejects an empty submission instead of synthesizing a bare Enter", () => {
    // readChoice("yn \n\033") has no '\r', but several other readChoice
    // sets do accept a bare Enter as one of their answers -- an empty
    // Korean field must never silently pick one.
    const table = realTable()
    const result = resolveChoiceInput("", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("empty-answer")
  })

  it("the resolvable choice keys are exactly y/n/m/f/a/b for the real alias table", () => {
    // Guards against a future alias silently widening the set of keys a
    // Korean word can press in a choice prompt.
    expect(choiceAnswerKeys(realTable())).toEqual(["a", "b", "f", "m", "n", "y"])
    expect(choiceAnswerKeys(generatedTable())).toEqual(["a", "b", "f", "m", "n", "y"])
    // Each canonical maps to exactly the key its native call site compares,
    // and every canonical that is NOT in the closed set has no key at all.
    expect(Object.fromEntries(Object.entries(CHOICE_ANSWER_KEYS).map(([canonical, key]) => [key, canonical]))).toEqual({
      a: "choiceA",
      b: "choiceB",
      f: "female",
      m: "male",
      n: "no",
      y: "yes"
    })
    for (const canonical of CHOICE_ANSWER_CANONICALS) {
      expect(choiceAnswerKey(canonical), canonical).toMatch(/^[a-z]$/)
    }
    for (const canonical of ["bye", "look", "name", "give", "join", "job", "health", "unrelated"]) {
      expect(choiceAnswerKey(canonical), canonical).toBeUndefined()
    }
  })
})

describe("readChoice wiring: the shell reaches the choice handler with a real keystroke (src/shell.ts)", () => {
  it("resolves the submission against the kind of prompt epoch the engine reports", () => {
    expect(shellTs).toMatch(/resolveChoiceInput\(/)
    // The TLK/NPC path must still be the "text" kind, chosen explicitly.
    expect(shellTs).toMatch(/resolveInput\("text", raw, koreanAliasTable\)/)
  })

  it("forwards the epoch kind from the engine hook into the receiver", () => {
    expect(shellTs).toMatch(/opened:\s*\(id, kind\)\s*=>/)
    expect(shellTs).toMatch(/U4_WEB_PROMPT_CHOICE/)
  })

  it("does not append Enter to a choice answer: readChoice() consumes one key, and the trailing Enter would leak into the next prompt", () => {
    const synth = sliceBetween(shellTs, "function synthesizeKeystrokes", "function submitKoreanKeyword")
    expect(synth).toMatch(/if \(terminate\) \{\n\s*keyCodes\.push\(13\)/)
    expect(synth).toMatch(/function synthesizeKeystrokes\(text: string, terminate: boolean\)/)
  })

  it("still submits a text-prompt answer with Enter (the native interest buffer needs it)", () => {
    const submit = sliceBetween(shellTs, "function submitKoreanKeyword", "// GLFW's Emscripten port listens")
    expect(submit).toMatch(/const isChoiceEpoch = openPromptKind === U4_WEB_PROMPT_CHOICE/)
    expect(submit).toMatch(/synthesizeKeystrokes\(result\.text, !isChoiceEpoch\)/)
  })
})

describe("REGRESSION GUARD: the English/TLK path and every pre-existing alias are unchanged (Todo 30 must not touch them)", () => {
  it("the Todo 13 alias set is byte-for-byte what it was, including 예/아니오 -> yes/no", () => {
    // A snapshot of the pre-existing locales/ko/aliases.json content. If a
    // future edit renames or re-points any of these, the English keyword
    // path (discourse_tlk.cpp's prefix matcher) stops matching and this
    // fails.
    const expected: ReadonlyArray<readonly [string, string, string]> = [
      ["alias:bye", "안녕", "bye"],
      ["alias:look", "외모", "look"],
      ["alias:name", "이름", "name"],
      ["alias:join", "합류", "join"],
      ["alias:job", "직업", "job"],
      ["alias:health", "건강", "health"],
      ["alias:yes", "예", "yes"],
      ["alias:no", "아니오", "no"],
      ["alias:give", "기부", "give"]
    ]
    const entries = (aliasesSchema as { entries: Record<string, { alias: string; canonical: string }> }).entries
    for (const [id, alias, canonical] of expected) {
      expect(entries[id], id).toBeDefined()
      expect(entries[id]!.alias, id).toBe(alias)
      expect(entries[id]!.canonical, id).toBe(canonical)
    }
  })

  it("every alias in the real table still resolves on a 'text' prompt to its exact canonical keyword", () => {
    for (const table of [realTable(), generatedTable()]) {
      for (const [alias, canonical] of table.byNormalizedAlias) {
        expect(resolveInput("text", alias, table), alias).toEqual({ ok: true, text: canonical })
      }
    }
  })

  it("'text' still passes ASCII input through byte-for-byte (the native 4-byte prefix matcher owns it)", () => {
    const table = realTable()
    expect(resolveInput("text", "JoB", table)).toEqual({ ok: true, text: "JoB" })
    expect(resolveInput("text", "he", table)).toEqual({ ok: true, text: "he" })
    expect(resolveInput("text", "", table)).toEqual({ ok: true, text: "" })
  })

  it("'yesno' is unchanged: ASCII passes through, 예/아니오 map to yes/no, unrelated keywords do not answer", () => {
    const table = realTable()
    expect(resolveInput("yesno", "y", table)).toEqual({ ok: true, text: "y" })
    expect(resolveInput("yesno", "Yes please", table)).toEqual({ ok: true, text: "Yes please" })
    expect(resolveInput("yesno", "예", table)).toEqual({ ok: true, text: "yes" })
    expect(resolveInput("yesno", "아니오", table)).toEqual({ ok: true, text: "no" })
    expect(resolveInput("yesno", "직업", table).ok).toBe(false)
  })

  it("'command' still rejects Korean outright -- Todo 13's documented behavior for a bare command key is preserved", () => {
    const table = realTable()
    const result = resolveInput("command", "공격", table)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("korean-not-allowed")
    expect(resolveInput("command", "a", table)).toEqual({ ok: true, text: "a" })
  })

  it("'avatar-name', 'number' and 'direction' rejections are unchanged", () => {
    const table = realTable()
    for (const kind of ["avatar-name", "number", "direction"] as const) {
      const result = resolveInput(kind, "한글", table)
      expect(result.ok, kind).toBe(false)
      if (!result.ok) expect(result.reason, kind).toBe("korean-not-allowed")
    }
  })

  it("the new choice aliases add no new NPC-discourse canonical keyword to the text path", () => {
    // Every canonical must still be a plain ASCII string that fits the
    // native 16-byte interest buffer, and the new entries must not shadow
    // an existing canonical keyword (scripts/lib/alias-check.mjs's rule).
    const entries = (aliasesSchema as { entries: Record<string, { alias: string; canonical: string }> }).entries
    const canonicals = new Set(Object.values(entries).map((entry) => entry.canonical))
    for (const entry of Object.values(entries)) {
      expect(/^[\x00-\x7f]+$/.test(entry.canonical), entry.canonical).toBe(true)
      expect(new TextEncoder().encode(entry.canonical).length).toBeLessThanOrEqual(16)
      const normalizedAlias = entry.alias.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase()
      if (normalizedAlias.length > 0) {
        expect(canonicals.has(normalizedAlias), `alias "${entry.alias}" shadows a canonical`).toBe(false)
      }
    }
  })
})
