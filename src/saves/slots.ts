// Todo 51 (save slots): the operations on slots. Pure over a SlotStore.
//
// The engine always works on ONE set of files (/persist/.xu4); a slot is a
// named copy of those files. The shell copies a slot in before play and
// captures the working copy back after every successful save.

import { packSaveArchive, unpackSaveArchive } from "../engine/persistence.ts"
import { parsePartySummary, type PartySummary } from "./party-summary.ts"
import { type SlotFile, type SlotStore } from "./slot-store.ts"

export type { SlotFile, SlotRecord } from "./slot-store.ts"

/** The engine files that make up one saved game (xu4rc, the settings file, is not part of a slot). */
export const SLOT_FILE_NAMES: readonly string[] = ["party.sav", "monsters.sav", "dngmap.sav", "outmonst.sav"]

export interface SlotEnv {
  now(): number
  newId(): string
}

export interface SlotSummary {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  readonly active: boolean
  readonly summary: PartySummary | null
}

export const DEFAULT_SLOT_NAME = "기본 슬롯"
export const BACKUP_PREFIX = "[자동 백업] "

function keepSaveFiles(files: readonly SlotFile[]): SlotFile[] {
  return files.filter((file) => SLOT_FILE_NAMES.includes(file.path)).map((file) => ({ path: file.path, data: file.data }))
}

function partyOf(files: readonly SlotFile[]): PartySummary | null {
  const party = files.find((file) => file.path === "party.sav")
  return party === undefined ? null : parsePartySummary(party.data)
}

function cleanName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === "") throw new Error("슬롯 이름이 비어 있습니다.")
  return trimmed.slice(0, 40)
}

async function nextDefaultName(store: SlotStore): Promise<string> {
  const names = new Set((await store.list()).map((record) => record.name))
  for (let n = 1; ; n += 1) {
    const candidate = `슬롯 ${n}`
    if (!names.has(candidate)) return candidate
  }
}

