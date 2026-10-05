// Todo 53 (user decision 2026-10-05: local slots by default, Google Drive as
// an option): syncs the local save slots with the player's OWN Google Drive
// (hidden app-data folder). Nothing here talks to Google directly -- the Drive
// code (src/cloud/drive-client.ts) is loaded on demand via `loadDrive`, which
// in the app is a dynamic import so it ships as its own chunk (the only file
// audit:dist lets reach Google). The access token lives in memory only.

import type { AccessToken, DriveClient, DriveClientOptions } from "./drive-client.ts"
import { planSync, type SyncEntry } from "./sync-plan.ts"
import type { SlotController } from "../saves/slot-controller.ts"

/** The parts of drive-client.ts this controller uses (a fake in unit tests). */
export interface DriveModule {
  readonly DriveAuthError: new (message?: string) => Error
  requestAccessToken(doc: Document, clientId: string, prompt?: "" | "consent"): Promise<AccessToken>
  revokeAccessToken(doc: Document, token: string): void
  createDriveClient(options: DriveClientOptions): DriveClient
}

export interface CloudSyncState {
  readonly connected: boolean
  readonly busy: boolean
  readonly entries: readonly SyncEntry[]
}

export interface CloudSync {
  state(): Promise<CloudSyncState>
  /** Must run from a click (Google's sign-in popup). */
  connect(): Promise<void>
  disconnect(): void
  refresh(): Promise<void>
  push(slotId: string): Promise<void>
  pull(slotId: string): Promise<void>
  syncAll(): Promise<void>
  subscribe(listener: () => void): void
  idle(): Promise<void>
}

export interface CloudSyncOptions {
  readonly slots: SlotController
  readonly loadDrive: () => Promise<DriveModule>
  readonly clientId: string
  readonly doc: Document
  readonly fetch: typeof fetch
  /** Asks the player (window.confirm in the app). */
  readonly confirm: (text: string) => boolean
  /** A short Korean notice (the dialogue panel). */
  readonly notify: (text: string) => void
  readonly trace?: (event: string, data?: unknown) => void
}

export function createCloudSync(options: CloudSyncOptions): CloudSync {
  const { slots } = options
  const trace = options.trace ?? (() => undefined)
  const listeners: Array<() => void> = []
  let drive: DriveModule | null = null
  let client: DriveClient | null = null
  let token: AccessToken | null = null
  let entries: SyncEntry[] = []
  let busy = false
  let pending: Promise<void> = Promise.resolve()

  function changed(): void {
    for (const listener of listeners) {
      try {
        listener()
      } catch {
        // a UI bug must not break syncing
      }
    }
  }

  function connected(): boolean {
    return client !== null && token !== null && token.expiresAt > Date.now()
  }

  function dropConnection(): void {
    client = null
    token = null
    entries = []
  }

  /** Runs one Drive operation; an expired token disconnects with a clear notice. */
  async function guarded<T>(label: string, body: (drive: DriveClient) => Promise<T>): Promise<T | undefined> {
    if (!connected() || client === null) {
      dropConnection()
      changed()
      options.notify("Google Drive 연결이 끊겼습니다. '연결' 버튼으로 다시 연결해 주세요.\n")
      return undefined
    }
    busy = true
    changed()
    try {
      return await body(client)
    } catch (error) {
      trace("cloud-error", { label, message: error instanceof Error ? error.message : String(error) })
      if (drive !== null && error instanceof drive.DriveAuthError) {
        dropConnection()
        options.notify("Google Drive 인증이 만료되었습니다. '연결' 버튼으로 다시 연결해 주세요.\n")
      } else {
        options.notify(`[Drive 오류] ${error instanceof Error ? error.message : "알 수 없는 오류"}\n`)
      }
      return undefined
    } finally {
      busy = false
      changed()
    }
  }

  async function replan(): Promise<void> {
    const remote = await guarded("list", (c) => c.listSlots())
    if (remote === undefined) return
    entries = planSync(await slots.localInfo(), remote)
    trace("cloud-plan", { entries: entries.map((entry) => `${entry.slotId}:${entry.state}`) })
    changed()
  }

  function fileIdOf(slotId: string): string | undefined {
    return entries.find((entry) => entry.slotId === slotId)?.fileId
  }

  async function pushOne(slotId: string): Promise<void> {
    const upload = await slots.readForUpload(slotId)
    if (upload === null) return
    const existing = fileIdOf(slotId)
    const fileId = await guarded("upload", (c) => c.uploadSlot(upload, existing))
    trace("cloud-push", { slotId, fileId: fileId ?? null })
  }

  async function pullOne(entry: SyncEntry): Promise<void> {
    if (entry.fileId === undefined || entry.remoteUpdatedAt === undefined) return
    const data = await guarded("download", (c) => c.downloadSlot(entry.fileId!))
    if (data === undefined) return
    await slots.importRemote({ slotId: entry.slotId, name: entry.name, updatedAt: entry.remoteUpdatedAt }, data)
    trace("cloud-pull", { slotId: entry.slotId })
  }

  slots.onCaptured((slotId) => {
    if (!connected()) return
    pending = pending.then(async () => {
      await pushOne(slotId)
      await replan()
    })
  })

  return {
    async state() {
      return { connected: connected(), busy, entries }
    },
    async connect() {
      drive = await options.loadDrive()
      token = await drive.requestAccessToken(options.doc, options.clientId)
      client = drive.createDriveClient({ fetch: options.fetch, getToken: () => token?.token ?? "" })
      trace("cloud-connected", {})
      options.notify("Google Drive에 연결했습니다. 저장(Q)하면 자동으로 Drive에도 올라갑니다.\n")
      await replan()
    },
    disconnect() {
      if (drive !== null && token !== null) drive.revokeAccessToken(options.doc, token.token)
      dropConnection()
      trace("cloud-disconnected", {})
      options.notify("Google Drive 연결을 해제했습니다. 슬롯은 이 브라우저에 그대로 남습니다.\n")
      changed()
    },
    refresh: () => replan(),
    async push(slotId) {
      await pushOne(slotId)
      await replan()
    },
    async pull(slotId) {
      const entry = entries.find((candidate) => candidate.slotId === slotId)
      if (entry === undefined) return
      if (entry.state === "local-newer" && !options.confirm(`이 브라우저의 '${entry.name}'이(가) Drive보다 최신입니다. Drive 것으로 덮어쓸까요?`)) return
      await pullOne(entry)
      await replan()
    },
    async syncAll() {
      for (const entry of [...entries]) {
        if (entry.state === "local-only" || entry.state === "local-newer") {
          await pushOne(entry.slotId)
        } else if (entry.state === "remote-only") {
          await pullOne(entry)
        } else if (entry.state === "remote-newer") {
          if (options.confirm(`Drive의 '${entry.name}'이(가) 이 브라우저보다 최신입니다. 이 브라우저의 슬롯을 덮어쓸까요?`)) {
            await pullOne(entry)
          }
        }
        if (!connected()) return
      }
      await replan()
    },
    subscribe(listener) {
      listeners.push(listener)
    },
    idle: () => pending
  }
}
