// Todo 53: the Google Drive REST client for slot files in the hidden
// appDataFolder. Tested with a fake fetch; no network.
import { describe, expect, it } from "vitest"
import { createDriveClient, buildMultipartBody, DRIVE_SCOPE } from "../../src/cloud/drive-client.ts"

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown }

function fakeFetch(responses: Array<{ status?: number; json?: unknown; bytes?: Uint8Array }>) {
  const calls: Call[] = []
  const impl = async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body })
    const next = responses.shift() ?? { status: 200, json: {} }
    const status = next.status ?? 200
    const body = next.bytes !== undefined ? next.bytes : JSON.stringify(next.json ?? {})
    return new Response(body, { status })
  }
  return { calls, impl: impl as typeof fetch }
}

describe("drive client", () => {
  it("asks only for the app-data scope", () => {
    expect(DRIVE_SCOPE).toBe("https://www.googleapis.com/auth/drive.appdata")
  })

  it("lists slot files from appDataFolder with the token", async () => {
    const f = fakeFetch([
      {
        json: {
          files: [
            { id: "f1", name: "slot-s1.u4sv", appProperties: { slotId: "s1", slotName: "TJ", updatedAt: "1700" } },
            { id: "f2", name: "other.txt" }
          ]
        }
      }
    ])
    const client = createDriveClient({ fetch: f.impl, getToken: () => "tok" })
    const slots = await client.listSlots()
    expect(slots).toEqual([{ fileId: "f1", slotId: "s1", name: "TJ", updatedAt: 1700 }])
    expect(f.calls[0]!.url).toContain("spaces=appDataFolder")
    expect(f.calls[0]!.headers["authorization"]).toBe("Bearer tok")
  })

  it("creates a new slot file in appDataFolder with a multipart POST", async () => {
    const f = fakeFetch([{ json: { id: "new" } }])
    const client = createDriveClient({ fetch: f.impl, getToken: () => "tok" })
    const id = await client.uploadSlot({ slotId: "s1", name: "TJ", updatedAt: 1700, data: new Uint8Array([1, 2]) })
    expect(id).toBe("new")
    expect(f.calls[0]!.method).toBe("POST")
    expect(f.calls[0]!.url).toContain("/upload/drive/v3/files?uploadType=multipart")
    expect(f.calls[0]!.headers["content-type"]).toMatch(/^multipart\/related; boundary=/)
  })

  it("updates an existing file with PATCH (no parents in the metadata)", async () => {
    const f = fakeFetch([{ json: { id: "f1" } }])
    const client = createDriveClient({ fetch: f.impl, getToken: () => "tok" })
    await client.uploadSlot({ slotId: "s1", name: "TJ", updatedAt: 1800, data: new Uint8Array([3]) }, "f1")
    expect(f.calls[0]!.method).toBe("PATCH")
    expect(f.calls[0]!.url).toContain("/upload/drive/v3/files/f1?uploadType=multipart")
  })

  it("downloads file bytes with alt=media", async () => {
    const f = fakeFetch([{ bytes: new Uint8Array([9, 8, 7]) }])
    const client = createDriveClient({ fetch: f.impl, getToken: () => "tok" })
    expect([...(await client.downloadSlot("f1"))]).toEqual([9, 8, 7])
    expect(f.calls[0]!.url).toContain("/drive/v3/files/f1?alt=media")
  })

  it("throws a Korean error naming the HTTP status, and a distinct one when the token expired", async () => {
    const client = createDriveClient({ fetch: fakeFetch([{ status: 500 }]).impl, getToken: () => "tok" })
    await expect(client.listSlots()).rejects.toThrow(/500/)
    const expired = createDriveClient({ fetch: fakeFetch([{ status: 401 }]).impl, getToken: () => "tok" })
    await expect(expired.listSlots()).rejects.toThrow(/다시 연결/)
  })
})

describe("buildMultipartBody", () => {
  it("frames JSON metadata and binary data with the boundary", async () => {
    const body = buildMultipartBody({ name: "x" }, new Uint8Array([65, 66]), "BOUND")
    const text = new TextDecoder().decode(await new Response(body).arrayBuffer())
    expect(text).toContain("--BOUND\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\"name\":\"x\"}\r\n")
    expect(text).toContain("--BOUND\r\nContent-Type: application/octet-stream\r\n\r\nAB\r\n--BOUND--")
  })
})
