import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { composeTalkLine, MISSING_TLK_TRANSLATION, type TalkComposeDeps } from "../../src/dialogue/talk-compose.ts"
import { GENERATED_I18N_ENTRIES, GENERATED_TALK_TEMPLATES, GENERATED_UI_TEMPLATES } from "../../src/i18n/generated/strings.ts"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"

// Todo 29: the shrine's meditation advice is the last unreached
// avatar.exe:shrineAdvice:0-23 corpus. Those 24 translations existed and
// were compiled into the static artifact, but vendor/xu4/src/shrine.cpp had
// no web_talk hook at all, so showVision()'s
// `screenMessage("\n%s", ss->advice[...])` never sent them anywhere: the
// screenMessage hash path drops the placeholder-only format "\n%s" (74f66881
// is not in GENERATED_UI_TEMPLATES) and the player saw the original
// AVATAR.EXE English on the canvas only.
//
// This file covers the whole chain:
//   1. shrine.cpp really calls the web talk hook with the shrineAdvice table,
//   2. the advice index expression maps every (virtue, cycles) pair onto a
//      distinct shrineAdvice:0-23 id,
//   3. all 24 ids are ready Korean and compose to Korean panel lines, and
//   4. the advice format stays OUT of GENERATED_UI_TEMPLATES, so the line is
//      drawn exactly once (no dialogue-panel double output).

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const shrineSource = readFileSync(join(projectRoot, "vendor/xu4/src/shrine.cpp"), "utf8")
const workDir = mkdtempSync(join(tmpdir(), "u4-shrine-advice-"))
afterAll(() => rmSync(workDir, { force: true, recursive: true }))

/** The web-build-only advice line: `screenMessage("\n%s", ss->advice[...])`. */
const ADVICE_FORMAT = "\n%s"
const ADVICE_FORMAT_HASH = fnv1a32(ADVICE_FORMAT) // 74f66881
/** The same format as it is spelled in the C++ source (escaped `\n`). */
const ADVICE_FORMAT_LITERAL = "\\n%s"

/**
 * The index expression showVision() passes to ss->advice[], read out of the
 * source so the id the web hook sends can never drift from the string the
 * engine prints.
 */
const ADVICE_INDEX_EXPR = /\bss->advice\[\s*([^]+?)\s*\]\.c_str\(\)/.exec(shrineSource)?.[1]

/** showVision()'s own branch, used to check the hook sits in the non-elevated path. */
const showVisionBody = /void Shrine::showVision\(bool elevated\) \{(.+?)\n\}/s.exec(shrineSource)?.[1] ?? ""

/** Escapes a string for use inside a RegExp source, backslashes included. */
function reEscape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const binaryEntries = (JSON.parse(readFileSync(join(projectRoot, "locales/ko/binary.json"), "utf8")) as {
  entries: Record<string, { sourceHash: string; placeholders: string[]; translation: string; status: string }>
}).entries

/** Every shrineAdvice id, 0-23. */
const SHRINE_ADVICE_IDS = Array.from({ length: 24 }, (_, index) => `avatar.exe:shrineAdvice:${index}`)

describe("shrine.cpp sends the shrine advice over the web talk channel", () => {
  it("includes web_talk.h (the header that compiles away in native builds)", () => {
    expect(shrineSource).toMatch(/#include "web_talk\.h"/)
  })

  it("uploads the advice format with the shrineAdvice table and the advice index, not the text", () => {
    expect(ADVICE_INDEX_EXPR, "advice index expression in showVision()").toBeDefined()
    const hookCall = new RegExp(
      `u4WebTalkId\\(\\s*"${reEscape(ADVICE_FORMAT_LITERAL)}"\\s*,\\s*"avatar\\.exe:shrineAdvice"\\s*,\\s*${reEscape(ADVICE_INDEX_EXPR!)}\\s*\\)`
    )
    expect(showVisionBody, hookCall.source).toMatch(hookCall)
    // The original AVATAR.EXE text must never be sent as text, only as an id.
    expect(showVisionBody).not.toMatch(/u4WebTalkText\([^)]*ss->advice/)
  })

  it("never sends the loaded advice vector itself as a format or a text argument", () => {
    // `u4WebTalkId` only ever sends the "@table:index" id, so the engine's
    // advice bytes cannot reach the shell. Guard the whole file: no
    // u4_web_talk_line / u4WebTalk* call may name ss->advice as its text.
    for (const call of shrineSource.match(/u4(?:Web|web)[A-Za-z_]*\([^;]*\);/g) ?? []) {
      expect(call, call).not.toMatch(/advice\[.*\]\.c_str\(\)\s*[,)]/)
    }
  })
})

