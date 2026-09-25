import { describe, expect, it } from "vitest"
import {
  AVATAR_AURA_GLYPH_RECT,
  DEFAULT_VIEW_RECTS,
  LOGICAL_SCREEN_HEIGHT,
  LOGICAL_SCREEN_WIDTH,
  OVERLAY_MIN_FONT_PX,
  OverlayRegistry,
  computeContentRect,
  computeOverlayFontPx,
  computeScale,
  rectsOverlap,
  toCssRect,
  type LogicalRect
} from "../../src/overlay/overlay-layout.ts"

// Todo 12: pure overlay registry + DPR/letterbox layout math. No DOM is
// needed for any of this -- see the module doc comment in
// src/overlay/overlay-layout.ts for exactly which native source lines each
// constant/rect below is taken from (stats.h/stats.cpp/intro.cpp/u4.h).

describe("LOGICAL_SCREEN_WIDTH / LOGICAL_SCREEN_HEIGHT", () => {
  it("matches the native 320x200 world raster (u4.h / xu4.cpp screen init)", () => {
    expect(LOGICAL_SCREEN_WIDTH).toBe(320)
    expect(LOGICAL_SCREEN_HEIGHT).toBe(200)
  })
})

describe("toCssRect (Todo 12: logical -> CSS px, DPR/letterbox aware)", () => {
  const statusRect: LogicalRect = { x: 192, y: 8, width: 120, height: 64 }

  it("scales a logical rect by the content rect's own width/height ratio, no offset, dpr=1", () => {
    // vendor/xu4/src/stats.cpp's StatsArea::mainArea box (192,8,120,64) at
    // an exact 2x display (640x400 content, e.g. the CSS default) ->
    // (384,16,240,128). Matches .omo/drafts/step-11-13-korean-ui-design.md's
    // own worked example.
    const content = { left: 0, top: 0, width: 640, height: 400 }
    expect(toCssRect(statusRect, content, 1)).toEqual({ left: 384, top: 16, width: 240, height: 128 })
  })

  it("adds the content rect's own page offset (letterbox/scroll position) to the result", () => {
    const content = { left: 50, top: 20, width: 640, height: 400 }
    expect(toCssRect(statusRect, content, 1)).toEqual({ left: 434, top: 36, width: 240, height: 128 })
  })

  it("scales X and Y independently when the content rect is not exactly 16:10 (never reuses scaleX for the Y axis)", () => {
    // Deliberately non-square-scale content: scaleX=2 exact, scaleY=1.9
    // exact (both integer-clean so this test needs no rounding tolerance).
    // A buggy implementation that reused one scale factor for both axes
    // would produce height=200 here instead of 190.
    const content = { left: 0, top: 0, width: 640, height: 380 }
    const logical: LogicalRect = { x: 0, y: 0, width: 100, height: 100 }
    expect(toCssRect(logical, content, 1)).toEqual({ left: 0, top: 0, width: 200, height: 190 })
  })

  it("snaps independently-computed edges (not width) to the 1/dpr device-pixel grid, so adjacent rects never gain/lose a pixel between them", () => {
    // scaleX = 683/320 = 2.134375 (deliberately not a whole number, so the
    // raw CSS px values are fractional and rounding actually matters).
    const content = { left: 0, top: 0, width: 683, height: 400 }
    const logical: LogicalRect = { x: 100, y: 0, width: 50, height: 0 }
    const rawLeft = 100 * (683 / 320) // 213.4375
    const rawRight = 150 * (683 / 320) // 320.15625
    for (const dpr of [1, 1.5, 2]) {
      const result = toCssRect(logical, content, dpr)
      // Each edge lands on the 1/dpr grid...
      expect(Number.isInteger(result.left * dpr)).toBe(true)
      expect(Number.isInteger((result.left + result.width) * dpr)).toBe(true)
      // ...and stays within +-1/dpr of the true (unsnapped) value, so
      // different devicePixelRatios never disagree by more than a device
      // pixel about where the overlay actually is.
      expect(Math.abs(result.left - rawLeft)).toBeLessThanOrEqual(1 / dpr)
      expect(Math.abs(result.left + result.width - rawRight)).toBeLessThanOrEqual(1 / dpr)
    }
  })

  it("defaults dpr to 1 when not given", () => {
    const content = { left: 0, top: 0, width: 640, height: 400 }
    expect(toCssRect(statusRect, content)).toEqual(toCssRect(statusRect, content, 1))
  })
})

