// Todo 51 (save slots): a one-line summary of a slot, read from party.sav.
// Layout = vendor/xu4/src/savegame.cpp SaveGame::write (little-endian):
// u32 unknown, u32 moves, 8 x 39-byte player records (hp u16, hpMax u16, ...,
// name char[16] at +20), u32 food, u16 gold, karma[8], torches/gems/keys/
// sextants, armor[8], weapons[16], reagents[8], mixtures[26], items, x, y,
// stones, runes, members u16 @472, ..., location u16 @500 (502 bytes).
import { describe, expect, it } from "vitest"
import { parsePartySummary, PARTY_SAV_SIZE } from "../../src/saves/party-summary.ts"

function partySav(options: { name?: string; moves?: number; hp?: number; hpMax?: number; members?: number; gold?: number; food?: number; location?: number }): Uint8Array {
  const bytes = new Uint8Array(PARTY_SAV_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, options.moves ?? 0, true)
  view.setUint16(8, options.hp ?? 0, true)
  view.setUint16(10, options.hpMax ?? 0, true)
  const name = new TextEncoder().encode(options.name ?? "")
  bytes.set(name.slice(0, 15), 8 + 20)
  view.setUint32(320, options.food ?? 0, true)
  view.setUint16(324, options.gold ?? 0, true)
  view.setUint16(472, options.members ?? 0, true)
  view.setUint16(500, options.location ?? 0, true)
  return bytes
}

describe("parsePartySummary", () => {
  it("reads the avatar's name, moves, hp, party size, gold, food and location", () => {
    const summary = parsePartySummary(partySav({ name: "TJ", moves: 1234, hp: 150, hpMax: 200, members: 3, gold: 77, food: 4000, location: 5 }))
    expect(summary).toEqual({ name: "TJ", moves: 1234, hp: 150, hpMax: 200, members: 3, gold: 77, food: 4000, location: 5 })
  })

  it("is null for a file that is not a party.sav of the right size", () => {
    expect(parsePartySummary(new Uint8Array(10))).toBeNull()
  })

  it("is null when nobody is in the party (the engine refuses to load that too)", () => {
    expect(parsePartySummary(partySav({ name: "TJ", members: 0 }))).toBeNull()
  })
})