describe("the advice index maps every (virtue, cycles) pair to a distinct shrineAdvice id", () => {
  it("reads the real expression from shrine.cpp and covers shrineAdvice:0-23 exactly once", () => {
    expect(ADVICE_INDEX_EXPR).toBe("virtue * 3 + ss->completedCycles - 1")

    // MEDITATION_MANTRAS_PER_CYCLE is unrelated; the bounds are the eight
    // Virtues (0-7) and the 1-3 completed meditation cycles askMantra() ends on.
    const seen = new Map<string, string>()
    for (let virtue = 0; virtue < 8; ++virtue) {
      for (let completedCycles = 1; completedCycles <= 3; ++completedCycles) {
        const index = virtue * 3 + completedCycles - 1
        expect(index, `virtue ${virtue} / ${completedCycles} cycles`).toBeGreaterThanOrEqual(0)
        expect(index, `virtue ${virtue} / ${completedCycles} cycles`).toBeLessThan(24)
        const key = `avatar.exe:shrineAdvice:${index}`
        expect(seen.has(key), `${key} claimed twice`).toBe(false)
        seen.set(key, `virtue ${virtue} / ${completedCycles} cycles`)
      }
    }
    expect([...seen.keys()].sort()).toEqual([...SHRINE_ADVICE_IDS].sort())
  })
})

describe("locales/ko/binary.json + the static artifact carry all 24 advice translations", () => {
  it("records all 24 shrineAdvice ids as ready Korean (no English, no pending)", () => {
    for (const id of SHRINE_ADVICE_IDS) {
      const entry = binaryEntries[id]!
      expect(entry, `${id} missing from locales/ko/binary.json`).toBeDefined()
      expect(entry.status, id).toBe("ready")
      expect(entry.translation, id).toMatch(/\p{Script=Hangul}/u)
    }
  })

  it("compiles all 24 into the generated static table the shell resolves from", () => {
    for (const id of SHRINE_ADVICE_IDS) {
      const generated = GENERATED_I18N_ENTRIES[id]!
      expect(generated, `${id} missing from src/i18n/generated/strings.ts`).toBeDefined()
      expect(generated.translation, id).toMatch(/\p{Script=Hangul}/u)
    }
  })

  it("composes every advice id to a Korean panel line through the real talk composer", () => {
    const deps: TalkComposeDeps = {
      templateId: (literal) => GENERATED_TALK_TEMPLATES[literal],
      resolve: (id, fallback) => GENERATED_I18N_ENTRIES[id]?.translation ?? fallback
    }
    for (const id of SHRINE_ADVICE_IDS) {
      const line = composeTalkLine(ADVICE_FORMAT, [`@${id}`], deps)
      expect(line, id).toContain(GENERATED_I18N_ENTRIES[id]!.translation)
      expect(line, id).toMatch(/\p{Script=Hangul}/u)
      expect(line, id).not.toBe(MISSING_TLK_TRANSLATION)
      // The advice format itself is not a Korean template, so the leading
      // newline of the engine's print is preserved verbatim.
      expect(line.startsWith("\n"), id).toBe(true)
    }
  })
})

describe("the advice line is drawn exactly once", () => {
  it("keeps the placeholder-only advice format out of GENERATED_UI_TEMPLATES", () => {
    // Todo 27's double-output rule: the screenMessage hash path and the talk
    // channel must never both reach GENERATED_UI_TEMPLATES for one line. The
    // advice format carries only "%s", so it stays out and the web hook owns
    // the line (u4WebTalkId).
    expect(ADVICE_FORMAT_HASH).toBe("74f66881")
    expect(GENERATED_UI_TEMPLATES[ADVICE_FORMAT_HASH]).toBeUndefined()
    expect(Object.values(GENERATED_UI_TEMPLATES)).not.toContain("ui:shrine:17")
  })
})