describe("computeScale", () => {
  it("returns the content rect's width/height ratio against the 320x200 logical screen", () => {
    expect(computeScale({ left: 0, top: 0, width: 640, height: 400 })).toEqual({ scaleX: 2, scaleY: 2 })
    expect(computeScale({ left: 0, top: 0, width: 320, height: 200 })).toEqual({ scaleX: 1, scaleY: 1 })
  })
})

describe("computeContentRect (Todo 12: canvas box -> content rect relative to the positioning ancestor's PADDING box)", () => {
  it("cancels the ancestor's own page offset and border width, leaving only the canvas-vs-ancestor difference", () => {
    // The canvas fills its positioned ancestor's content box exactly (the
    // current index.html/shell.css structure: canvas is the ancestor's only
    // normal-flow child, sized 100%/100%) -- so with a 2px border on the
    // ancestor, its padding box coincides with the canvas box exactly, and
    // the resulting content rect offset must be (0,0).
    const canvasBox = { left: 100, top: 50, width: 640, height: 400 }
    const ancestor = {
      getBoundingClientRect: () => ({ left: 98, top: 48, width: 644, height: 404 }),
      clientLeft: 2,
      clientTop: 2
    }
    expect(computeContentRect(canvasBox, ancestor)).toEqual({ left: 0, top: 0, width: 640, height: 400 })
  })

  it("keeps a real difference when the canvas box does NOT coincide with the ancestor's padding box (a future letterboxed/inset canvas)", () => {
    const canvasBox = { left: 110, top: 60, width: 600, height: 380 }
    const ancestor = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 640, height: 400 }),
      clientLeft: 0,
      clientTop: 0
    }
    // ancestor padding box origin = (100,50); canvas origin = (110,60) ->
    // a (10,10) inset, e.g. a pillarboxed/letterboxed canvas image.
    expect(computeContentRect(canvasBox, ancestor)).toEqual({ left: 10, top: 10, width: 600, height: 380 })
  })
})

describe("computeOverlayFontPx (Todo 12: readable-floor font sizing, not fixed-column English monospace math)", () => {
  it("scales with the content rect's vertical scale factor", () => {
    expect(computeOverlayFontPx(2)).toBeGreaterThan(computeOverlayFontPx(1))
  })

  it("never drops below the readable floor even at a tiny scale", () => {
    expect(computeOverlayFontPx(0.1)).toBe(OVERLAY_MIN_FONT_PX)
  })
})

