import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "./fixtures.ts"

// Todo 38: the i18n coverage hook records dropped text as hashes/ids only.
// `Module.u4Text.message` is the bridge's `talkTextReceiver.message`
// (src/main.ts passes bridge.talkTextReceiver to the engine as `talkText`).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-38")

const KEY = /^(?:[0-9a-f]{8}|[A-Za-z][A-Za-z0-9_-]*(?::[A-Za-z0-9_.-]+)+(?:\|\d+\|[0-9a-f]{8})?)$/

test.describe("Todo 38: i18n coverage hook", () => {
  test("an unknown screenMessage hash is recorded, and the snapshot holds only hashes and ids", async ({ page }) => {
    mkdirSync(evidenceDir, { recursive: true })
    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    const snapshot = await page.evaluate(() => {
      const receiver = window.ultimaBridge?.talkTextReceiver
      // An unmapped format hash with an English-looking argument: neither may be stored as text.
      receiver?.message("deadbeef", ["Thou dost fumble the words"])
      receiver?.message("deadbeef", [])
      receiver?.vendor("cafebabe", [])
      return window.ultimaI18nCoverage?.snapshot() ?? null
    })
    expect(snapshot).not.toBeNull()
    expect(snapshot?.["ui-unmapped"]).toEqual([{ key: "deadbeef", count: 2 }])
    expect(snapshot?.["vendor-unmapped"]).toEqual([{ key: "cafebabe", count: 1 }])
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toMatch(/Thou|fumble|words/)
    for (const rows of Object.values(snapshot ?? {})) {
      if (!Array.isArray(rows)) continue
      for (const row of rows as { key: string }[]) expect(row.key).toMatch(KEY)
    }
    writeFileSync(join(evidenceDir, "e2e-snapshot-shell.json"), `${serialized}\n`)
  })

  test("with the real engine booted, the hook stays readable and keys stay hashes/ids", async ({ page }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    test.setTimeout(120_000)
    mkdirSync(evidenceDir, { recursive: true })
    await page.goto("/")
    await page.locator("#rom-picker").setInputFiles({
      name: "ultima4.zip",
      mimeType: "application/zip",
      buffer: readFileSync(zipPath as string)
    })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 30_000 })
    await expect(page.locator("body")).toHaveAttribute("data-engine-started", "true")
    await page.waitForTimeout(3000)
    const snapshot = await page.evaluate(() => {
      window.ultimaBridge?.talkTextReceiver.message("deadbeef", [])
      return window.ultimaI18nCoverage?.snapshot() ?? null
    })
    expect(snapshot?.["ui-unmapped"].some((row) => row.key === "deadbeef")).toBe(true)
    for (const [kind, rows] of Object.entries(snapshot ?? {})) {
      if (!Array.isArray(rows)) continue
      for (const row of rows as { key: string }[]) expect(row.key, kind).toMatch(KEY)
    }
    expect(snapshot?.rejected).toBe(0)
    writeFileSync(join(evidenceDir, "e2e-snapshot-engine.json"), `${JSON.stringify(snapshot)}\n`)
  })
})