export async function summarizeSlots(store: SlotStore): Promise<SlotSummary[]> {
  const [records, active] = await Promise.all([store.list(), store.getActive()])
  return records
    .map((record) => ({
      id: record.id,
      name: record.name,
      updatedAt: record.updatedAt,
      active: record.id === active,
      summary: partyOf(record.files)
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** An empty slot (no save yet); the next "Initiate New Game" fills it. */
export async function createEmptySlot(store: SlotStore, name: string | undefined, env: SlotEnv): Promise<string> {
  const id = env.newId()
  const at = env.now()
  await store.put({ id, name: name === undefined ? await nextDefaultName(store) : cleanName(name), createdAt: at, updatedAt: at, files: [] })
  return id
}

/** First run after the slot feature arrives: an already-saved game becomes the active "기본 슬롯". */
export async function migrateInitialSlot(store: SlotStore, workingFiles: readonly SlotFile[], env: SlotEnv): Promise<string | null> {
  if ((await store.list()).length > 0) return null
  const files = keepSaveFiles(workingFiles)
  if (!files.some((file) => file.path === "party.sav")) return null
  const id = env.newId()
  const at = env.now()
  await store.put({ id, name: DEFAULT_SLOT_NAME, createdAt: at, updatedAt: at, files })
  await store.setActive(id)
  return id
}

export interface CaptureResult {
  readonly slotId: string
  readonly backupId?: string
}

/**
 * Copies the engine's working files into the active slot (creating one named
 * after the avatar when none is active). If the slot already holds a game of
 * a DIFFERENT avatar -- e.g. "Initiate New Game" over an existing slot -- the
 * old contents are kept first as an "[자동 백업]" slot, so nothing is lost silently.
 */
export async function captureIntoSlot(store: SlotStore, workingFiles: readonly SlotFile[], env: SlotEnv): Promise<CaptureResult> {
  const files = keepSaveFiles(workingFiles)
  const incoming = partyOf(files)
  const at = env.now()
  const activeId = await store.getActive()
  const existing = activeId === null ? null : await store.get(activeId)

  if (existing === null) {
    const id = env.newId()
    const name = incoming !== null && incoming.name !== "" ? incoming.name : await nextDefaultName(store)
    await store.put({ id, name, createdAt: at, updatedAt: at, files })
    await store.setActive(id)
    return { slotId: id }
  }

  let backupId: string | undefined
  const before = partyOf(existing.files)
  if (before !== null && incoming !== null && before.name !== incoming.name) {
    backupId = env.newId()
    await store.put({ id: backupId, name: `${BACKUP_PREFIX}${existing.name}`, createdAt: at, updatedAt: existing.updatedAt, files: existing.files })
  }
  await store.put({ ...existing, updatedAt: at, files })
  return backupId === undefined ? { slotId: existing.id } : { slotId: existing.id, backupId }
}

export async function renameSlot(store: SlotStore, id: string, name: string, env: SlotEnv): Promise<void> {
  const record = await store.get(id)
  if (record === null) throw new Error("슬롯을 찾을 수 없습니다.")
  await store.put({ ...record, name: cleanName(name), updatedAt: record.updatedAt })
  void env
}

export async function duplicateSlot(store: SlotStore, id: string, env: SlotEnv): Promise<string> {
  const record = await store.get(id)
  if (record === null) throw new Error("슬롯을 찾을 수 없습니다.")
  const copyId = env.newId()
  const at = env.now()
  await store.put({ ...record, id: copyId, name: `${record.name} (복사)`.slice(0, 48), createdAt: at, updatedAt: record.updatedAt })
  return copyId
}

export async function deleteSlot(store: SlotStore, id: string): Promise<void> {
  await store.remove(id)
  if ((await store.getActive()) === id) await store.setActive(null)
}

export async function exportSlotArchive(store: SlotStore, id: string): Promise<Uint8Array> {
  const record = await store.get(id)
  if (record === null) throw new Error("슬롯을 찾을 수 없습니다.")
  return packSaveArchive(record.files.map((file) => ({ path: file.path, data: file.data })))
}

/** A U4SV archive (exported slot or whole-save export) becomes a NEW slot; only save files are kept. */
export async function importSlotArchive(store: SlotStore, archive: Uint8Array, name: string | undefined, env: SlotEnv): Promise<string> {
  const files = keepSaveFiles(unpackSaveArchive(archive))
  if (!files.some((file) => file.path === "party.sav")) throw new Error("이 파일에는 party.sav가 없어 슬롯으로 가져올 수 없습니다.")
  const id = env.newId()
  const at = env.now()
  const incoming = partyOf(files)
  await store.put({ id, name: name === undefined ? (incoming?.name ?? (await nextDefaultName(store))) : cleanName(name), createdAt: at, updatedAt: at, files })
  return id
}

/** Todo 53: one slot packed for upload (U4SV archive), or null for an empty slot. */
export async function readSlotForUpload(
  store: SlotStore,
  id: string
): Promise<{ slotId: string; name: string; updatedAt: number; data: Uint8Array } | null> {
  const record = await store.get(id)
  if (record === null || record.files.length === 0) return null
  return { slotId: record.id, name: record.name, updatedAt: record.updatedAt, data: packSaveArchive(record.files.map((file) => ({ path: file.path, data: file.data }))) }
}

/** Todo 53: writes a slot downloaded from Drive, keeping its id, name and updatedAt. */
export async function upsertSlotFromArchive(
  store: SlotStore,
  meta: { slotId: string; name: string; updatedAt: number },
  archive: Uint8Array,
  env: SlotEnv
): Promise<SlotFile[]> {
  const files = keepSaveFiles(unpackSaveArchive(archive))
  if (!files.some((file) => file.path === "party.sav")) throw new Error("Drive의 슬롯 파일에 party.sav가 없습니다.")
  const existing = await store.get(meta.slotId)
  await store.put({
    id: meta.slotId,
    name: cleanName(meta.name),
    createdAt: existing?.createdAt ?? env.now(),
    updatedAt: meta.updatedAt,
    files
  })
  return files
}

/** Marks a slot as the one the working copy belongs to. */
export async function setActiveSlot(store: SlotStore, id: string | null): Promise<void> {
  await store.setActive(id)
}

export type { SlotStore } from "./slot-store.ts"
