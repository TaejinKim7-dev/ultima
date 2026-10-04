// Todo 49 Phase A: the control-only message format table.
//
// The web shell receives every screenMessage() call as the FNV-1a hash of its
// format bytes plus the engine's own pre-formatted printf arguments (see
// src/dialogue/ui-message-compose.ts). A handful of formats carry NO
// translatable text -- they are pure line breaks, the idle prompt glyph, or a
// one-key player echo. This module maps them to control descriptors, each
// with a guard so a format is never mistaken for control when its actual
// arguments make it a real message.
//
// Verified against the real call sites (not guessed):
//   "\n"        screenMessage("\n")      -- e.g. cheat.cpp:407, codex.cpp:97
//   "\n\n"      screenMessage("\n\n")    -- blank-line break
//   "    \n"    game.cpp:1478            -- cancelled direction prompt's line
//   "%c"        screen.cpp:369           -- screenPrompt()'s CHARSET_PROMPT
//   "%c\n"      event.cpp:864            -- AlphaActionController letter echo
//
// The hash keys are computed with src/i18n/coverage.ts's hashText, which is
// byte-identical to the engine's webFormatHash (see tests/unit/screen-hash-
// parity). Phase B wires controlForHash into the message handler; until then
// this module only classifies.
import { hashText } from "../i18n/coverage.ts"

/** The idle prompt glyph byte (u4.h CHARSET_PROMPT, octal 020). */
export const CHARSET_PROMPT = 0x10

/** The control behaviours a control-only format can request. */
export type ControlFormat =
  /** Commit the current line and start a new one (like the panel's `newline` token). */
  | { readonly kind: "newline" }
  /** The idle "ready for input" prompt glyph (rendered as "▶" in the overlay). */
  | { readonly kind: "prompt-glyph" }
  /** One echoed key the player pressed (a temporary cell in the message area). */
  | { readonly kind: "echo"; readonly text: string }

export interface ControlFormatEntry {
  /** The literal printf format this entry describes (for readability/tests). */
  readonly format: string
  /** The control this format maps to when its guard passes. */
  readonly control: ControlFormat
  /** Returns true only when `args` really are the control-only use. */
  readonly guard: (args: readonly string[]) => boolean
}

const noArgs: (args: readonly string[]) => boolean = (args) => args.length === 0

const singleAsciiAlnum: (args: readonly string[]) => boolean = (args) =>
  args.length >= 1 && args[0]!.length === 1 && /[A-Za-z0-9]/.test(args[0]!)

const singleCharIsPrompt: (args: readonly string[]) => boolean = (args) =>
  args.length >= 1 && args[0]!.length === 1 && args[0]!.charCodeAt(0) === CHARSET_PROMPT

/** The five control-only formats, keyed by FNV-1a hash (webFormatHash parity). */
export const CONTROL_FORMATS: Readonly<Record<string, ControlFormatEntry>> = {
  [hashText("\n")]: { format: "\n", control: { kind: "newline" }, guard: noArgs },
  [hashText("\n\n")]: { format: "\n\n", control: { kind: "newline" }, guard: noArgs },
  [hashText("    \n")]: { format: "    \n", control: { kind: "newline" }, guard: noArgs },
  [hashText("%c")]: {
    format: "%c",
    control: { kind: "prompt-glyph" },
    guard: singleCharIsPrompt
  },
  [hashText("%c\n")]: {
    format: "%c\n",
    control: { kind: "echo", text: "" }, // `text` is filled from args when the guard passes
    guard: singleAsciiAlnum
  }
}

/** Looks a format string up by its literal bytes; null when it is not a control-only format or its guard rejects the args. */
export function controlForFormat(format: string, args: readonly string[]): ControlFormat | null {
  return controlForHash(hashText(format), args)
}

/** Looks a format hash up (the shape the engine actually sends); null when not a control-only format or the guard rejects the args. */
export function controlForHash(hash: string, args: readonly string[]): ControlFormat | null {
  const entry = CONTROL_FORMATS[hash]
  if (entry === undefined || !entry.guard(args)) {
    return null
  }
  if (entry.control.kind === "echo") {
    return { kind: "echo", text: args[0] ?? "" }
  }
  return entry.control
}