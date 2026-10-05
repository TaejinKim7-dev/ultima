// Todo 51 (save slots): the controller that ties the slot store to the engine's
// working copy. The engine is a small adapter here, so no real FS is needed.
import { describe, expect, it } from "vitest"
import { PARTY_SAV_SIZE } from "../../src/saves/party-summary.ts"
import { createMemorySlotStore } from "../../src/saves/slot-store.ts"
import { createSlotController, type EngineAdapter } from "../../src/saves/slot-controller.ts"
import type { SlotFile } from "../../src/saves/slots.ts"

function party(name: string, moves = 1): Uint8Array {
  const bytes = new Uint8Array(PARTY_SAV_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, moves, true)
  bytes.set(new TextEncoder().encode(name), 8 + 20)
  view.setUint16(472, 1, true)
  return bytes
}
const files = (name: string, moves = 1): SlotFile[] => [{ path: "party.sav", data: party(name, moves) }]

function setup(initialWorking: SlotFile[] = []) {
  let working = initialWorking
  let savedListener: (() => void) | null = null
  const applied: SlotFile[][] = []
  let applyHook: (() => void) | null = null
  const engine: EngineAdapter = {
    readWorking: () => working,
    async apply(next) {
      applied.push([...next])
      applyHook?.() // a real FS write may re-trigger the save listener mid-apply
      working = [...next]
    },
    onSaved(listener) {
      savedListener = listener
    }
  }
  let n = 0
  const store = createMemorySlotStore()
  const controller = createSlotController({ store, engine, now: () => 1000 + n, newId: () => `s${++n}` })
  return {
    controller,
    store,
    applied,
    setWorking: (next: SlotFile[]) => {
      working = next
    },
    fireSaved: () => savedListener?.(),
    onApply: (hook: () => void) => {
      applyHook = hook
    }
  }
}

describe("slot controller", () => {
  it("init migrates an existing save into the active '기본 슬롯'", async () => {
    const t = setup(files("TJ"))
    await t.controller.init()
    const state = await t.controller.state()
    expect(state.slots).toHaveLength(1)
    expect(state.slots[0]).toMatchObject({ name: "기본 슬롯", active: true })
  })

  it("a save captures the working copy into the active slot (creating it named after the avatar)", async () => {
    const t = setup()
    await t.controller.init()
    t.setWorking(files("TJ", 3))
    t.fireSaved()
    await t.controller.idle()
    const state = await t.controller.state()
    expect(state.slots[0]).toMatchObject({ name: "TJ", active: true, summary: { moves: 3 } })
  })

  it("select copies the slot into the engine and makes it active", async () => {
    const t = setup(files("TJ"))
    await t.controller.init()
    const empty = await t.controller.newSlot("B")
    await t.controller.select(empty)
    expect(t.applied.at(-1)).toEqual([])
    expect((await t.controller.state()).slots.find((slot) => slot.id === empty)!.active).toBe(true)
  })

  it("does not capture while a slot is being applied (the FS write can fire the save listener)", async () => {
    const t = setup(files("TJ", 1))
    await t.controller.init()
    const other = await t.controller.newSlot("B")
    t.onApply(() => t.fireSaved())
    await t.controller.select(other)
    await t.controller.idle()
    const state = await t.controller.state()
    expect(state.slots.find((slot) => slot.name === "기본 슬롯")!.summary?.moves).toBe(1)
    expect(state.slots.find((slot) => slot.id === other)!.summary).toBeNull()
  })

  it("refuses to switch while playing", async () => {
    const t = setup(files("TJ"))
    await t.controller.init()
    const other = await t.controller.newSlot("B")
    t.controller.setPlaying(true)
    await expect(t.controller.select(other)).rejects.toThrow()
    expect(t.applied).toHaveLength(0)
  })

  it("deleting the active slot clears the working copy; deleting another leaves it", async () => {
    const t = setup(files("TJ"))
    await t.controller.init()
    const other = await t.controller.newSlot("B")
    await t.controller.remove(other)
    expect(t.applied).toHaveLength(0)
    const active = (await t.controller.state()).slots.find((slot) => slot.active)!
    await t.controller.remove(active.id)
    expect(t.applied.at(-1)).toEqual([])
  })

  it("notifies subscribers when the list changes", async () => {
    const t = setup()
    let changes = 0
    t.controller.subscribe(() => {
      changes += 1
    })
    await t.controller.newSlot("B")
    expect(changes).toBeGreaterThan(0)
  })
})
