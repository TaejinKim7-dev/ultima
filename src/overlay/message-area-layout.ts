// Todo 49 Phase A: the message area's fixed logical rect and the device-pixel
// font-size math for the Korean in-game overlay.
//
// The native message area is TEXT_AREA, a 16x12 grid of 8x8 character cells
// (vendor/xu4/src/u4.h:62-65): TEXT_AREA_X=24, TEXT_AREA_Y=12, TEXT_AREA_W=16,
// TEXT_AREA_H=12 -> (24*8, 12*8, 16*8, 12*8) = (192, 96, 128, 96) in the
// 320x200 world raster.
//
// Sizing rule (docs/plans/2026-10-04-in-game-korean.md Stage 2, user decision
// 2026-10-04): Hangul is 16x16 native px, so the overlay font must stay a
// device-pixel multiple of 16 to remain pixel-crisp. With k =
// floor(boxHeight / (12*16)), font = 16k device px, 12 lines, and each row's
// line height = floor(boxHeight / 12) so the 12 rows exactly fill the box.
// At exactly 2x display one Hangul fills one original 8x8 cell (16 columns).
// Documented capacity examples pin the math: 2x -> 16 chars, a
// 1280x720-class box -> 20 chars, a 1366-class box -> 22 chars.
//
// Pure and DOM-free; `src/shell.ts` (Phase B) turns the metrics into CSS.
import type { CssRect, LogicalRect } from "./overlay-layout.ts"

/** The native message-area rect, TEXT_AREA_* in 320x200 raster pixels. */
export const MESSAGE_AREA_RECT: LogicalRect = { x: 192, y: 96, width: 128, height: 96 }

/** The message area always shows exactly this many lines. */
export const MESSAGE_AREA_LINES = 12

/** Hangul's native glyph size in logical px -- the crispness quantum. */
export const MESSAGE_AREA_FONT_UNIT = 16

/** The overlay metrics for one displayed box. */
export interface MessageAreaMetrics {
  /** Font size in CSS px -- 16k device px converted back through dpr. */
  readonly fontCssPx: number
  /** One row's line-height in CSS px -- floor(boxHeight/12) / dpr. */
  readonly lineHeightCssPx: number
  /** Full Hangul columns that fit the box width at the chosen font. */
  readonly columns: number
  /** Always MESSAGE_AREA_LINES. */
  readonly lines: number
}

/**
 * Computes the message-area overlay's font/line metrics from the displayed
 * box (a CSS-pixel rect -- e.g. `toCssRect(MESSAGE_AREA_RECT, ...)` from
 * src/overlay/overlay-layout.ts) and the devicePixelRatio.
 *
 * All sizing happens in DEVICE pixels so the font stays on the 16px grid the
 * pixel font is crisp at; the returned CSS values are converted back via dpr.
 * k is floored and clamped to >= 1 so the font never collapses below one
 * 16-device-px step even in a degenerate sub-2x box.
 */
export function computeMessageAreaMetrics(rect: { readonly width: number; readonly height: number }, dpr = 1): MessageAreaMetrics {
  const deviceWidth = rect.width * dpr
  const deviceHeight = rect.height * dpr
  const k = Math.max(1, Math.floor(deviceHeight / (MESSAGE_AREA_LINES * MESSAGE_AREA_FONT_UNIT)))
  const fontDevicePx = MESSAGE_AREA_FONT_UNIT * k
  const lineHeightDevicePx = Math.floor(deviceHeight / MESSAGE_AREA_LINES)
  return {
    fontCssPx: fontDevicePx / dpr,
    lineHeightCssPx: lineHeightDevicePx / dpr,
    columns: Math.floor(deviceWidth / fontDevicePx),
    lines: MESSAGE_AREA_LINES
  }
}

/** A convenience alias so callers can pass a full CSS rect where the metric function only needs width/height. */
export type { CssRect }