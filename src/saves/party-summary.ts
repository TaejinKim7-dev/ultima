// Todo 51 (save slots): a one-line summary of a slot, read from party.sav.
//
// Layout = vendor/xu4/src/savegame.cpp SaveGame::write (little-endian): u32
// unknown, u32 moves, 8 player records of 39 bytes (hp u16, hpMax u16, xp, str,
// dex, intel, mp, unknown, weapon, armor as u16, name char[16], sex, class,
// status as u8), u32 food, u16 gold, karma[8], torches, gems, keys, sextants,
// armor[8], weapons[16], reagents[8], mixtures[26] (all u16), items u16, x, y,
// stones, runes (u8), members u16, ..., location u16 as the last field.

export const PARTY_SAV_SIZE = 502

const PLAYER_RECORD_BYTES = 39
const PLAYERS_OFFSET = 8
const NAME_OFFSET = 20
const NAME_BYTES = 16
const FOOD_OFFSET = 320
const GOLD_OFFSET = 324
const MEMBERS_OFFSET = 472
const LOCATION_OFFSET = 500

export interface PartySummary {
  readonly name: string
  readonly moves: number
  readonly hp: number
  readonly hpMax: number
  readonly members: number
  readonly gold: number
  readonly food: number
  readonly location: number
}

function playerName(bytes: Uint8Array, index: number): string {
  const start = PLAYERS_OFFSET + index * PLAYER_RECORD_BYTES + NAME_OFFSET
  const raw = bytes.slice(start, start + NAME_BYTES)
  const end = raw.indexOf(0)
  return new TextDecoder("latin1").decode(end === -1 ? raw : raw.slice(0, end))
}

/** The summary of a party.sav, or null when the file is not one the engine could journey onward from. */
export function parsePartySummary(bytes: Uint8Array): PartySummary | null {
  if (bytes.length !== PARTY_SAV_SIZE) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const members = view.getUint16(MEMBERS_OFFSET, true)
  if (members < 1) return null
  return {
    name: playerName(bytes, 0),
    moves: view.getUint32(4, true),
    hp: view.getUint16(PLAYERS_OFFSET, true),
    hpMax: view.getUint16(PLAYERS_OFFSET + 2, true),
    members,
    gold: view.getUint16(GOLD_OFFSET, true),
    food: view.getUint32(FOOD_OFFSET, true),
    location: view.getUint16(LOCATION_OFFSET, true)
  }
}
