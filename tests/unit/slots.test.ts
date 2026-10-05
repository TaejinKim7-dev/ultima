// Todo 51 (save slots): slot operations over a store. party.sav bytes are built
// with the layout in src/saves/party-summary.ts.
import { describe, expect, it } from "vitest"
import { PARTY_SAV_SIZE } from "../../src/saves/party-summary.ts"
import {
  captureIntoSlot,
  createEmptySlot,
  deleteSlot,
  duplicateSlot,
  exportSlotArchive,
  importSlotArchive,
  migrateInitialSlot,
  renameSlot,
  summarizeSlots,
  type SlotFile
} from "../../src/saves/slots.ts"
import { createMemorySlotStore } from "../../src/saves/slot-store.ts"
import { unpackSaveArchive } from "../../src/engine/persistence.ts"

function party(name: string, moves = 1): Uint8Array {
  const bytes = new Uint8Array(PARTY_SAV_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, moves, true)
  bytes.set(new TextEncoder().encode(name), 8 + 20)
  view.setUint16(472, 1, true)
  return bytes
}
const files = (name: string, moves = 1): SlotFile[] => [
  { path: "party.sav", data: party(name, moves) },
  { path: "monsters.sav", data: new Uint8Array([1, 2, 3]) }
]
function env() {
  let n = 0
  return { store: createMemorySlotStore(), now: () => 1000 + n, newId: () => `s${++n}` }
}

describe("migrateInitialSlot", () => {
  it("turns an existing working-copy save into the active '기본 슬롯' when no slots exist", async () => {
    const e = env()
    const id = await migrateInitialSlot(e.store, files("TJ"), e)
    expect(id).not.toBeNull()
    const slots = await summarizeSlots(e.store)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ name: "기본 슬롯", active: true, summary: { name: "TJ" } })
  })

  it("does nothing when slots already exist or there is no save", async () => {
    const e = env()
    expect(await migrateInitialSlot(e.store, [], e)).toBeNull()
    await createEmptySlot(e.store, "A", e)
    expect(await migrateInitialSlot(e.store, files("TJ"), e)).toBeNull()
    expect(await summarizeSlots(e.store)).toHaveLength(1)
  })
})

describe("captureIntoSlot", () => {
  it("creates a slot named after the avatar when none is active", async () => {
    const e = env()
    const result = await captureIntoSlot(e.store, files("TJ"), e)
    const slots = await summarizeSlots(e.store)
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ id: result.slotId, name: "TJ", active: true })
  })

  it("updates the active slot in place when the avatar is the same", async () => {
    const e = env()
    const first = await captureIntoSlot(e.store, files("TJ", 5), e)
    const second = await captureIntoSlot(e.store, files("TJ", 99), e)
    expect(second.slotId).toBe(first.slotId)
    expect(second.backupId).toBeUndefined()
    const slots = await summarizeSlots(e.store)
    expect(slots).toHaveLength(1)
    expect(slots[0]!.summary?.moves).toBe(99)
  })

  it("keeps an '[자동 백업]' copy when a different avatar would overwrite the slot", async () => {
    const e = env()
    const first = await captureIntoSlot(e.store, files("TJ", 5), e)
    const second = await captureIntoSlot(e.store, files("NEW", 1), e)
    expect(second.slotId).toBe(first.slotId)
    expect(second.backupId).toBeDefined()
    const slots = await summarizeSlots(e.store)
    expect(slots.map((slot) => slot.name).sort()).toEqual(["TJ", "[자동 백업] TJ"].sort())
    const backup = slots.find((slot) => slot.id === second.backupId)!
    expect(backup.summary).toMatchObject({ name: "TJ", moves: 5 })
    expect(backup.active).toBe(false)
    const active = slots.find((slot) => slot.active)!
    expect(active.summary).toMatchObject({ name: "NEW", moves: 1 })
  })
})

describe("slot management", () => {
  it("renames, duplicates and deletes; deleting the active slot clears the active id", async () => {
    const e = env()
    const a = await captureIntoSlot(e.store, files("TJ"), e)
    await renameSlot(e.store, a.slotId, "내 모험", e)
    const copy = await duplicateSlot(e.store, a.slotId, e)
    let slots = await summarizeSlots(e.store)
    expect(slots.map((slot) => slot.name).sort()).toEqual(["내 모험", "내 모험 (복사)"].sort())
    expect(slots.find((slot) => slot.id === copy)!.active).toBe(false)
    await deleteSlot(e.store, a.slotId)
    slots = await summarizeSlots(e.store)
    expect(slots.map((slot) => slot.id)).toEqual([copy])
    expect(slots.some((slot) => slot.active)).toBe(false)
  })

  it("rejects an empty name", async () => {
    const e = env()
    const a = await captureIntoSlot(e.store, files("TJ"), e)
    await expect(renameSlot(e.store, a.slotId, "   ", e)).rejects.toThrow()
  })
})

describe("slot export/import", () => {
  it("round-trips a slot through the U4SV archive as a new slot", async () => {
    const e = env()
    const a = await captureIntoSlot(e.store, files("TJ", 7), e)
    const archive = await exportSlotArchive(e.store, a.slotId)
    expect(unpackSaveArchive(archive).map((entry) => entry.path).sort()).toEqual(["monsters.sav", "party.sav"])
    const imported = await importSlotArchive(e.store, archive, "가져온 슬롯", e)
    const slots = await summarizeSlots(e.store)
    expect(slots).toHaveLength(2)
    expect(slots.find((slot) => slot.id === imported)).toMatchObject({ name: "가져온 슬롯", summary: { name: "TJ", moves: 7 } })
  })

  it("ignores non-save files in an imported archive (e.g. settings)", async () => {
    const e = env()
    const a = await captureIntoSlot(e.store, files("TJ"), e)
    const archive = await exportSlotArchive(e.store, a.slotId)
    expect(unpackSaveArchive(archive).some((entry) => entry.path === "xu4rc")).toBe(false)
  })
})