describe("\"\\nThy thoughts are pure. \" is not a separate runtime literal", () => {
  // The audit reported shrine.cpp:179 as an uninventoried English literal with
  // FNV-1a hash cc1e5768. It is the first half of a two-literal adjacent
  // pair; the C compiler concatenates it, so the format the engine ever
  // hashes is the JOINED text (b3cfc70c), which is already inventoried as
  // ui:shrine:15 and already translated. cc1e5768 is unreachable: no runtime
  // path can produce it, so nothing may be added to locales/ko/ui.json for it.
  const PURE_HALF = "\nThy thoughts are pure. "
  const PURE_JOINED = "\nThy thoughts are pure. Thou art granted a vision!\n"
  const PURE_HALF_HASH = fnv1a32(PURE_HALF)
  const PURE_JOINED_HASH = fnv1a32(PURE_JOINED)

  it("compiles the real adjacent-literal call and proves the engine sees the joined text", () => {
    expect(PURE_HALF_HASH).toBe("cc1e5768")
    expect(PURE_JOINED_HASH).toBe("b3cfc70c")
    expect(shrineSource).toMatch(/screenMessage\(\s*"\\nThy thoughts are pure\. "\s*\n?\s*"Thou art granted a vision!\\n"\s*\)/)

    // Same C concatenation semantics as the engine build: pass both adjacent
    // literals to a stand-in for screenMessage() and hash the pointer the
    // compiler actually handed over.
    const source = join(workDir, "pure.c")
    const binary = join(workDir, "pure")
    writeFileSync(
      source,
      `#include <stdio.h>
#include <string.h>
#include "web_hash.h"
static const char* emitted;
static void shrineScreenMessage(const char* fmt) { emitted = fmt; }
void shrineAskMantra(void) {
    shrineScreenMessage("\\nThy thoughts are pure. "
                        "Thou art granted a vision!\\n");
}
int main(void) {
    shrineAskMantra();
    char hash[9];
    webFormatHash(emitted, hash);
    printf("%s %zu\\n", hash, strlen(emitted));
    return 0;
}
`
    )
    const compile = spawnSync(
      "cc",
      ["-std=c99", "-Wall", "-Werror", `-I${join(projectRoot, "vendor/xu4/src")}`, source, "-o", binary],
      { encoding: "utf8" }
    )
    expect(compile.status, compile.stderr).toBe(0)
    const run = spawnSync(binary, [], { encoding: "utf8" })
    expect(run.status).toBe(0)
    const [hash, length] = run.stdout.trim().split(" ")
    expect(hash).toBe(PURE_JOINED_HASH)
    // 51 bytes, not the 24 of the half literal: the engine never holds
    // "\nThy thoughts are pure. " as a format of its own.
    expect(Number(length)).toBe(PURE_JOINED.length)
  })

  it("resolves the joined literal the engine does hash, in Korean", () => {
    expect(GENERATED_UI_TEMPLATES[PURE_JOINED_HASH]).toBe("ui:shrine:15")
    const translation = GENERATED_I18N_ENTRIES["ui:shrine:15"]?.translation
    expect(translation).toBeDefined()
    expect(translation).toMatch(/\p{Script=Hangul}/u)
    expect(translation).not.toMatch(/thoughts|vision/i)
  })

  it("keeps the unreachable half-literal hash out of every table (no phantom entry)", () => {
    expect(GENERATED_UI_TEMPLATES[PURE_HALF_HASH]).toBeUndefined()
    expect(Object.values(GENERATED_UI_TEMPLATES)).not.toContain("ui:shrine:18")
    const uiEntries = (JSON.parse(readFileSync(join(projectRoot, "locales/ko/ui.json"), "utf8")) as {
      entries: Record<string, { sourceHash: string }>
    }).entries
    const joinedSha = createHash("sha256").update(Buffer.from(PURE_JOINED, "utf8")).digest("hex")
    expect(uiEntries["ui:shrine:15"]!.sourceHash).toBe(`sha256:${joinedSha}`)
  })
})
