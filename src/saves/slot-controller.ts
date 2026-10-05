// Todo 51 (save slots): ties the slot store to the engine's working copy.
//
// - init(): the first run turns an already-saved game into "기본 슬롯".
// - After every successful engine save, the working copy is captured into the
//   active slot (a new slot named after the avatar when none is active).
// - select(): copies a slot's files into the engine (only before play starts).
// While a slot is being applied, saves reported by the engine are ignored: the
// FS writes of the apply itself can fire the save listener with half-written files.

import {
  captureIntoSlot,
  createEmptySlot,
  deleteSlot,
  duplicateSlot,
  exportSlotArchive,
  importSlotArchive,
  migrateInitialSlot,
  readSlotForUpload,
  upsertSlotFromArchive,
  renameSlot,
  setActiveSlot,
  summarizeSlots,
  type SlotEnv,
  type SlotFile,
  type SlotSummary
} from "./slots.ts"
import type { SlotStore } from "./slot-store.ts"

/** What the controller needs from the running engine (src/engine/slot-engine.ts provides it). */
export interface EngineAdapter {
  readWorking(): SlotFile[]
  apply(files: readonly SlotFile[]): Promise<void>
  onSaved(listener: () => void): void
}

export interface SlotControllerState {
  readonly slots: readonly SlotSummary[]
  readonly playing: boolean
  readonly busy: boolean
}

export interface SlotController {
  init(): Promise<void>
  state(): Promise<SlotControllerState>
  setPlaying(on: boolean): void
  newSlot(name?: string): Promise<string>
  select(id: string): Promise<void>
  rename(id: string, name: string): Promise<void>
  duplicate(id: string): Promise<string>
  remove(id: string): Promise<void>
  exportSlot(id: string): Promise<Uint8Array>
  importSlot(archive: Uint8Array, name?: string): Promise<string>
  subscribe(listener: () => void): void
  /** Resolves when pending captures have finished (tests and shutdown). */
  idle(): Promise<void>
  /** Todo 53: called after each capture with the slot that changed (auto-upload). */
  onCaptured(listener: (slotId: string) => void): void
  /** Todo 53: id / name / updatedAt / hasData for every slot (sync planning). */
  localInfo(): Promise<Array<{ id: string; name: string; updatedAt: number; hasData: boolean }>>
  /** Todo 53: one slot packed for upload, or null when it is empty. */
  readForUpload(id: string): Promise<{ slotId: string; name: string; updatedAt: number; data: Uint8Array } | null>
  /** Todo 53: stores a slot downloaded from Drive; refreshes the engine when it is the active slot (not while playing). */
  importRemote(meta: { slotId: string; name: string; updatedAt: number }, archive: Uint8Array): Promise<void>
}

export interface SlotControllerOptions extends SlotEnv {
  readonly store: SlotStore
  readonly engine: EngineAdapter
  /** A capture or apply that fails (IndexedDB gone, ...) is reported here instead of throwing into the game. */
  readonly onError?: (error: unknown) => void
  /** Key-point trace (src/debug-log.ts) for tracing a reported issue. */
  readonly trace?: (event: string, data?: unknown) => void
}

export function createSlotController(options: SlotControllerOptions): SlotController {
  const { store, engine } = options
  const env: SlotEnv = { now: options.now, newId: options.newId }
  const listeners: Array<() => void> = []
  const capturedListeners: Array<(slotId: string) => void> = []
  let playing = false
  let applying = false
  let pending: Promise<void> = Promise.resolve()

  function changed(): void {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // a UI bug must not break saving
      }
    }
  }

  function fail(error: unknown): void {
    options.onError?.(error)
  }

  const trace = options.trace ?? (() => undefined)

  function capture(): void {
    trace("slot-saved-signal", { applying })
    if (applying) return
    pending = pending
      .then(async () => {
        if (applying) return
        const result = await captureIntoSlot(store, engine.readWorking(), env)
        trace("slot-capture", { slot: result.slotId, backup: result.backupId ?? null })
        changed()
        for (const listener of capturedListeners) {
          try {
            listener(result.slotId)
          } catch {
            // the cloud layer must not break local saving
          }
        }
      })
      .catch(fail)
  }

  async function apply(files: readonly SlotFile[]): Promise<void> {
    applying = true
    trace("slot-apply", { files: files.map((file) => `${file.path}:${file.data.length}`) })
    try {
      await engine.apply(files)
    } finally {
      // The engine's own save listener may still be queued from the writes above.
      await Promise.resolve()
      applying = false
    }
  }

  function requireIdle(): void {
    if (playing) throw new Error("플레이 중에는 슬롯을 바꿀 수 없습니다. 게임을 다시 시작해 주세요.")
  }

  return {
    async init() {
      const migrated = await migrateInitialSlot(store, engine.readWorking(), env)
      trace("slot-init", { migrated })
      engine.onSaved(capture)
      changed()
    },
    async state() {
      return { slots: await summarizeSlots(store), playing, busy: applying }
    },
    setPlaying(on) {
      playing = on
      changed()
    },
    async newSlot(name) {
      const id = await createEmptySlot(store, name, env)
      changed()
      return id
    },
    async select(id) {
      requireIdle()
      const record = await store.get(id)
      if (record === null) throw new Error("슬롯을 찾을 수 없습니다.")
      await apply(record.files)
      await setActiveSlot(store, id)
      changed()
    },
    async rename(id, name) {
      await renameSlot(store, id, name, env)
      changed()
    },
    async duplicate(id) {
      const copy = await duplicateSlot(store, id, env)
      changed()
      return copy
    },
    async remove(id) {
      const wasActive = (await store.getActive()) === id
      if (wasActive) requireIdle()
      await deleteSlot(store, id)
      if (wasActive) await apply([])
      changed()
    },
    exportSlot: (id) => exportSlotArchive(store, id),
    async importSlot(archive, name) {
      const id = await importSlotArchive(store, archive, name, env)
      changed()
      return id
    },
    subscribe(listener) {
      listeners.push(listener)
    },
    idle: () => pending,
    onCaptured(listener) {
      capturedListeners.push(listener)
    },
    async localInfo() {
      const records = await store.list()
      return records.map((record) => ({ id: record.id, name: record.name, updatedAt: record.updatedAt, hasData: record.files.length > 0 }))
    },
    readForUpload: (id) => readSlotForUpload(store, id),
    async importRemote(meta, archive) {
      const isActive = (await store.getActive()) === meta.slotId
      if (isActive) requireIdle()
      const files = await upsertSlotFromArchive(store, meta, archive, env)
      trace("slot-import-remote", { slot: meta.slotId, active: isActive })
      if (isActive) await apply(files)
      changed()
    }
  }
}
