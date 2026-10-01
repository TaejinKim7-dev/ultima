// Todo 26: receiver for vendor/xu4/src/intro.cpp's web view channel
// (EM_JS -> `Module.u4View.show(...)` / `.hide(...)`). The intro draws every
// screen through TextView::textAt*, which the native engine rasterizes into
// its canvas in English; this receiver turns each screen into a `view`
// bridge event so the shell can lay a Korean DOM overlay (with an opaque
// backing, see overlay-layout.ts's hasOpaqueBacking) over that TextView's
// rectangle.
//
// Wire format (a plain string, one EM_JS call per redraw):
//   rows      : separated by "\n" (an empty row keeps its native y slot)
//   row       : one or more segments joined by "\x1e" (the gypsy line
//               "<virtue> and <virtue>. She says" is drawn in two textAt calls)
//   segment   : fields joined by "\x1f" = [template, ...args]
//   template  : either "@<id>" (TITLE.EXE-backed text: the engine sends the
//               semantic id -- "title.exe:introText:3" -- and NEVER the
//               original English) or an xu4 source literal (open-source
//               code string, resolved through GENERATED_INTRO_TEMPLATES)
//   args      : value strings substituted, in order, for the template's
//               %s / %d tokens ("On", "3", or "@id" for TITLE.EXE text)
//
// Pure apart from the injected dispatch: no DOM, no engine.

import { BRIDGE_ABI_VERSION, VIEW_REGIONS, type BridgeEvent, type OverlayRow, type ViewRegion } from "../bridge/types.ts"
import { hasTranslation, resolveDisplayText, resolveIntroTemplateId } from "../i18n/localization.ts"
import { DEFAULT_STATUS_VIEW_DEPS, composeStatusRows, type StatusViewDeps } from "./status-view.ts"

/** Shown for an @id with no ready translation (the English original is never available here). */
export const MISSING_INTRO_TRANSLATION = "[미번역]"
/** Prefixed to an open-source xu4 literal that has no ready Korean translation. */
export const UNTRANSLATED_LITERAL_MARK = "[영문] "

/**
 * Regions whose payload is `vendor/xu4/src/stats.cpp` output and so speaks
 * the status wire grammar (see `status-view.ts`'s header), not the intro one.
 * Todo 31 adds "statussummary" -- the food/gold row is emitted by the same
 * EM_JS channel with the same literal-and-args grammar, so it must be
 * composed by `composeStatusRows`; routing it to `composeIntroRows` would
 * resolve its literals through the intro template table and render them as
 * untranslated.
 */
const STATUS_GRAMMAR_REGIONS: ReadonlySet<string> = new Set(["status", "statussummary"])

