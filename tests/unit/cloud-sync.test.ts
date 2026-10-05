// Todo 53: the optional Google Drive layer on top of the local slots. The Drive
// module is faked (in-memory "remote"), the slots are the real controller over
// a memory store, so no network and no real engine.
import { describe, expect, it } from "vitest"
import { PARTY_SAV_SIZE } from "../../src/saves/party-summary.ts"
import { createMemorySlotStore } from "../../src/saves/slot-store.ts"
import { createSlotController, type EngineAdapter } from "../../src/saves/slot-controller.ts"
import type { SlotFile } from "../../src/saves/slots.ts"
import { createCloudSync, type DriveModule } from "../../src/cloud/cloud-sync.ts"
import { DriveAuthError, type RemoteSlot } from "../../src/cloud/drive-client.ts"

function party(name: string, moves = 1): Uint8Array {
  const bytes = new Uint8Array(PARTY_SAV_SIZE)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, moves, true)
  bytes.set(new TextEncoder().encode(name), 8 + 20)
  view.setUint16(472, 1, true)
  return bytes
}

function fakeDrive() {
  const remote = new Map<string, RemoteSlot & { data: Uint8Array }>()
  let nextFile = 1
  let failAuth = false
  const tokens: string[] = []
  const module: DriveModule = {
    DriveAuthError,
    async requestAccessToken() {
      tokens.push("t")
      return { token: "tok", expiresAt: Date.now() + 3_600_000 }
    },
    revokeAccessToken() {},
    createDriveClient() {
      return {
        async listSlots() {
          if (failAuth) throw new DriveAuthError("expired")
          return [...remote.values()].map(({ fileId, slotId, name, updatedAt }) => ({ fileId, slotId, name, updatedAt }))
        },
        async downloadSlot(fileId: string) {
          return [...remote.values()].find((slot) => slot.fileId === fileId)!.data
        },
        async uploadSlot(slot: { slotId: string; name: string; updatedAt: number; data: Uint8Array }, existing?: string) {
          const fileId = existing ?? `f${nextFile++}`
          remote.set(slot.slotId, { fileId, slotId: slot.slotId, name: slot.name, updatedAt: slot.updatedAt, data: slot.data })
          return fileId
        },
        async deleteSlot() {}
      }
    }
  }
  return { module, remote, tokens, setFailAuth: (on: boolean) => (failAuth = on) }
}

function slotsWith(working: SlotFile[] = []) {
  let current = working
  let savedListener: (() => void) | null = null
  const engine: EngineAdapter = {
    readWorking: () => current,
    async apply(next) {
      current = [...next]
    },
    onSaved(listener) {
      savedListener = listener
    }
  }
  let n = 0
  const controller = createSlotController({ store: createMemorySlotStore(), engine, now: () => 1000 + ++n, newId: () => `s${++n}` })
  return {
    controller,
    save(files: SlotFile[]) {
      current = files
      savedListener?.()
    }
  }
}

function setup(working: SlotFile[] = [], confirmAnswer = true) {
  const drive = fakeDrive()
  const local = slotsWith(working)
  const notes: string[] = []
  const cloud = createCloudSync({
    slots: local.controller,
    loadDrive: async () => drive.module,
    clientId: "client.apps.googleusercontent.com",
    doc: {} as Document,
    fetch: (() => Promise.reject(new Error("no network"))) as unknown as typeof fetch,
    confirm: () => confirmAnswer,
    notify: (text) => notes.push(text)
  })
  return { drive, local, cloud, notes }
}

describe("cloud sync", () => {
  it("is disconnected until connect() and then plans the slots", async () => {
    const t = setup([{ path: "party.sav", data: party("TJ") }])
    await t.local.controller.init()
    expect((await t.cloud.state()).connected).toBe(false)
    await t.cloud.connect()
    const state = await t.cloud.state()
    expect(state.connected).toBe(true)
    expect(state.entries).toEqual([expect.objectContaining({ name: "기본 슬롯", state: "local-only" })])
  })

  it("sync-all uploads local-only slots and downloads remote-only ones", async () => {
    const t = setup([{ path: "party.sav", data: party("TJ", 3) }])
    await t.local.controller.init()
    const other = setup([{ path: "party.sav", data: party("FAR", 7) }])
    await other.local.controller.init()
    const farUpload = (await other.local.controller.readForUpload((await other.local.controller.localInfo())[0]!.id))!
    t.drive.remote.set("far-slot", { fileId: "fx", slotId: "far-slot", name: "다른 기기", updatedAt: 500, data: farUpload.data })

    await t.cloud.connect()
    await t.cloud.syncAll()
    const local = await t.local.controller.state()
    expect(local.slots.map((slot) => slot.name).sort()).toEqual(["기본 슬롯", "다른 기기"].sort())
    expect([...t.drive.remote.values()].map((slot) => slot.name).sort()).toEqual(["기본 슬롯", "다른 기기"].sort())
    expect((await t.cloud.state()).entries.every((entry) => entry.state === "same")).toBe(true)
  })

  it("asks before Drive overwrites a local slot, and leaves it alone when declined", async () => {
    const t = setup([{ path: "party.sav", data: party("TJ", 3) }], false)
    await t.local.controller.init()
    const id = (await t.local.controller.localInfo())[0]!.id
    const newer = setup([{ path: "party.sav", data: party("TJ", 99) }])
    await newer.local.controller.init()
    const upload = (await newer.local.controller.readForUpload((await newer.local.controller.localInfo())[0]!.id))!
    t.drive.remote.set(id, { fileId: "f9", slotId: id, name: "기본 슬롯", updatedAt: 999_999, data: upload.data })
    await t.cloud.connect()
    await t.cloud.syncAll()
    const slot = (await t.local.controller.state()).slots.find((entry) => entry.id === id)!
    expect(slot.summary?.moves).toBe(3)
  })

  it("uploads automatically after each save while connected", async () => {
    const t = setup()
    await t.local.controller.init()
    await t.cloud.connect()
    t.local.save([{ path: "party.sav", data: party("TJ", 5) }])
    await t.local.controller.idle()
    await t.cloud.idle()
    expect([...t.drive.remote.values()].map((slot) => slot.name)).toEqual(["TJ"])
  })

  it("an expired token disconnects and asks to reconnect instead of failing silently", async () => {
    const t = setup([{ path: "party.sav", data: party("TJ") }])
    await t.local.controller.init()
    await t.cloud.connect()
    t.drive.setFailAuth(true)
    await t.cloud.refresh()
    expect((await t.cloud.state()).connected).toBe(false)
    expect(t.notes.join("\n")).toMatch(/다시 연결/)
  })
})
