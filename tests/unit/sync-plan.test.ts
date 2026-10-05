// Todo 53: deciding what to do per slot between this browser and Drive.
import { describe, expect, it } from "vitest"
import { planSync } from "../../src/cloud/sync-plan.ts"

describe("planSync", () => {
  it("classifies each slot by where it exists and which side is newer", () => {
    const plan = planSync(
      [
        { id: "a", name: "A", updatedAt: 10, hasData: true },
        { id: "b", name: "B", updatedAt: 20, hasData: true },
        { id: "c", name: "C", updatedAt: 30, hasData: true },
        { id: "d", name: "D", updatedAt: 40, hasData: true },
        { id: "e", name: "E", updatedAt: 50, hasData: false }
      ],
      [
        { fileId: "fb", slotId: "b", name: "B", updatedAt: 20 },
        { fileId: "fc", slotId: "c", name: "C", updatedAt: 25 },
        { fileId: "fd", slotId: "d", name: "D", updatedAt: 45 },
        { fileId: "fx", slotId: "x", name: "X", updatedAt: 5 }
      ]
    )
    const byId = Object.fromEntries(plan.map((entry) => [entry.slotId, entry]))
    expect(byId["a"]).toMatchObject({ state: "local-only" })
    expect(byId["b"]).toMatchObject({ state: "same", fileId: "fb" })
    expect(byId["c"]).toMatchObject({ state: "local-newer", fileId: "fc" })
    expect(byId["d"]).toMatchObject({ state: "remote-newer", fileId: "fd" })
    expect(byId["e"]).toMatchObject({ state: "empty" })
    expect(byId["x"]).toMatchObject({ state: "remote-only", fileId: "fx", name: "X" })
  })
})
