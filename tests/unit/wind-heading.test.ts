import { describe, expect, it } from "vitest"
import { composeWindHeading, windHeadingVisible } from "../../src/overlay/wind-heading.ts"

// Values are independently pinned to vendor/xu4/src/direction.h by the engine-hook test.
describe("wind and dungeon heading", () => {
  it.each([
    [1, "서"], [2, "북"], [3, "동"], [4, "남"]
  ])("translates native cardinal direction %i", (direction, korean) => {
    const text = composeWindHeading(1, direction)
    expect(text).toBe(`바람 ${korean}`)
  })

  it.each([
    [1, "서"], [2, "북"], [3, "동"], [4, "남"]
  ])("shows the dungeon orientation for native direction %i", (direction, korean) => {
    const text = composeWindHeading(2, direction)
    expect(text).toBe(`방향 ${korean}`)
  })

  it.each([0, 5, 6, -1, 99, NaN, 1.5])("hides missing or noncardinal direction %s", (direction) => {
    expect(composeWindHeading(1, direction)).toBeNull()
  })

  it.each([0, -1, 3, NaN])("hides combat/no-heading or unknown mode %s", (mode) => {
    expect(composeWindHeading(mode, 2)).toBeNull()
  })

  it.each([
    [true, false, "바람 북", true],
    [false, false, "바람 북", false],
    [true, true, "바람 북", false],
    [true, false, null, false]
  ] as const)("shows only playing, nonmodal, valid headings (%s %s %s)", (playing, modal, text, expected) => {
    expect(windHeadingVisible(playing, modal, text)).toBe(expected)
  })
})
