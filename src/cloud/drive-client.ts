// Todo 53 (Google Drive slot sync, user decision 2026-10-05): the Google Drive
// REST client. This file is imported lazily (dynamic import), so the bundler
// emits it as its own chunk (dist/assets/drive-client-<hash>.js) -- the only
// shipped file audit:dist allows to talk to Google (scripts/audit-dist.mjs
// CLOUD_SYNC_ORIGINS). Each player's slots go to THEIR OWN Drive, in the hidden
// app-data folder; the scope below cannot see any other Drive file.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
const GIS_SRC = "https://accounts.google.com/gsi/client"
const DRIVE_API = "https://www.googleapis.com/drive/v3/files"
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"
const SLOT_FILE_PREFIX = "slot-"

export interface RemoteSlot {
  readonly fileId: string
  readonly slotId: string
  readonly name: string
  readonly updatedAt: number
}

export interface SlotUpload {
  readonly slotId: string
  readonly name: string
  readonly updatedAt: number
  readonly data: Uint8Array
}

export interface DriveClient {
  listSlots(): Promise<RemoteSlot[]>
  downloadSlot(fileId: string): Promise<Uint8Array>
  /** Creates the slot file, or updates `existingFileId`; returns the file id. */
  uploadSlot(slot: SlotUpload, existingFileId?: string): Promise<string>
  deleteSlot(fileId: string): Promise<void>
}

export interface DriveClientOptions {
  readonly fetch: typeof fetch
  readonly getToken: () => string
}

export class DriveAuthError extends Error {}

/** multipart/related body: JSON metadata part + binary data part. */
export function buildMultipartBody(metadata: Record<string, unknown>, data: Uint8Array, boundary: string): Blob {
  const head =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
  const tail = `\r\n--${boundary}--`
  return new Blob([head, data as BlobPart, tail])
}

export function createDriveClient(options: DriveClientOptions): DriveClient {
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${options.getToken()}`)
    const response = await options.fetch(url, { ...init, headers })
    if (response.status === 401 || response.status === 403) {
      throw new DriveAuthError(`Google Drive 인증이 만료되었습니다(HTTP ${response.status}). 다시 연결해 주세요.`)
    }
    if (!response.ok) {
      throw new Error(`Google Drive 요청이 실패했습니다(HTTP ${response.status}).`)
    }
    return response
  }

  function metadataFor(slot: SlotUpload): Record<string, unknown> {
    return {
      name: `${SLOT_FILE_PREFIX}${slot.slotId}.u4sv`,
      mimeType: "application/octet-stream",
      appProperties: { slotId: slot.slotId, slotName: slot.name.slice(0, 60), updatedAt: String(slot.updatedAt) }
    }
  }

  return {
    async listSlots() {
      const fields = encodeURIComponent("files(id,name,appProperties)")
      const response = await call(`${DRIVE_API}?spaces=appDataFolder&pageSize=1000&fields=${fields}`)
      const json = (await response.json()) as { files?: Array<{ id?: string; name?: string; appProperties?: Record<string, string> }> }
      const slots: RemoteSlot[] = []
      for (const file of json.files ?? []) {
        const props = file.appProperties ?? {}
        const updatedAt = Number(props["updatedAt"])
        if (typeof file.id !== "string" || typeof props["slotId"] !== "string" || !Number.isFinite(updatedAt)) continue
        slots.push({ fileId: file.id, slotId: props["slotId"], name: props["slotName"] ?? props["slotId"], updatedAt })
      }
      return slots
    },
    async downloadSlot(fileId) {
      const response = await call(`${DRIVE_API}/${encodeURIComponent(fileId)}?alt=media`)
      return new Uint8Array(await response.arrayBuffer())
    },
    async uploadSlot(slot, existingFileId) {
      const boundary = `u4slot${Math.random().toString(36).slice(2)}`
      const metadata = metadataFor(slot)
      const create = existingFileId === undefined
      const url = create
        ? `${UPLOAD_API}?uploadType=multipart&fields=id`
        : `${UPLOAD_API}/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id`
      const response = await call(url, {
        method: create ? "POST" : "PATCH",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: buildMultipartBody(create ? { ...metadata, parents: ["appDataFolder"] } : metadata, slot.data, boundary)
      })
      const json = (await response.json()) as { id?: string }
      return json.id ?? existingFileId ?? ""
    },
    async deleteSlot(fileId) {
      await call(`${DRIVE_API}/${encodeURIComponent(fileId)}`, { method: "DELETE" })
    }
  }
}

interface GisTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}
interface GisTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}
interface GisWindow {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: { client_id: string; scope: string; callback: (response: GisTokenResponse) => void; error_callback?: (error: { type?: string }) => void }): GisTokenClient
        revoke(token: string, done?: () => void): void
      }
    }
  }
}

function loadGis(doc: Document): Promise<void> {
  const win = doc.defaultView as (Window & GisWindow) | null
  if (win?.google?.accounts?.oauth2 !== undefined) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = doc.createElement("script")
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다."))
    doc.head.appendChild(script)
  })
}

export interface AccessToken {
  readonly token: string
  readonly expiresAt: number
}

/**
 * Asks Google Identity Services for an access token (a popup on the first
 * call; must run from a click). The token is kept in memory only.
 */
export async function requestAccessToken(doc: Document, clientId: string, prompt: "" | "consent" = ""): Promise<AccessToken> {
  await loadGis(doc)
  const win = doc.defaultView as (Window & GisWindow) | null
  const oauth2 = win?.google?.accounts.oauth2
  if (oauth2 === undefined) throw new Error("Google 로그인 기능을 사용할 수 없습니다.")
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error !== undefined || response.access_token === undefined) {
          reject(new Error(`Google 로그인에 실패했습니다(${response.error ?? "토큰 없음"}).`))
          return
        }
        resolve({ token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 })
      },
      error_callback: (error) => reject(new Error(`Google 로그인 창이 닫혔거나 막혔습니다(${error.type ?? "unknown"}).`))
    })
    client.requestAccessToken({ prompt })
  })
}

export function revokeAccessToken(doc: Document, token: string): void {
  const win = doc.defaultView as (Window & GisWindow) | null
  win?.google?.accounts.oauth2.revoke(token)
}
