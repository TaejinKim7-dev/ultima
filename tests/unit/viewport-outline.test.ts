import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Stage 3 Step 6 (docs/plans/2026-10-04-in-game-korean.md): at the
// `.viewport` minimum-width floor the displayed game area must be exactly
// 640x400 -- a clean 2x of the native 320x200 raster, so one Korean glyph
// in the upcoming message-area overlay is exactly one original 8x8 cell
// at 16 device px. The old `border: 2px` (box-sizing: border-box) shrank
// the content box to 636x396 at the floor; `outline` draws the same ring
// but never participates in layout, so the content box stays 640x400.
//
// Vitest runs in Node (no browser layout engine -- see vite.config.ts's
// test config), so this spec statically reads src/shell.css and re-derives
// what getBoundingClientRect() would return: with `width:100%` +
// `min-width:640px` + `aspect-ratio:320/200` + `box-sizing:border-box`, the
// border box at the floor is exactly 640 wide and 640*(200/320)=400 tall,
// and with `border:0` the canvas's content box (`width:100%;height:100%`)
// is that same 640x400. `outline` contributes nothing to this box.
const shellCss = readFileSync(new URL("../../src/shell.css", import.meta.url), "utf8")
// Strip `/* ... */` comments first: comments may contain `{`/`}` text
// (e.g. "`* { box-sizing: border-box }`") that would truncate a naive
// `[^}]*` rule-block match.
const cssWithoutComments = shellCss.replace(/\/\*[\s\S]*?\*\//g, "")

/** Returns the declaration block text for a top-level rule whose selector is exactly `selector`. */
function ruleBlock(selector: string): string | null {
  // `m` flag: `^`/`.` also match across newlines; the selector is escaped
  // so the leading `.` of `.viewport` is a literal dot, not "any char".
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = cssWithoutComments.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"))
  return match?.[1] ?? null
}

/** Returns the value of a single declaration inside a rule block, or null. */
function declaration(block: string, name: string): string | null {
  const match = block.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "m"))
  return match?.[1]?.trim() ?? null
}

/** Border width in px (0 when the declaration is absent). */
function borderPx(block: string): number {
  const value = declaration(block, "border")
  if (value === null) return 0
  const match = value.match(/(\d+)px/)
  return match !== null ? Number(match[1]) : 0
}

const viewport = ruleBlock(".viewport")
const globalRules = ruleBlock("*")

describe("Stage 3 Step 6: .viewport border -> outline (exact 640x400 content box)", () => {
  it("keeps the 2x floor declarations: min-width 640px + aspect-ratio 320/200 + overflow hidden", () => {
    expect(viewport).not.toBeNull()
    expect(declaration(viewport!, "min-width")).toBe("640px")
    expect(declaration(viewport!, "aspect-ratio")).toBe("320 / 200")
    expect(declaration(viewport!, "overflow")).toBe("hidden")
  })

  it("keeps the global * { box-sizing: border-box } sizing rule", () => {
    expect(globalRules).not.toBeNull()
    expect(declaration(globalRules!, "box-sizing")).toBe("border-box")
  })

  it("draws the 2px ring as an outline, not a border -- layout must ignore it", () => {
    // RED condition (fails while `border: 2px` still exists):
    // `.viewport` must not carry a `border` declaration that would shrink
    // the content box under border-box sizing.
    expect(declaration(viewport!, "border")).toBeNull()
    expect(declaration(viewport!, "outline")).toBe("2px solid var(--ultima-border)")
    // outline-offset: -2px keeps the ring inside the border-box edge,
    // visually identical to the old inset border.
    expect(declaration(viewport!, "outline-offset")).toBe("-2px")
  })

  it("renders the .viewport and the canvas content box at exactly 640x400 at the min-width floor", () => {
    // Container at the floor width: `width:100%` == 640, `min-width:640px`
    // keeps it there; `aspect-ratio` derives height 640*200/320 = 400.
    // With border-box sizing the border box is the declared size, and with
    // border 0 the canvas's 100%/100% content box is that same box.
    const containerWidth = 640
    const borderBoxWidth = Math.max(640, containerWidth)
    const borderBoxHeight = borderBoxWidth * (200 / 320)
    const border = borderPx(viewport!)
    const contentBox = {
      width: borderBoxWidth - 2 * border,
      height: borderBoxHeight - 2 * border
    }
    // getBoundingClientRect() returns the border box:
    expect({ width: borderBoxWidth, height: borderBoxHeight }).toEqual({ width: 640, height: 400 })
    // ...and the canvas fills the content box exactly (RED: 636x396 while
    // the 2px border is still present).
    expect(contentBox).toEqual({ width: 640, height: 400 })
  })
})