describe("rectsOverlap", () => {
  it("returns false for rects that are disjoint on the Y axis even though their X ranges overlap", () => {
    const a: LogicalRect = { x: 0, y: 0, width: 100, height: 50 }
    const b: LogicalRect = { x: 50, y: 100, width: 100, height: 50 }
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it("returns false for rects that only touch at an edge (touching is not overlapping)", () => {
    const a: LogicalRect = { x: 0, y: 0, width: 10, height: 10 }
    const b: LogicalRect = { x: 10, y: 0, width: 10, height: 10 }
    expect(rectsOverlap(a, b)).toBe(false)
  })

  it("returns true for rects that genuinely overlap on both axes", () => {
    const a: LogicalRect = { x: 0, y: 0, width: 10, height: 10 }
    const b: LogicalRect = { x: 5, y: 5, width: 10, height: 10 }
    expect(rectsOverlap(a, b)).toBe(true)
  })
})

describe("DEFAULT_VIEW_RECTS (Todo 12: fixed native logical rects per overlay role)", () => {
  it("matches StatsArea::mainArea exactly (stats.h STATS_AREA_X/Y/WIDTH/HEIGHT, stats.cpp:28)", () => {
    // STATS_AREA_X = TEXT_AREA_X = 24 (u4.h:62), STATS_AREA_Y = 1,
    // STATS_AREA_WIDTH = 15, STATS_AREA_HEIGHT = 8, CHAR_WIDTH/HEIGHT = 8.
    expect(DEFAULT_VIEW_RECTS.status).toEqual({ x: 192, y: 8, width: 120, height: 64 })
  })

  it("matches Intro::menuArea exactly (intro.cpp:170)", () => {
    expect(DEFAULT_VIEW_RECTS.menu).toEqual({ x: 8, y: 104, width: 304, height: 88 })
  })

  it("matches Intro::extendedMenuArea exactly (intro.cpp:171) -- the generic 'textview' role's default", () => {
    expect(DEFAULT_VIEW_RECTS.textview).toEqual({ x: 16, y: 80, width: 288, height: 104 })
  })

  it("never overlaps the raster-drawn avatar aura glyph cell (stats.cpp:198/205, StatsArea::summary column 7)", () => {
    // (248,80,8,8): the one cell native code draws with a masked glyph
    // (drawCharMasked), not text -- it must stay in the WebGL raster canvas,
    // never under an opaque/occluding DOM overlay.
    expect(AVATAR_AURA_GLYPH_RECT).toEqual({ x: 248, y: 80, width: 8, height: 8 })
    expect(rectsOverlap(DEFAULT_VIEW_RECTS.status, AVATAR_AURA_GLYPH_RECT)).toBe(false)
  })

  it("status and menu never overlap -- the one realistic concurrently-visible pair (status persists during gameplay; a command menu opens over the map, not over the stats column)", () => {
    expect(rectsOverlap(DEFAULT_VIEW_RECTS.status, DEFAULT_VIEW_RECTS.menu)).toBe(false)
  })

  it("status and textview never overlap -- the other realistic concurrently-visible pair", () => {
    expect(rectsOverlap(DEFAULT_VIEW_RECTS.status, DEFAULT_VIEW_RECTS.textview)).toBe(false)
  })

  it("menu and textview DO overlap by native geometry -- documented and intentional, not a bug: intro.cpp's menuArea/extendedMenuArea are alternate screens of the SAME intro flow (config sub-menu replaces the main options menu), never registered at the same time", () => {
    expect(rectsOverlap(DEFAULT_VIEW_RECTS.menu, DEFAULT_VIEW_RECTS.textview)).toBe(true)
  })
})

describe("OverlayRegistry (Todo 12: registration/lifecycle)", () => {
  it("starts with no roles registered", () => {
    const registry = new OverlayRegistry()
    expect(registry.get("status")).toBeUndefined()
    expect(registry.list()).toEqual([])
  })

  it("register() stores a role's rect (and optional text/rows/selectedIndex), retrievable via get()", () => {
    const registry = new OverlayRegistry()
    registry.register("status", { rect: DEFAULT_VIEW_RECTS.status, text: "HP 99" })
    expect(registry.get("status")).toEqual({ rect: DEFAULT_VIEW_RECTS.status, text: "HP 99" })
  })

  it("registering the same role again REPLACES the previous entry -- only one active registration per role at a time (matches native: a menu's config sub-screen replaces the options screen, never coexists with it)", () => {
    const registry = new OverlayRegistry()
    registry.register("menu", { rect: DEFAULT_VIEW_RECTS.menu, text: "Options" })
    registry.register("menu", { rect: DEFAULT_VIEW_RECTS.textview, text: "Video Options" })
    expect(registry.get("menu")).toEqual({ rect: DEFAULT_VIEW_RECTS.textview, text: "Video Options" })
    expect(registry.list()).toHaveLength(1)
  })

  it("clear(role) removes only that role, leaving other registered roles untouched", () => {
    const registry = new OverlayRegistry()
    registry.register("status", { rect: DEFAULT_VIEW_RECTS.status, text: "HP 99" })
    registry.register("menu", { rect: DEFAULT_VIEW_RECTS.menu, text: "Options" })
    registry.clear("status")
    expect(registry.get("status")).toBeUndefined()
    expect(registry.get("menu")).toBeDefined()
  })

  it("resetStage() removes every registered role at once (a full stage transition, e.g. the bridge's 'clear' event)", () => {
    const registry = new OverlayRegistry()
    registry.register("status", { rect: DEFAULT_VIEW_RECTS.status, text: "HP 99" })
    registry.register("menu", { rect: DEFAULT_VIEW_RECTS.menu, text: "Options" })
    registry.resetStage()
    expect(registry.list()).toEqual([])
  })

  it("stores structured rows and a selectedIndex (menu/status item highlight -- an item index, not a text character offset)", () => {
    const registry = new OverlayRegistry()
    const rows = [
      { label: "체력", value: "99/99" },
      { label: "마나", value: "12" }
    ]
    registry.register("status", { rect: DEFAULT_VIEW_RECTS.status, rows, selectedIndex: 1 })
    expect(registry.get("status")).toEqual({ rect: DEFAULT_VIEW_RECTS.status, rows, selectedIndex: 1 })
  })
})
