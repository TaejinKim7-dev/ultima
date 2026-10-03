// Todo 23: composes one Korean dialogue-panel line from a real engine
// screenMessage() call. vendor/xu4/src/screen.cpp's web build (EM_JS ->
// `Module.u4Text.message`) sends each call as the FNV-1a hash of its format
// bytes plus the engine's own pre-formatted string for every printf
// conversion (`%c`, `%d`, `%3d`, `%.1X`, `%s`, ...), so this side never
// re-implements printf. The format text itself is deliberately not sent: a
// few call sites (castle/codex) pass original AVATAR.EXE text as the format,
// and a hash that is not in GENERATED_UI_TEMPLATES is dropped silently.
//
// Pure (no DOM, no engine): the shell injects the real lookups.

import { hashText, type CoverageMiss } from "../i18n/coverage.ts"

/** Matches one printf conversion; `%%` is the literal percent sign. */
const CONVERSION = /%[-+ 0#]*\d*(?:\.\d+)?[a-zA-Z%]/g

/**
 * Todo 45: text-free formats whose text rides in the first `%s` argument
 * (`"%s\n"` after a direction or weapon prompt, `"%s"`), each with what the
 * format itself adds after the argument. Keyed by the format's hash.
 */
export const FORMAT_ONLY_HASHES: Readonly<Record<string, string>> = {
  [hashText("%s\n")]: "\n",
  [hashText("%s")]: ""
}

export interface UiMessageDeps {
  /** Maps a format hash (8 lowercase hex digits) to its ui/module id, if inventoried. */
  templateId(hash: string): string | undefined
  /** Resolves an id to Korean, returning `fallback` when no translation is ready. */
  resolve(id: string, fallback: string): string
  /** Maps an English module config name (e.g. "Dagger") used as a `%s` argument to its module id. */
  moduleNameId(text: string): string | undefined
  /** Todo 38: optional measurement hook (hashes/ids only); never changes the composed text. */
  onMiss?: (miss: CoverageMiss) => void
}

/**
 * The Korean line for one screenMessage() call, or null when the format is
 * not one we translate (never fall back to English: it may be original
 * game data).
 */
export function composeUiMessage(hash: string, args: readonly string[], deps: UiMessageDeps): string | null {
  const id = deps.templateId(hash)
  if (id === undefined) {
    const suffix = FORMAT_ONLY_HASHES[hash]
    if (suffix !== undefined) {
      // The format carries no text; the argument is the text. Translate it by name, or drop it.
      const nameId = deps.moduleNameId(args[0] ?? "")
      const name = nameId === undefined ? "" : deps.resolve(nameId, "")
      if (name !== "") {
        return name + suffix
      }
    }
    deps.onMiss?.({ kind: "ui-unmapped", hash })
    return null
  }
  const template = deps.resolve(id, "")
  if (template === "") {
    return null
  }
  let next = 0
  return template.replace(CONVERSION, (conversion) => {
    if (conversion === "%%") {
      return "%"
    }
    const position = next++
    const arg = args[position] ?? ""
    if (conversion.endsWith("s")) {
      const nameId = deps.moduleNameId(arg)
      if (nameId !== undefined) {
        return deps.resolve(nameId, arg)
      }
      if (arg !== "") {
        deps.onMiss?.({ kind: "arg-passthrough", id, position, argHash: hashText(arg) })
      }
    }
    return arg
  })
}

/**
 * Wraps composeUiMessage for the EM_JS call site. An exception thrown here
 * would unwind the wasm game loop, so every failure is contained and
 * reported through `onError` (never console output for a dropped call).
 */
export function createUiMessageHandler(
  deps: UiMessageDeps,
  emit: (text: string) => void,
  onError: (error: unknown) => void = () => {}
): (hash: string, args: readonly string[]) => void {
  return (hash, args) => {
    try {
      const text = composeUiMessage(hash, args, deps)
      if (text !== null) {
        emit(text)
      }
    } catch (error) {
      onError(error)
    }
  }
}

/**
 * Todo 40: the Korean line for one `screenMessageCenter()` call (the town /
 * castle / dungeon name after an entry message). The engine sends the hash of
 * the name's bytes (a maps.b literal, which GENERATED_UI_TEMPLATES maps like
 * any other) and the number of newlines it appends after it. Null when the name
 * is not one we translate (never fall back to English).
 */
export function composeCenterMessage(hash: string, newlines: number, deps: UiMessageDeps): string | null {
  const text = composeUiMessage(hash, [], deps)
  return text === null ? null : text + "\n".repeat(Math.max(0, Math.min(newlines, 8)))
}

/** The EM_JS call site's wrapper for composeCenterMessage; contains every failure like createUiMessageHandler. */
export function createCenterHandler(
  deps: UiMessageDeps,
  emit: (text: string) => void,
  onError: (error: unknown) => void = () => {}
): (hash: string, newlines: number) => void {
  return (hash, newlines) => {
    try {
      const text = composeCenterMessage(hash, newlines, deps)
      if (text !== null) {
        emit(text)
      }
    } catch (error) {
      onError(error)
    }
  }
}
