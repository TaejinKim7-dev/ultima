// User decision 2026-10-05: the player's own ultima4.zip is remembered in
// THEIR browser (IndexedDB) after the first successful start, so a reload
// starts without the file picker. Never uploaded; a button forgets it.
import { describe, expect, it } from "vitest"
import { createMemoryZipStore, restoreCachedZip, rememberZip, forgetZip } from "../../src/engine/zip-cache.ts"

describe("zip cache", () => {
  it("restores nothing when nothing was remembered", async () => {
    expect(await restoreCachedZip(createMemoryZipStore())).toBeNull()
  })

  it("restores the remembered file with its name and bytes", async () => {
    const store = createMemoryZipStore()
    await rememberZip(store, new File([new Uint8Array([1, 2, 3])], "ultima4.zip"))
    const file = await restoreCachedZip(store)
    expect(file?.name).toBe("ultima4.zip")
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("treats a broken store as empty instead of throwing", async () => {
    const broken = { get: () => Promise.reject(new Error("idb gone")), put: () => Promise.resolve(), clear: () => Promise.resolve() }
    expect(await restoreCachedZip(broken)).toBeNull()
  })

  it("forgets the remembered file", async () => {
    const store = createMemoryZipStore()
    await rememberZip(store, new File([new Uint8Array([9])], "ultima4.zip"))
    await forgetZip(store)
    expect(await restoreCachedZip(store)).toBeNull()
  })
})
