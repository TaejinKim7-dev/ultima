// Todo 27: receiver-side composition for vendor/xu4/src/stats.cpp's status
// column channel (EM_JS -> `Module.u4View.show("status", ...)`). The native
// StatsArea rasterizes the party/Ztats/inventory views in English into its
// TextViews; the web shell lays a Korean DOM overlay (opaque backing, see
// overlay-layout.ts's hasOpaqueBacking) over the same rectangle.
//
// Wire format (a plain string, one EM_JS call per changed redraw):
//   rows      : separated by "\n" (an empty row keeps its native y slot)
//   row       : `label [\x1d value]` -- the value part is right-aligned by the
//               overlay's CSS grid (party HP + status), never column math
//   part      : segments joined by "\x1e"
//   segment   : fields joined by "\x1f" = [template, ...args]
//   template  : "=<text>" is engine-composed layout (glyphs, separators; never
//               translated); anything else is an xu4 stats.cpp literal
//               resolved through GENERATED_STATUS_TEMPLATES
//   args      : substituted, in order, for the template's %s / %d / %02d
//               tokens:
//                 "'<text>"      verbatim user data (player names). The
//                                leading apostrophe is stripped; nothing
//                                inside is interpreted, so a name such as
//                                "On" or "@id" renders as typed.
//                 "=<kind>:<English>" a named game object: weapon,
//                                weaponAbbrev, armor, class (module config
//                                translations), status, mark, sex, item
//                                (small fixed tables below)
//                 "@<id>"        a semantic id
//                 anything else  verbatim (numbers already formatted by the
//                                engine)
//
// Pure apart from the injected dispatch: no DOM, no engine.

import { resolveStatusName, resolveStatusTemplateId, hasTranslation, resolveDisplayText } from "../i18n/localization.ts"

/** Prefixed to an open-source stats.cpp literal that has no ready Korean translation. */
export const UNTRANSLATED_STATUS_MARK = "[영문] "

const ROW_SEPARATOR = "\n"
const SEGMENT_SEPARATOR = "\x1e"
const FIELD_SEPARATOR = "\x1f"
const VALUE_SEPARATOR = "\x1d"
const FORMAT_TOKEN = /%[-+ 0#]*\d*[csd]/g
const LAYOUT_PREFIX = "="
const VERBATIM_PREFIX = "'"
const ID_PREFIX = "@"

export interface StatusViewDeps {
  /** Maps a stats.cpp literal to its `ui:stats:<n>` id, if inventoried. */
  templateId(literal: string): string | undefined
  /** Resolves an id to Korean, returning `fallback` when no translation is ready. */
  resolve(id: string, fallback: string): string
  /** Korean name of a weapon/weaponAbbrev/armor/class, or undefined (caller falls back to English). */
  name(kind: string, english: string): string | undefined
}

export const DEFAULT_STATUS_VIEW_DEPS: StatusViewDeps = {
  templateId: (literal) => resolveStatusTemplateId(literal),
  resolve: (id, fallback) => (hasTranslation(id) ? resolveDisplayText(id, fallback) : fallback),
  name: (kind, english) => resolveStatusName(kind, english)
}

// The party view's status letter (savegame StatusType), the sex glyph code
// and the active-member marker are engine bitmap-font codes, not text.
const STATUS_LETTERS: Readonly<Record<string, string>> = { G: "양호", P: "중독", S: "수면", D: "사망" }
const SEX_CODES: Readonly<Record<string, string>> = { "11": "남", "12": "여", M: "남", F: "여" }
const MARKS: Readonly<Record<string, string>> = { "1": "●", "0": "-" }
// vendor/xu4/src/names.cpp getItemName(): xu4's own item words.
const ITEM_NAMES: Readonly<Record<string, string>> = {
  Bell: "종",
  Book: "책",
  Candle: "양초",
  Horn: "뿔피리",
  Wheel: "바퀴",
  Skull: "해골"
}
const FIXED_KINDS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: STATUS_LETTERS,
  sex: SEX_CODES,
  mark: MARKS,
  item: ITEM_NAMES
}

function resolveObject(spec: string, deps: StatusViewDeps): string {
  const colon = spec.indexOf(":")
  if (colon < 0) {
    return spec
  }
  const kind = spec.slice(0, colon)
  const value = spec.slice(colon + 1)
  const fixed = FIXED_KINDS[kind]
  if (fixed !== undefined) {
    return Object.hasOwn(fixed, value) ? (fixed[value] as string) : value
  }
  // Unmapped weapon/armor/class: the open-source English module string.
  return deps.name(kind, value) ?? value
}

function resolveArg(arg: string, deps: StatusViewDeps): string {
  if (arg.startsWith(VERBATIM_PREFIX)) {
    return arg.slice(VERBATIM_PREFIX.length)
  }
  if (arg.startsWith(LAYOUT_PREFIX)) {
    return resolveObject(arg.slice(LAYOUT_PREFIX.length), deps)
  }
  if (arg.startsWith(ID_PREFIX)) {
    const id = arg.slice(ID_PREFIX.length)
    return deps.resolve(id, id)
  }
  return arg
}

function composeSegment(segment: string, deps: StatusViewDeps): string {
  if (segment === "") {
    return ""
  }
  const [template = "", ...args] = segment.split(FIELD_SEPARATOR)
  let text: string
  if (template.startsWith(LAYOUT_PREFIX)) {
    text = template.slice(LAYOUT_PREFIX.length)
  } else {
    const id = deps.templateId(template)
    if (id === undefined) {
      text = `${UNTRANSLATED_STATUS_MARK}${template}`
    } else {
      const sentinel = `\u0000${template}`
      const resolved = deps.resolve(id, sentinel)
      text = resolved === sentinel ? `${UNTRANSLATED_STATUS_MARK}${template}` : resolved
    }
  }
  let next = 0
  return text.replace(FORMAT_TOKEN, () => resolveArg(args[next++] ?? "", deps))
}

function composePart(part: string, deps: StatusViewDeps): string {
  return part
    .split(SEGMENT_SEPARATOR)
    .map((segment) => composeSegment(segment, deps))
    .join("")
}

export interface StatusRow {
  readonly label: string
  readonly value?: string
}

/** Turns one engine payload (see this file's header) into Korean overlay rows. */
export function composeStatusRows(payload: string, deps: StatusViewDeps = DEFAULT_STATUS_VIEW_DEPS): StatusRow[] {
  if (payload === "") {
    return []
  }
  return payload.split(ROW_SEPARATOR).map((rowSource) => {
    const at = rowSource.indexOf(VALUE_SEPARATOR)
    if (at < 0) {
      return { label: composePart(rowSource, deps) }
    }
    return {
      label: composePart(rowSource.slice(0, at), deps),
      value: composePart(rowSource.slice(at + VALUE_SEPARATOR.length), deps)
    }
  })
}
