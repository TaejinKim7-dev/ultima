// User decision 2026-10-05: after the first successful start, the player's
// own ultima4.zip is remembered in THEIR browser (IndexedDB), so a reload
// starts without the file picker. It is never uploaded anywhere -- the same
// local-only storage the saves already use -- and the "저장된 원본 지우기"
// button forgets it. A broken or missing store simply means "nothing
// remembered": the manual picker is always the fallback.

export interface CachedZip {
  readonly name: string
  readonly bytes: ArrayBuffer
}

export interface ZipStore {
  get(): Promise<CachedZip | null>
  put(zip: CachedZip): Promise<void>
  clear(): Promise<void>
}

/** The remembered file, or null when there is none or the store fails. */
export async function restoreCachedZip(store: ZipStore): Promise<File | null> {
  try {
    const cached = await store.get()
    return cached === null ? null : new File([cached.bytes], cached.name, { type: "application/zip" })
  } catch {
    return null
  }
}

export async function rememberZip(store: ZipStore, file: Blob & { readonly name: string }): Promise<void> {
  await store.put({ name: file.name, bytes: await file.arrayBuffer() })
}

export async function forgetZip(store: ZipStore): Promise<void> {
  await store.clear()
}

/** In-memory store for unit tests. */
export function createMemoryZipStore(): ZipStore {
  let value: CachedZip | null = null
  return {
    get: () => Promise.resolve(value),
    put: (zip) => {
      value = zip
      return Promise.resolve()
    },
    clear: () => {
      value = null
      return Promise.resolve()
    }
  }
}

const DB_NAME = "ultima-web-original-data"
const STORE_NAME = "zip"
const KEY = "ultima4.zip"

/** IndexedDB-backed store: one record in its own database, separate from the IDBFS saves. */
export function createIndexedDbZipStore(factory: IDBFactory): ZipStore {
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"))
    })
  }

  async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = body(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("indexedDB request failed"))
      })
    } finally {
      db.close()
    }
  }

  return {
    async get() {
      const value = (await run("readonly", (store) => store.get(KEY))) as CachedZip | undefined
      return value !== undefined && typeof value.name === "string" && value.bytes instanceof ArrayBuffer ? value : null
    },
    async put(zip) {
      await run("readwrite", (store) => store.put(zip, KEY))
    },
    async clear() {
      await run("readwrite", (store) => store.delete(KEY))
    }
  }
}
