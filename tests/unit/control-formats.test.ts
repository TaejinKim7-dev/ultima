// Todo 49 Phase A: the control-only message format table.
//
// The web shell receives every screenMessage() call as a format hash plus its
// printf arguments (see src/dialogue/ui-message-compose.ts). A handful of
// formats carry NO translatable text -- they are pure line breaks, the idle
// prompt glyph, or a one-key player echo. This module maps them to control
// descriptors, each with a guard so a format is never mistaken for control
// when its actual arguments make it a real message.
//
// Verified against the real call sites:
//   "\n"        screenMessage("\n")   -- cheat.cpp:407, codex.cpp:97
//   "\n\n"      screenMessage("\n\n") -- blank-line break
//   "    \n"    game.cpp:1478         -- direction-cancel line (4 spaces)
//   "%c"        screen.cpp:369        -- screenPrompt()'s CHARSET_PROMPT (0x10)
//   "%c\n"      event.cpp:864         -- AlphaActionController menu-letter echo
import { describe, expect, it } from "vitest"
import {
  CHARSET_PROMPT,
  CONTROL_FORMATS,
  controlForFormat,
  controlForHash
} from "../../src/dialogue/control-formats.ts"
import { hashText } from "../../src/i18n/coverage.ts"

describe("control-formats table coverage", () => {
  it("covers the five control-only formats the engine actually emits", () => {
    expect(CONTROL_FORMATS[hashText("\n")]).toBeDefined()
    expect(CONTROL_FORMATS[hashText("\n\n")]).toBeDefined()
    expect(CONTROL_FORMATS[hashText("    \n")]).toBeDefined()
    expect(CONTROL_FORMATS[hashText("%c")]).toBeDefined()
    expect(CONTROL_FORMATS[hashText("%c\n")]).toBeDefined()
  })
})

describe("controlForFormat / controlForHash", () => {
  it("\\n, \\n\\n and '    \\n' resolve to a newline control with no args", () => {
    expect(controlForFormat("\n", [])).toEqual({ kind: "newline" })
    expect(controlForFormat("\n\n", [])).toEqual({ kind: "newline" })
    expect(controlForFormat("    \n", [])).toEqual({ kind: "newline" })
    expect(controlForHash(hashText("\n"), [])).toEqual({ kind: "newline" })
    expect(controlForHash(hashText("    \n"), [])).toEqual({ kind: "newline" })
  })

  it("rejects newline formats whose guard fails (spurious args)", () => {
    expect(controlForFormat("\n", ["unexpected"])).toBeNull()
    expect(controlForFormat("\n\n", ["x"])).toBeNull()
  })

  it("%c is a prompt glyph only when the argument is exactly the 0x10 CHARSET_PROMPT byte", () => {
    expect(controlForFormat("%c", [String.fromCharCode(CHARSET_PROMPT)])).toEqual({ kind: "prompt-glyph" })
    expect(controlForHash(hashText("%c"), [String.fromCharCode(CHARSET_PROMPT)])).toEqual({ kind: "prompt-glyph" })
    // Misuse guards: a visible letter is not the idle prompt; neither is a
    // missing argument or a multi-char one.
    expect(controlForFormat("%c", ["A"])).toBeNull()
    expect(controlForFormat("%c", [])).toBeNull()
    expect(controlForFormat("%c", ["\x10\x10"])).toBeNull()
  })

  it("%c\\n is an echo only when the argument is one ASCII letter or digit", () => {
    expect(controlForFormat("%c\n", ["h"])).toEqual({ kind: "echo", text: "h" })
    expect(controlForFormat("%c\n", ["1"])).toEqual({ kind: "echo", text: "1" })
    expect(controlForHash(hashText("%c\n"), ["Q"])).toEqual({ kind: "echo", text: "Q" })
    // Guards: multi-char, non-alphanumeric or missing args are not the echo.
    expect(controlForFormat("%c\n", ["ab"])).toBeNull()
    expect(controlForFormat("%c\n", ["가"])).toBeNull()
    expect(controlForFormat("%c\n", [" "])).toBeNull()
    expect(controlForFormat("%c\n", [])).toBeNull()
  })

  it("rejects a known format whose guard fails (the arg makes it a real message)", () => {
    // "%c\n" is legitimately the AlphaActionController echo, but a color-code
    // byte (0x13..0x19) is not a single alphanumeric -- the guard rejects it.
    expect(controlForFormat("%c\n", [String.fromCharCode(0x17)])).toBeNull()
  })

  it("returns null for any format that is not in the control table", () => {
    expect(controlForFormat("Enter %s!\n\n", [])).toBeNull()
    expect(controlForHash(hashText("You find a Fountain."), [])).toBeNull()
  })
})