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

// Todo 53 (Drive sync): what the cloud layer needs from the slot controller.
describe("slot controller cloud hooks", () => {
  it("reports each capture with the slot id", async () => {
    const t = setup()
    await t.controller.init()
    const captured: string[] = []
    t.controller.onCaptured((id) => captured.push(id))
    t.setWorking(files("TJ", 2))
    t.fireSaved()
    await t.controller.idle()
    expect(captured).toHaveLength(1)
  })

  it("lists slots with hasData and packs a slot for upload", async () => {
    const t = setup(files("TJ", 4))
    await t.controller.init()
    const empty = await t.controller.newSlot("B")
    const info = await t.controller.localInfo()
    expect(info.find((slot) => slot.id === empty)).toMatchObject({ hasData: false })
    const active = info.find((slot) => slot.hasData)!
    const upload = await t.controller.readForUpload(active.id)
    expect(upload).toMatchObject({ slotId: active.id, name: "기본 슬롯" })
    expect(upload!.data.length).toBeGreaterThan(0)
    expect(await t.controller.readForUpload(empty)).toBeNull()
  })

  it("imports a remote slot keeping its id, name and updatedAt; into the active slot it also refreshes the engine", async () => {
    const source = setup(files("TJ", 9))
    await source.controller.init()
    const sourceSlot = (await source.controller.localInfo())[0]!
    const upload = (await source.controller.readForUpload(sourceSlot.id))!

    const t = setup()
    await t.controller.init()
    await t.controller.importRemote({ slotId: "remote-1", name: "원격", updatedAt: 5000 }, upload.data)
    let state = await t.controller.state()
    expect(state.slots.find((slot) => slot.id === "remote-1")).toMatchObject({ name: "원격", updatedAt: 5000, summary: { moves: 9 } })
    expect(t.applied).toHaveLength(0)

    await t.controller.select("remote-1")
    const appliedBefore = t.applied.length
    await t.controller.importRemote({ slotId: "remote-1", name: "원격", updatedAt: 6000 }, upload.data)
    expect(t.applied.length).toBe(appliedBefore + 1)
    state = await t.controller.state()
    expect(state.slots.find((slot) => slot.id === "remote-1")!.updatedAt).toBe(6000)
  })

  it("refuses to overwrite the active slot from Drive while playing", async () => {
    const t = setup(files("TJ"))
    await t.controller.init()
    const active = (await t.controller.localInfo())[0]!
    const upload = (await t.controller.readForUpload(active.id))!
    t.controller.setPlaying(true)
    await expect(t.controller.importRemote({ slotId: active.id, name: "x", updatedAt: 99999 }, upload.data)).rejects.toThrow()
  })
})
