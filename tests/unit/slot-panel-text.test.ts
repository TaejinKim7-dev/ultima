// Todo 51: the one-line description of a slot in the slot list.
import { describe, expect, it } from "vitest"
import { describeSlot } from "../../src/saves/slot-panel-text.ts"

describe("describeSlot", () => {
  it("shows avatar, moves, hp, party size and gold for a saved game", () => {
    expect(describeSlot({ name: "TJ", moves: 12345, hp: 150, hpMax: 200, members: 3, gold: 77, food: 4000, location: 5 })).toBe(
      "TJ · 이동 12,345 · HP 150/200 · 동료 3명 · 금 77"
    )
  })

  it("explains an empty slot", () => {
    expect(describeSlot(null)).toBe("비어 있음 — 이 슬롯을 고른 뒤 '새 게임 시작'을 하세요")
  })
})
