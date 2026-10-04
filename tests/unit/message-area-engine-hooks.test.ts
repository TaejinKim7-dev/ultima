// Todo 49 Phase A: the engine's web-only screen signal hooks, pinned by
// source shape.
//
// The Korean in-game message-area overlay (src/overlay/message-area-view.ts)
// must be fed by the engine. These hooks are the sender side:
//   Module.u4Screen.input(id, text)   event.cpp  ReadStringController value
//   Module.u4Screen.choice(ch)        event.cpp  ReadChoiceController accept
//   Module.u4Screen.cursor(on)        screen.cpp screenShowCursor (changed only)
//   Module.u4Screen.play(on)          game.cpp   play begin/end
//   Module.u4Screen.modal(on)         screen.cpp screenSetLayer LAYER_TOP_MENU
//   Module.u4Screen.crlf()            screen.cpp screenCrLf (talkCrLf disabled)
//
// Rules pinned here: every call site and every EM_JS definition sits inside
// `#ifdef __EMSCRIPTEN__` (native builds stay byte-identical), and the crlf
// signal is suppressed inside talkCrLf so the existing talk-line "\n" signal
// is not doubled.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const readRepoFile = (relativePath: string) => readFileSync(join(projectRoot, relativePath), "utf8")

const eventCpp = readRepoFile("vendor/xu4/src/event.cpp")
const screenCpp = readRepoFile("vendor/xu4/src/screen.cpp")
const gameCpp = readRepoFile("vendor/xu4/src/game.cpp")
const tlkCpp = readRepoFile("vendor/xu4/src/discourse_tlk.cpp")
const screenH = readRepoFile("vendor/xu4/src/screen.h")

function splitLines(source: string): string[] {
  return source.split("\n")
}

/** Preprocessor-conditional depth tracker: is line `index` inside `#ifdef __EMSCRIPTEN__`? */
function insideEmscripten(lines: string[], index: number): boolean {
  const stack: boolean[] = []
  for (let i = 0; i <= index; i++) {
    const directive = /^\s*#\s*(ifdef|ifndef|if|else|endif)\b(.*)$/.exec(lines[i]!)
    if (!directive) continue
    const kind = directive[1]!
    if (kind === "ifdef") stack.push(directive[2]!.trim() === "__EMSCRIPTEN__")
    else if (kind === "ifndef" || kind === "if") stack.push(false)
    else if (kind === "else") stack.push(!stack.pop())
    else stack.pop()
  }
  return stack.some(Boolean)
}

/** The `{ ... }` body of the first definition of `needle`, braces matched. */
function functionBody(source: string, needle: RegExp): string {
  const lines = splitLines(source)
  const start = lines.findIndex((line) => needle.test(line))
  expect(start, `expected ${needle} in source`).toBeGreaterThan(-1)
  let open = -1
  let depth = 0
  for (let i = start; i < lines.length; i += 1) {
    const braceOpen = (lines[i]!.match(/\{/g) ?? []).length
    const braceClose = (lines[i]!.match(/\}/g) ?? []).length
    if (braceOpen > 0 && open === -1) open = i
    depth += braceOpen - braceClose
    if (depth <= 0 && open !== -1) {
      return lines.slice(open, i + 1).join("\n")
    }
  }
  throw new Error(`no closing brace for ${needle}`)
}

