import { expect, test } from "./fixtures.ts"
import { existsSync, readFileSync } from "node:fs"
import type { Page } from "@playwright/test"

// Todo 51 (user request 2026-10-05): named save slots on top of the real
// engine's single working copy. Real engine + real IDBFS, because the bug that
// prompted this spec (reading the working copy fired Emscripten's
// onCloseFile -> "저장 중/저장 종료" flickering forever) only exists with the
// real FS and cannot be reproduced by a fake.
//   1. a real character creation + save lands in a slot named after the avatar;
//   2. after the slot panel is up, the save-state does not keep flickering
//      (count the debug log's slot-saved-signal entries over a quiet window);
//   3. a new empty slot can be created and selected (working copy cleared),
//      and the first slot can be selected again with its party.sav restored.
// Timing of the character-creation flow is copied from save-reload.spec.ts.

async function bootAndSelectZip(page: Page, buffer: Buffer): Promise<void> {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await page.locator("#game-canvas").click()
}

async function pressKey(page: Page, k: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(k)
  await page.waitForTimeout(delayMs)
}

async function saveStatusText(page: Page): Promise<string> {
  return page.locator("#save-status").innerText()
}

async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter")
  await pressKey(page, "Enter")
  await pressKey(page, "i")
  for (const ch of "Avatar") {
    await page.keyboard.press(ch)
    await page.waitForTimeout(150)
  }
  await pressKey(page, "Enter")
  await pressKey(page, "m")
  for (let i = 0; i < 26; i++) {
    await pressKey(page, "Enter", 700)
    if ((await saveStatusText(page)).includes("완료")) return true
  }
  for (let i = 0; i < 20; i++) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await saveStatusText(page)).includes("완료")) return true
  }
  return false
}

type DebugEntry = { event: string; data: unknown }
async function debugEntries(page: Page, event: string): Promise<DebugEntry[]> {
  return page.evaluate((name) => (window.ultimaDebugLog?.entries() ?? []).filter((entry) => entry.event === name) as DebugEntry[], event)
}

async function slotNames(page: Page): Promise<string[]> {
  return page.locator("#slot-panel .slot-name").allInnerTexts()
}

test.describe("Todo 51: save slots", () => {
  test("a real save lands in a slot, the save state stays quiet, and slots can be switched", async ({ page }) => {
    test.setTimeout(420_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    // 1. First run: real character creation writes party.sav; the slot panel
    //    captures it into a slot named after the avatar.
    await bootAndSelectZip(page, buffer)
    await expect(page.locator("#slot-panel")).toBeVisible({ timeout: 20_000 })
    expect(await createCharacterAndWaitForSave(page), "character creation never reported 저장 완료").toBe(true)
    // The engine stores the typed name lower-cased ("avatar").
    await expect.poll(async () => (await slotNames(page)).join("|"), { timeout: 15_000 }).toMatch(/avatar/i)
    expect((await slotNames(page)).some((name) => name.includes("사용 중"))).toBe(true)

    // 2. No feedback loop: after the capture settles, no further "saved"
    //    signals arrive during a quiet window.
    await page.waitForTimeout(2000)
    const before = (await debugEntries(page, "slot-saved-signal")).length
    await page.waitForTimeout(4000)
    const after = (await debugEntries(page, "slot-saved-signal")).length
    expect(after - before, "the save signal kept firing while idle (feedback loop)").toBe(0)

    // 3. Reload: the slot survives, a new empty slot can be made and selected,
    //    then the first slot can be selected again.
    await bootAndSelectZip(page, buffer)
    await expect(page.locator("#slot-panel")).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await slotNames(page)).join("|"), { timeout: 15_000 }).toMatch(/avatar/i)

    await page.locator("#slot-panel .slot-toolbar button", { hasText: "새 슬롯" }).click()
    await expect.poll(async () => (await slotNames(page)).length, { timeout: 10_000 }).toBe(2)
    const emptyRow = page.locator("#slot-panel .slot-row", { hasText: "슬롯 1" })
    await emptyRow.locator("button", { hasText: "선택" }).click()
    await expect.poll(async () => (await debugEntries(page, "slot-apply")).length, { timeout: 10_000 }).toBeGreaterThan(0)
    const applyEmpty = (await debugEntries(page, "slot-apply")).at(-1)!.data as { files: string[] }
    expect(applyEmpty.files).toEqual([])
    await expect(emptyRow).toContainText("사용 중")

    const avatarRow = page.locator("#slot-panel .slot-row", { hasText: /avatar/i })
    await avatarRow.locator("button", { hasText: "선택" }).click()
    await expect(avatarRow).toContainText("사용 중", { timeout: 10_000 })
    const applyAvatar = (await debugEntries(page, "slot-apply")).at(-1)!.data as { files: string[] }
    expect(applyAvatar.files.some((file) => file.startsWith("party.sav:502"))).toBe(true)
  })
})