const ROW_SEPARATOR = "\n"
const SEGMENT_SEPARATOR = "\x1e"
const FIELD_SEPARATOR = "\x1f"
const ID_PREFIX = "@"
const FORMAT_TOKEN = /%[-+ 0#]*\d*[sd]/g
const INDENT_CELL = "\u2003"

export interface IntroViewDeps {
  /** Maps an intro.cpp literal to its `ui:intro:<n>` id, if inventoried. */
  templateId(literal: string): string | undefined
  /** Resolves an id to Korean, returning `fallback` when no translation is ready. */
  resolve(id: string, fallback: string): string
}

export const DEFAULT_INTRO_VIEW_DEPS: IntroViewDeps = {
  templateId: (literal) => resolveIntroTemplateId(literal),
  resolve: (id, fallback) => (hasTranslation(id) ? resolveDisplayText(id, fallback) : fallback)
}

// Menu value strings xu4 draws through %s (BoolMenuItem's On/Off, the video
// mode names, the volume words). Enum names such as filter/gem-layout names
// are xu4's own technical labels and pass through unchanged.
const VALUE_TRANSLATIONS: Readonly<Record<string, string>> = {
  On: "켬",
  Off: "끔",
  Fullscreen: "전체 화면",
  Window: "창 모드",
  Disabled: "사용 안 함",
  Full: "최대"
}

function translateValue(value: string): string {
  const exact = VALUE_TRANSLATIONS[value]
  if (exact !== undefined) {
    return exact
  }
  return value.replace(/(\d)\s*sec\b/g, "$1초")
}

// The engine's bitmap font uses control codes as glyphs: \b (8) is the
// right-pointing arrow, \x0f (15) the left-pointing one, \t (9) the
// copyright sign. The DOM has no such glyphs.
function mapControlGlyphs(text: string): string {
  return text.replace(/[\x08\x09\x0f]/g, (ch) => (ch === "\x08" ? "▸" : ch === "\x0f" ? "◂" : "©"))
}

function resolveFieldText(field: string, deps: IntroViewDeps): string {
  if (field.startsWith(ID_PREFIX)) {
    const id = field.slice(ID_PREFIX.length)
    return deps.resolve(id, `${MISSING_INTRO_TRANSLATION} ${id}`)
  }
  return translateValue(field)
}

function composeSegment(segment: string, deps: IntroViewDeps): string {
  if (segment === "") {
    return ""
  }
  // A segment of only spaces is the engine's x indent: one native TextView
  // cell each, which is exactly one em at the overlay's font size.
  if (/^ +$/.test(segment)) {
    return INDENT_CELL.repeat(segment.length)
  }
  const [template = "", ...args] = segment.split(FIELD_SEPARATOR)
  let text: string
  if (template.startsWith(ID_PREFIX)) {
    text = resolveFieldText(template, deps)
  } else {
    const id = deps.templateId(template)
    if (id === undefined) {
      text = `${UNTRANSLATED_LITERAL_MARK}${template}`
    } else {
      const sentinel = `\u0000${template}`
      const resolved = deps.resolve(id, sentinel)
      text = resolved === sentinel ? `${UNTRANSLATED_LITERAL_MARK}${template}` : resolved
    }
  }
  let next = 0
  return text.replace(FORMAT_TOKEN, () => resolveFieldText(args[next++] ?? "", deps))
}

/** Turns one engine payload (see this file's header) into Korean overlay rows. */
export function composeIntroRows(payload: string, deps: IntroViewDeps = DEFAULT_INTRO_VIEW_DEPS): OverlayRow[] {
  if (payload === "") {
    return []
  }
  const rows: OverlayRow[] = []
  for (const rowSource of payload.split(ROW_SEPARATOR)) {
    const composed = mapControlGlyphs(
      rowSource
        .split(SEGMENT_SEPARATOR)
        .map((segment) => composeSegment(segment, deps))
        .join("")
    )
    // A TITLE.EXE story page is one @id whose translation carries its own
    // line breaks (and, for the gypsy glue lines, a trailing one).
    const lines = composed.replace(/\n+$/, "").split("\n")
    for (const line of lines) {
      rows.push({ label: line })
    }
  }
  return rows
}

/** The shape vendor/xu4/src/intro.cpp's EM_JS hooks call through `Module.u4View`. */
export interface IntroViewReceiver {
  show(region: string, x: number, y: number, width: number, height: number, selectedIndex: number, payload: string): void
  hide(region: string): void
}

export interface IntroViewReceiverOptions {
  readonly dispatch: (event: BridgeEvent) => boolean
  readonly deps?: IntroViewDeps
  /** Todo 27: composition deps for the in-game "status" region (stats.cpp). */
  readonly statusDeps?: StatusViewDeps
}

function isViewRegion(region: string): region is ViewRegion {
  return (VIEW_REGIONS as readonly string[]).includes(region)
}

export function createIntroViewReceiver(options: IntroViewReceiverOptions): IntroViewReceiver {
  const deps = options.deps ?? DEFAULT_INTRO_VIEW_DEPS
  const statusDeps = options.statusDeps ?? DEFAULT_STATUS_VIEW_DEPS
  // Todo 27: StatsArea::redraw() re-sends identical rows on every flash /
  // highlight cycle; only a changed status payload is worth a DOM update.
  // hide() clears it so a re-show after a hide is never swallowed. Hazard: only
  // hide() resets this, and no emitter sends `type:"clear"` yet -- wiring one up
  // without resetting lastStatus here would permanently swallow the next
  // identical status payload, dropping the status overlay entirely.
  let lastStatus: string | undefined
  return {
    show(region, x, y, width, height, selectedIndex, payload) {
      if (!isViewRegion(region)) {
        return
      }
      if (![x, y, width, height].every((value) => Number.isInteger(value))) {
        return
      }
      if (region === "status") {
        const key = [x, y, width, height, selectedIndex, payload].join("|")
        if (key === lastStatus) {
          return
        }
        lastStatus = key
      }
      const rows: OverlayRow[] = STATUS_GRAMMAR_REGIONS.has(region)
        ? composeStatusRows(payload, statusDeps)
        : composeIntroRows(payload, deps)
      options.dispatch({
        abiVersion: BRIDGE_ABI_VERSION,
        type: "view",
        region,
        text: rows.map((row) => row.label).join("\n"),
        rows,
        ...(Number.isInteger(selectedIndex) && selectedIndex >= 0 ? { selectedIndex } : {}),
        rect: { x, y, width, height }
      })
    },
    hide(region) {
      if (!isViewRegion(region)) {
        return
      }
      if (region === "status") {
        lastStatus = undefined
      }
      options.dispatch({ abiVersion: BRIDGE_ABI_VERSION, type: "view", region, text: "" })
    }
  }
}
