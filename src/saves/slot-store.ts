// Todo 51 (save slots): where the slots live. One IndexedDB database of its own
// (separate from the IDBFS mount that holds the engine's working copy), in the
// player's browser only. A memory store backs the unit tests.

export interface SlotFile {
  readonly path: string
  readonly data: Uint8Array
}

export interface SlotRecord {
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly files: readonly SlotFile[]
}

export interface SlotStore {
  list(): Promise<SlotRecord[]>
  get(id: string): Promise<SlotRecord | null>
  put(record: SlotRecord): Promise<void>
  remove(id: string): Promise<void>
  getActive(): Promise<string | null>
  setActive(id: string | null): Promise<void>
}

export function createMemorySlotStore(): SlotStore {
  const records = new Map<string, SlotRecord>()
  let active: string | null = null
  return {
    list: () => Promise.resolve([...records.values()]),
    get: (id) => Promise.resolve(records.get(id) ?? null),
    put: (record) => {
      records.set(record.id, record)
      return Promise.resolve()
    },
    remove: (id) => {
      records.delete(id)
      return Promise.resolve()
    },
    getActive: () => Promise.resolve(active),
    setActive: (id) => {
      active = id
      return Promise.resolve()
    }
  }
}

const DB_NAME = "ultima-web-save-slots"
const SLOTS = "slots"
const META = "meta"
const ACTIVE_KEY = "active"

function isRecord(value: unknown): value is SlotRecord {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record["id"] === "string" &&
    typeof record["name"] === "string" &&
    typeof record["createdAt"] === "number" &&
    typeof record["updatedAt"] === "number" &&
    Array.isArray(record["files"])
  )
}

/** IndexedDB-backed store. Never touches localStorage/sessionStorage (audit:dist forbids them). */
export function createIndexedDbSlotStore(factory: IDBFactory): SlotStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(SLOTS, { keyPath: "id" })
        request.result.createObjectStore(META)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"))
    })
  }

  async function run<T>(storeName: string, mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = body(db.transaction(storeName, mode).objectStore(storeName))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"))
      })
    } finally {
      db.close()
    }
  }

  return {
    async list() {
      const all = (await run(SLOTS, "readonly", (store) => store.getAll())) as unknown[]
      return all.filter(isRecord)
    },
    async get(id) {
      const value = await run(SLOTS, "readonly", (store) => store.get(id))
      return isRecord(value) ? value : null
    },
    async put(record) {
      await run(SLOTS, "readwrite", (store) => store.put(record))
    },
    async remove(id) {
      await run(SLOTS, "readwrite", (store) => store.delete(id))
    },
    async getActive() {
      const value = await run(META, "readonly", (store) => store.get(ACTIVE_KEY))
      return typeof value === "string" ? value : null
    },
    async setActive(id) {
      if (id === null) {
        await run(META, "readwrite", (store) => store.delete(ACTIVE_KEY))
      } else {
        await run(META, "readwrite", (store) => store.put(id, ACTIVE_KEY))
      }
    }
  }
}
