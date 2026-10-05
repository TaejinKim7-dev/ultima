// Todo 53: what to do per slot between this browser and Google Drive (pure).

import type { RemoteSlot } from "./drive-client.ts"

export interface LocalSlotInfo {
  readonly id: string
  readonly name: string
  readonly updatedAt: number
  /** False for an empty slot (no save yet) -- nothing to upload. */
  readonly hasData: boolean
}

export type SyncState = "local-only" | "remote-only" | "same" | "local-newer" | "remote-newer" | "empty"

export interface SyncEntry {
  readonly slotId: string
  readonly name: string
  readonly state: SyncState
  readonly fileId?: string
  readonly remoteUpdatedAt?: number
}

export function planSync(local: readonly LocalSlotInfo[], remote: readonly RemoteSlot[]): SyncEntry[] {
  const remoteById = new Map(remote.map((slot) => [slot.slotId, slot]))
  const entries: SyncEntry[] = []
  for (const slot of local) {
    const other = remoteById.get(slot.id)
    remoteById.delete(slot.id)
    if (other === undefined) {
      entries.push({ slotId: slot.id, name: slot.name, state: slot.hasData ? "local-only" : "empty" })
      continue
    }
    const state: SyncState = !slot.hasData || other.updatedAt > slot.updatedAt ? "remote-newer" : other.updatedAt < slot.updatedAt ? "local-newer" : "same"
    entries.push({ slotId: slot.id, name: slot.name, state, fileId: other.fileId, remoteUpdatedAt: other.updatedAt })
  }
  for (const other of remoteById.values()) {
    entries.push({ slotId: other.slotId, name: other.name, state: "remote-only", fileId: other.fileId, remoteUpdatedAt: other.updatedAt })
  }
  return entries
}
