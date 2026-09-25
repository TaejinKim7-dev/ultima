// Todo 12: status/menu/short-in-game-text DOM overlays. This module is the
// DOM-free layout core: it converts the native engine's *fixed* logical
// screen-space rects (320x200 world raster coordinates, exactly as the real
// xu4 engine still draws them onto its own WebGL2 canvas today) into CSS
// pixel rects positioned over that canvas, accounting for the canvas's
// actual displayed size/offset and devicePixelRatio. `src/shell.ts` is the
// only place that turns this into real DOM elements (createElement/
// textContent only -- see tests/unit/message-tokens.test.ts's innerHTML
// safety guard, which scans all of src/, this file included).
//
// Verified against the real engine before writing any of this (not
// guessed): `vendor/xu4/src` and `scripts/` contain zero occurrences of
// EM_JS/EM_ASM/emscripten_run_script/ccall/ultimaBridge -- there is no
// C++->JS bridge call for screen/status/menu text at all today (only the
// reverse direction exists: `web_bridge.h`/`web_bridge.cpp`'s
// u4_web_enqueue_key/u4_web_submit_text carry JS input INTO the engine).
// `screenMessage`/`StatsArea`/`TextView` all still draw straight into the
// raster canvas natively. So, exactly like Todo 11's message panel, this
// Todo's tests drive `ViewBridgeEvent`s through synthetic
// `window.ultimaBridge.dispatch(...)` calls -- there is nothing to observe
// from the real wasm build yet for status/menu output specifically.
//
// Native logical rects (TextView(x, y, columns, rows) -- x/y already in
// pixels at the call site, but columns/rows are CHAR_WIDTH/CHAR_HEIGHT=8
// character cells, not pixels):
//   status (StatsArea::mainArea, stats.cpp:28, stats.h STATS_AREA_X/Y/
//     WIDTH/HEIGHT, u4.h TEXT_AREA_X=24):
//       (STATS_AREA_X*8, STATS_AREA_Y*8, 15*8, 8*8) = (192, 8, 120, 64)
//   menu (Intro::menuArea, intro.cpp:170):
//       (1*8, 13*8, 38*8, 11*8) = (8, 104, 304, 88)
//   textview (Intro::extendedMenuArea, intro.cpp:171 -- the closest thing
//     the native source has to a *generic* short-text overlay outside the
//     status column; shrine.cpp/codex.cpp/vendor screens each use their own
//     one-off TextView rects, so this is a reasonable, cited stand-in, not
//     a universal constant):
//       (2*8, 10*8, 36*8, 13*8) = (16, 80, 288, 104)
//
// menuArea and extendedMenuArea overlap each other in raw geometry (see
// DEFAULT_VIEW_RECTS's own test in tests/unit/overlay-layout.test.ts) --
// that is real and intentional, not a bug: they are alternate screens of
// the SAME intro flow (the video/sound/input config sub-menu replaces the
// main Options menu, drawn at a different time, never simultaneously). The
// OverlayRegistry below models this directly: registering a role again
// REPLACES its previous entry, so "menu" and "textview" are the only pair
// this module does not guarantee non-overlapping -- status+menu and
// status+textview (the pairs that ARE realistically shown at once: the
// status column persists during gameplay while a menu or text panel opens
// over the map) are guaranteed disjoint instead.
//
// Rendering rule (the "Must NOT" half of this Todo): no 8x8 Hangul bitmap
// font, and no fixed-space/monospace-English column math applied to Korean
// text -- Korean glyphs are wider and have different metrics than the
// native bitmap font's fixed 8px cells. So this module exposes structured
// `OverlayRow` (label/value) content (see src/bridge/types.ts's additive
// ViewBridgeEvent.rows/selectedIndex fields) that `shell.ts` renders as a
// CSS grid -- the browser's own font stack lays out each column's width to
// fit its own widest cell, instead of this code pre-computing a fixed
// character count per field.

import type { OverlayRow, ViewRegion } from "../bridge/types.ts"

