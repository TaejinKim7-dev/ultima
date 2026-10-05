// Todo 22: composes one Korean dialogue-panel line from a real engine talk
// event. vendor/xu4/src/discourse_tlk.cpp's web build (EM_JS ->
// `Module.u4Text.talk`) sends each line of runTalkDialogue() as its
// printf format literal plus its `%s` arguments, where every argument that
// is TLK text arrives as an id ("@MAP:npcIndex:field", the
// locales/ko/tlk.json key shape) -- the original English TLK text never
// leaves the engine. The format literal is xu4's own open-source code
// string, so it is safe to show verbatim when no Korean template exists.
//
// Pure (no DOM, no engine): the shell injects the real lookups.

import { hashText, type CoverageMiss } from "../i18n/coverage.ts"

/** Shown in place of a TLK line that has no Korean translation (the English original is never available here). */
export const MISSING_TLK_TRANSLATION = "[미번역 대사]"

const TLK_ID_PREFIX = "@"

export interface TalkComposeDeps {
  /** Maps an English talk-template literal to its ui id, if inventoried. */
  templateId(literal: string): string | undefined
  /** Resolves an id to Korean, returning `fallback` when no translation is ready. */
  resolve(id: string, fallback: string): string
  /**
   * Todo 39: maps an English non-TLK `%s` argument (a virtue adjective, the
   * join refusal's fallback word) to its translation id. Optional: without it
   * such an argument passes through as-is.
   */
  nameId?(text: string): string | undefined
  /** Todo 38: optional measurement hook (hashes/ids only); never changes the composed text. */
  onMiss?: (miss: CoverageMiss) => void
}

/**
 * The TLK translations break lines where the original 16-column screen did
 * (user report 2026-10-05: a short reply showed as three lines). Inside a
 * paragraph a single line break becomes a space; a blank line (a paragraph or
 * a paging chunk) is kept.
 */
export function reflowSoftBreaks(text: string): string {
  return text.replace(/([^\n]) *\n *(?=[^\n])/g, "$1 ")
}

function resolveArgument(arg: string | null, position: number, templateId: string | undefined, deps: TalkComposeDeps): string {
  if (arg === null) {
    return ""
  }
  if (arg.startsWith(TLK_ID_PREFIX)) {
    return reflowSoftBreaks(deps.resolve(arg.slice(TLK_ID_PREFIX.length), MISSING_TLK_TRANSLATION))
  }
  const nameId = deps.nameId?.(arg)
  if (nameId !== undefined) {
    return deps.resolve(nameId, arg)
  }
  if (arg !== "" && templateId !== undefined) {
    deps.onMiss?.({ kind: "arg-passthrough", id: templateId, position, argHash: hashText(arg) })
  }
  return arg
}

/** Substitutes `%s` in order (and `%%` as a literal percent); a missing argument becomes empty. */
function substitute(template: string, args: readonly string[]): string {
  let next = 0
  return template.replace(/%[s%]/g, (token) => (token === "%%" ? "%" : (args[next++] ?? "")))
}

export function composeTalkLine(format: string, args: readonly (string | null)[], deps: TalkComposeDeps): string {
  const id = deps.templateId(format)
  if (id === undefined) {
    deps.onMiss?.({ kind: "talk-unmapped", hash: hashText(format) })
  }
  const template = id === undefined ? format : deps.resolve(id, format)
  return substitute(
    template,
    args.map((arg, position) => resolveArgument(arg, position, id, deps))
  )
}

/** The player's own typed keyword (plain ASCII from the native prompt), echoed as its own panel line. */
export function composeTalkInput(text: string): string {
  return `> ${text}\n`
}