describe("Todo 49 engine hooks are web-only (native builds unchanged)", () => {
  it("every u4_web_screen_* EM_JS definition sits inside #ifdef __EMSCRIPTEN__", () => {
    const lines = splitLines(screenCpp)
    for (const name of ["u4_web_screen_cursor", "u4_web_screen_crlf", "u4_web_screen_modal"]) {
      const index = lines.findIndex((line) => new RegExp(`EM_JS\\(void, ${name},`).test(line))
      expect(index, `${name} is defined`).toBeGreaterThan(-1)
      expect(insideEmscripten(lines, index), `${name} is web-only`).toBe(true)
    }
    const eventLines = splitLines(eventCpp)
    for (const name of ["u4_web_screen_input", "u4_web_screen_choice"]) {
      const index = eventLines.findIndex((line) => new RegExp(`EM_JS\\(void, ${name},`).test(line))
      expect(index, `${name} is defined in event.cpp`).toBeGreaterThan(-1)
      expect(insideEmscripten(eventLines, index), `${name} is web-only`).toBe(true)
    }
  })

  it("screenCrLf() calls u4_web_screen_crlf() at the end, web-only, behind the talkCrLf suppression flag", () => {
    const lines = splitLines(screenCpp)
    const start = lines.findIndex((line) => /^void screenCrLf\(\)/.test(line))
    expect(start).toBeGreaterThan(0)
    const calls = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bu4_web_screen_crlf\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(calls, "screenCrLf must call u4_web_screen_crlf").toHaveLength(1)
    const call = calls[0]!
    expect(call.index).toBeGreaterThan(start)
    expect(insideEmscripten(lines, call.index)).toBe(true)
    // The call must be gated by the talkCrLf suppression flag so the talk
    // channel's own "\n" signal is not doubled.
    const body = lines.slice(start, call.index + 1).join("\n")
    expect(body).toMatch(/webSuppressCrLf/)
  })

  it("talkCrLf (discourse_tlk.cpp) disables the crlf signal around screenCrLf()", () => {
    const lines = splitLines(tlkCpp)
    const body = functionBody(tlkCpp, /static void talkCrLf\(/)
    const bodyStart = lines.findIndex((line) => /static void talkCrLf\(/.test(line))
    expect(insideEmscripten(lines, bodyStart), "talkCrLf itself is web-only").toBe(true)
    expect(body).toMatch(/screenWebSuppressCrLf\(\s*true\s*\)/)
    expect(body).toMatch(/screenCrLf\(\)/)
    expect(body).toMatch(/screenWebSuppressCrLf\(\s*false\s*\)/)
  })

  it("screenWebSuppressCrLf is declared in screen.h under __EMSCRIPTEN__", () => {
    const lines = splitLines(screenH)
    const index = lines.findIndex((line) => /screenWebSuppressCrLf/.test(line))
    expect(index, "screenWebSuppressCrLf is declared in screen.h").toBeGreaterThan(-1)
    expect(insideEmscripten(lines, index)).toBe(true)
  })

  it("screenShowCursor() sends cursor(on) only when the visibility changes", () => {
    const lines = splitLines(screenCpp)
    const start = lines.findIndex((line) => /^void screenShowCursor\(/.test(line))
    expect(start).toBeGreaterThan(0)
    const body = functionBody(screenCpp, /^void screenShowCursor\(/)
    const callIndex = lines.findIndex((line, i) => i > start && /\bu4_web_screen_cursor\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(callIndex, "screenShowCursor calls u4_web_screen_cursor").toBeGreaterThan(start)
    expect(insideEmscripten(lines, callIndex)).toBe(true)
    // "바뀔 때만 보냄" -- the body keeps a last-seen flag next to the call.
    expect(body).toMatch(/webCursorShown|webCursor/)
  })

  it("screenSetLayer() sends modal(on) when the layer is LAYER_TOP_MENU", () => {
    const lines = splitLines(screenCpp)
    const start = lines.findIndex((line) => /^void screenSetLayer\(/.test(line))
    expect(start).toBeGreaterThan(0)
    const calls = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bu4_web_screen_modal\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(calls.length, "screenSetLayer calls u4_web_screen_modal").toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.index).toBeGreaterThan(start)
      expect(insideEmscripten(lines, call.index)).toBe(true)
    }
    const body = functionBody(screenCpp, /^void screenSetLayer\(/)
    expect(body).toMatch(/LAYER_TOP_MENU/)
  })

  it("event.cpp ReadStringController sends input() on add, backspace and ESC, web-only", () => {
    const lines = splitLines(eventCpp)
    const start = lines.findIndex((line) => /^bool ReadStringController::keyPressed\(/.test(line))
    expect(start).toBeGreaterThan(0)
    const body = functionBody(eventCpp, /^bool ReadStringController::keyPressed\(/)
    const calls = body.split("\n").filter((line) => /\bu4_web_screen_input\s*\(/.test(line))
    expect(calls.length).toBeGreaterThanOrEqual(3) // add-char, backspace, ESC
    for (const call of calls) {
      expect(call).toMatch(/webPromptId/)
    }
    // The add-char and backspace echoes send the whole value; the ESC case
    // erases it and sends empty text so the overlay clears its echo.
    expect(calls.filter((call) => call.includes("value.c_str()")).length).toBeGreaterThanOrEqual(2)
    expect(calls.some((call) => call.includes('""'))).toBe(true)
    const callLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bu4_web_screen_input\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(callLines.length).toBeGreaterThanOrEqual(3)
    for (const call of callLines) {
      expect(insideEmscripten(lines, call.index)).toBe(true)
    }
  })

  it("event.cpp ReadChoiceController sends choice() when a key is accepted, web-only", () => {
    const lines = splitLines(eventCpp)
    const start = lines.findIndex((line) => /^bool ReadChoiceController::keyPressed\(/.test(line))
    expect(start).toBeGreaterThan(0)
    const body = functionBody(eventCpp, /^bool ReadChoiceController::keyPressed\(/)
    expect(body).toMatch(/\bu4_web_screen_choice\s*\(/)
    const callIndex = lines.findIndex((line, i) => i > start && /\bu4_web_screen_choice\s*\(/.test(line) && !/^EM_JS/.test(line))
    expect(callIndex).toBeGreaterThan(start)
    expect(insideEmscripten(lines, callIndex)).toBe(true)
  })

  it("game.cpp sends play(1) at play begin and play(0) at play end, web-only", () => {
    const lines = splitLines(gameCpp)
    const begins = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bu4_web_screen_play\s*\(\s*1\s*\)/.test(line))
    expect(begins.length, "play(1) hook").toBeGreaterThanOrEqual(1)
    const ends = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /\bu4_web_screen_play\s*\(\s*0\s*\)/.test(line))
    expect(ends.length, "play(0) hook").toBeGreaterThanOrEqual(1)
    for (const call of [...begins, ...ends]) {
      expect(insideEmscripten(lines, call.index)).toBe(true)
    }
  })

  it("the play-begin hook is GameController::initScreenWithoutReloadingState and the end hook is conclude", () => {
    // game.cpp:130 (initScreenWithoutReloadingState) and :115 (conclude) --
    // see docs/plans/2026-10-04-in-game-korean.md Stage 2 table.
    const beginBody = functionBody(gameCpp, /^void GameController::initScreenWithoutReloadingState\(/)
    expect(beginBody).toMatch(/u4_web_screen_play\(\s*1\s*\)/)
    const endBody = functionBody(gameCpp, /^void GameController::conclude\(\)/)
    expect(endBody).toMatch(/u4_web_screen_play\(\s*0\s*\)/)
  })

  it("no u4_web_screen_* hook exists in a native-only file", () => {
    for (const source of [eventCpp, screenCpp, gameCpp, tlkCpp]) {
      const lines = splitLines(source)
      for (const name of ["u4_web_screen_input", "u4_web_screen_choice", "u4_web_screen_cursor", "u4_web_screen_crlf", "u4_web_screen_modal", "u4_web_screen_play"]) {
        const indices = lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => new RegExp(`\\b${name}\\s*\\(`).test(line))
        for (const hit of indices) {
          // The EM_JS definition itself is exempt (it IS the web-only glue).
          if (/^EM_JS/.test(hit.line)) {
            expect(insideEmscripten(lines, hit.index)).toBe(true)
            continue
          }
          expect(insideEmscripten(lines, hit.index), `${name} at line ${hit.index + 1} must be web-only`).toBe(true)
        }
      }
    }
  })
})