/** A rect in the native 320x200 logical screen-space (raster pixels). */
export interface LogicalRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The canvas's actual displayed area, in CSS pixels, relative to whatever
 * positioning ancestor the overlay DOM elements are absolutely positioned
 * within (see `computeContentRect`'s doc comment for exactly which
 * coordinate space this is -- NOT page-absolute in general, though it often
 * numerically comes out that way for this repo's current DOM structure).
 */
export interface ContentRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** A rect in CSS pixels, ready to assign to `style.left/top/width/height`. */
export interface CssRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The minimal shape of `Element.getBoundingClientRect()` this module needs. */
export interface ClientRectLike {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** The minimal shape of an `Element` this module needs for border-offset math (`clientLeft`/`clientTop` are exactly the border widths, per the DOM spec -- see `computeContentRect`). */
export interface OffsetAncestor {
  getBoundingClientRect(): ClientRectLike
  readonly clientLeft: number
  readonly clientTop: number
}

/** The native world raster's fixed logical resolution (xu4.cpp/u4.h). Desktop always displays this at >=2x -- see shell.css's `.viewport { min-width: 640px }`. */
export const LOGICAL_SCREEN_WIDTH = 320
export const LOGICAL_SCREEN_HEIGHT = 200

/** One of the three DOM-overlay roles this Todo's bridge ABI defines (`src/bridge/types.ts`'s `VIEW_REGIONS`). */
export type OverlayRole = ViewRegion

/** The fixed native logical rect used as each role's default overlay position -- see this module's doc comment for the exact source citations. */
export const DEFAULT_VIEW_RECTS: Readonly<Record<OverlayRole, LogicalRect>> = {
  status: { x: 192, y: 8, width: 120, height: 64 },
  menu: { x: 8, y: 104, width: 304, height: 88 },
  textview: { x: 16, y: 80, width: 288, height: 104 }
}

/**
 * The one cell native code draws with a *masked glyph* rather than text --
 * `StatsArea::summary.drawCharMasked(CHARSET_ANKH, STATS_AREA_WIDTH/2, 0,
 * mask)` (stats.cpp:205; the aura glyph at stats.cpp:198 shares the same
 * cell). Column `STATS_AREA_WIDTH/2` = 15/2 = 7 (integer division) within
 * the `summary` TextView at (192, 80, 120, 8) -> absolute cell (248, 80, 8,
 * 8). This must stay in the WebGL raster canvas, uncovered by any opaque
 * DOM overlay -- see this module's own test asserting `DEFAULT_VIEW_RECTS
 * .status` (which stops at y=72, before summary's y=80) never overlaps it.
 */
export const AVATAR_AURA_GLYPH_RECT: LogicalRect = { x: 248, y: 80, width: 8, height: 8 }

/** One role's full registered content: its logical rect, plus optional plain text or structured rows/selection (see `src/bridge/types.ts`'s `ViewBridgeEvent`). */
export interface OverlayEntry {
  readonly rect: LogicalRect
  readonly text?: string
  readonly rows?: readonly OverlayRow[]
  readonly selectedIndex?: number
}

/**
 * Tracks each overlay role's current content. Pure in-memory state -- no
 * DOM, no rendering; `src/shell.ts` reads it back out to build/position the
 * actual DOM elements. `register` replacing a role's previous entry (rather
 * than requiring an explicit `clear` first) matches native reality: only
 * one "menu"-role screen is ever shown at a time (see this module's doc
 * comment on `menuArea`/`extendedMenuArea`).
 */
export class OverlayRegistry {
  private readonly entries = new Map<OverlayRole, OverlayEntry>()

  register(role: OverlayRole, entry: OverlayEntry): void {
    this.entries.set(role, entry)
  }

  /** Removes one role's registration, leaving every other role untouched. */
  clear(role: OverlayRole): void {
    this.entries.delete(role)
  }

  /** Removes every registered role at once -- a full stage transition (the bridge's `clear` event; see `src/shell.ts`). */
  resetStage(): void {
    this.entries.clear()
  }

  get(role: OverlayRole): OverlayEntry | undefined {
    return this.entries.get(role)
  }

  list(): ReadonlyArray<{ role: OverlayRole; entry: OverlayEntry }> {
    return [...this.entries.entries()].map(([role, entry]) => ({ role, entry }))
  }
}

/** The content rect's scale factor against the fixed 320x200 logical screen, X and Y computed independently (never assume the content rect is exactly 16:10 -- see this module's doc comment on `object-fit: fill`). */
export function computeScale(content: ContentRect): { scaleX: number; scaleY: number } {
  return {
    scaleX: content.width / LOGICAL_SCREEN_WIDTH,
    scaleY: content.height / LOGICAL_SCREEN_HEIGHT
  }
}

/** Rounds `value` to the nearest 1/dpr step -- i.e. the nearest real device pixel at that devicePixelRatio, expressed back in CSS px. A non-finite/non-positive dpr is treated as "don't snap" (returns `value` unchanged). */
function snapToDevicePixel(value: number, dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) {
    return value
  }
  return Math.round(value * dpr) / dpr
}

/**
 * Converts a logical (320x200 raster-space) rect into a CSS pixel rect
 * positioned over `content` (the canvas's actual displayed area -- see
 * `computeContentRect`). `dpr` (devicePixelRatio) is used ONLY to snap the
 * two edges to the nearest real device pixel, never to rescale the
 * position/size a second time -- `getBoundingClientRect()` and CSS
 * `left`/`top`/`width`/`height` are already DPR-independent CSS pixel
 * values, so multiplying by `dpr` anywhere in the scale math itself would
 * double-apply it (a real bug this module's own DPR-variant test guards
 * against).
 *
 * Each edge (left, top, right, bottom) is computed and snapped
 * INDEPENDENTLY, then width/height are derived from the snapped edges --
 * never snap width/height directly. Otherwise two logically-adjacent rects
 * (e.g. a title bar's bottom edge and a body's top edge at the same
 * logical y) can round to different pixel edges at a non-integer scale
 * factor, opening or closing a 1px gap between them -- exactly what would
 * make an overlap/alignment check flaky at odd viewport widths.
 */
export function toCssRect(logical: LogicalRect, content: ContentRect, dpr = 1): CssRect {
  const { scaleX, scaleY } = computeScale(content)

  const left = snapToDevicePixel(content.left + logical.x * scaleX, dpr)
  const top = snapToDevicePixel(content.top + logical.y * scaleY, dpr)
  const right = snapToDevicePixel(content.left + (logical.x + logical.width) * scaleX, dpr)
  const bottom = snapToDevicePixel(content.top + (logical.y + logical.height) * scaleY, dpr)

  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Computes the canvas's displayed area (`ContentRect`) in the coordinate
 * space overlay DOM elements are positioned in -- i.e. relative to their
 * positioning ancestor's PADDING box (the actual CSS containing block for
 * an absolutely-positioned descendant), not the page/viewport.
 * `Element.getBoundingClientRect()` returns the BORDER box, and
 * `clientLeft`/`clientTop` are defined by the DOM spec as exactly the
 * ancestor's left/top border widths -- subtracting them converts border-box
 * page coordinates into padding-box-relative coordinates. With this repo's
 * current DOM structure (the canvas is its positioned ancestor's only
 * normal-flow child, sized 100%/100% of that ancestor's content box), this
 * comes out to (0, 0) with the canvas's own width/height -- but the general
 * form here stays correct if that ever changes (e.g. a future
 * `object-fit: contain` canvas whose drawn image is inset within its own
 * box).
 */
export function computeContentRect(canvas: ClientRectLike, positioningAncestor: OffsetAncestor): ContentRect {
  const ancestorBox = positioningAncestor.getBoundingClientRect()
  const paddingLeft = ancestorBox.left + positioningAncestor.clientLeft
  const paddingTop = ancestorBox.top + positioningAncestor.clientTop

  return {
    left: canvas.left - paddingLeft,
    top: canvas.top - paddingTop,
    width: canvas.width,
    height: canvas.height
  }
}

/** The overlay text's logical font size in native-pixel units -- deliberately smaller than CHAR_HEIGHT (8) to leave line-height room for multi-line Korean wrapping within the same logical row height. */
export const OVERLAY_BASE_FONT_PX = 7

/** No overlay text ever renders smaller than this, even at a tiny/degenerate scale -- the narrow-viewport QA scenario's readability floor. */
export const OVERLAY_MIN_FONT_PX = 10

/** Scales `OVERLAY_BASE_FONT_PX` by the content rect's vertical scale factor, never dropping below `OVERLAY_MIN_FONT_PX`. */
export function computeOverlayFontPx(scaleY: number): number {
  return Math.max(OVERLAY_MIN_FONT_PX, OVERLAY_BASE_FONT_PX * scaleY)
}

/** True if two logical (or any same-space) rects genuinely overlap on BOTH axes -- rects that only touch at a shared edge are not considered overlapping. */
export function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  const xOverlap = a.x < b.x + b.width && b.x < a.x + a.width
  const yOverlap = a.y < b.y + b.height && b.y < a.y + a.height
  return xOverlap && yOverlap
}
