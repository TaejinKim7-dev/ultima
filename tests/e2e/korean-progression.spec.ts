import { expect, test, type Page } from "@playwright/test"
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

// Todo 15: real engine text is rasterized directly into the WebGL canvas.
// There is currently no DOM or OCR-readable copy of those fragments, so this
// spec does not pretend to read canvas prose. It captures the user-visible
// frames and checks the same semantic IDs through window.ultimaI18n, the
// established runtime observability boundary for Korean display text.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-15/korean-screens")
const untranslatedEvidencePath = join(repoRoot, ".omo/evidence/ultima-web/task-15/untranslated-detected.log")

const representativeEntries = [
  { id: "ui:intro:0", fallback: "Video options" },
  { id: "ui:game:37", fallback: "Save and quit" },
  { id: "MOONGLOW:0:name", fallback: "Calabrini" },
  { id: "avatar.exe:lordBritishText:0", fallback: "I am Lord British" },
  { id: "avatar.exe:shrineAdvice:0", fallback: "Do not take another's gold" },
  { id: "avatar.exe:endgameText1:0", fallback: "The Codex reveals its wisdom" }
] as const

async function bootAndSelectZip(page: Page, buffer: Buffer): Promise<void> {
  await page.goto("/")
  await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
  await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
  await expect(page.locator("body")).toHaveAttribute("data-engine-started", "true")
  await page.locator("#game-canvas").click()
}

async function pressKey(page: Page, key: string, delayMs = 800): Promise<void> {
  await page.keyboard.press(key)
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

  for (const character of "Avatar") {
    await page.keyboard.press(character)
    await page.waitForTimeout(150)
  }
  await pressKey(page, "Enter")
  await pressKey(page, "m")

  for (let attempt = 0; attempt < 26; attempt += 1) {
    await pressKey(page, "Enter", 700)
    if ((await saveStatusText(page)).includes("완료")) return true
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await saveStatusText(page)).includes("완료")) return true
  }
  return false
}

test.describe("Todo 15: Korean progression", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: real ZIP boots Korean semantic coverage and a real save reloads through Journey Onward", async ({
    page
  }) => {
    test.setTimeout(240_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    if (!zipPath) return
    const buffer = readFileSync(zipPath)

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    const translations = await page.evaluate((entries) => {
      const runtime = window.ultimaI18n
      return entries.map(({ id, fallback }) => ({
        id,
        translation: runtime?.resolve(id, fallback),
        placeholdersMatch: runtime?.checkPlaceholders(id)
      }))
    }, representativeEntries)
    writeFileSync(join(evidenceDir, "semantic-runtime.json"), `${JSON.stringify(translations, null, 2)}\n`)
    for (const entry of translations) {
      expect(entry.translation, `${entry.id} must resolve through the Korean display boundary`).toMatch(/\p{Script=Hangul}/u)
      expect(entry.placeholdersMatch, `${entry.id} must retain its declared placeholders`).toBe(true)
    }

    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    await expect(page.locator("body")).toHaveAttribute("data-engine-started", "true")
    await page.locator("#game-canvas").click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(evidenceDir, "01-real-intro-title.png") })

    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "the real engine did not report a completed IDBFS save after character creation").toBe(true)
    await expect(page.locator("#save-status")).toHaveText("저장 완료")
    await page.screenshot({ path: join(evidenceDir, "02-real-save-complete.png") })

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    const menuShot = await page.locator("#game-canvas").screenshot()
    await page.screenshot({ path: join(evidenceDir, "03-real-intro-menu.png") })

    await pressKey(page, "j", 2000)
    const loadedShot = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "04-real-journey-onward-load.png"), loadedShot)
    expect(loadedShot.equals(menuShot), "Journey Onward did not visibly leave the intro menu after the real save").toBe(false)
  })

  test("failure path: strict i18n check names a pending semantic ID from a disposable untranslated copy", () => {
    mkdirSync(join(repoRoot, ".omo/evidence/ultima-web/task-15"), { recursive: true })
    const temporaryRoot = mkdtempSync(join(tmpdir(), "ultima-i18n-strict-"))
    const schemaDir = join(temporaryRoot, "ko")
    try {
      cpSync(join(repoRoot, "locales/ko"), schemaDir, { recursive: true })
      const uiSchemaPath = join(schemaDir, "ui.json")
      const uiSchema = readFileSync(uiSchemaPath, "utf8")
      const untranslatedSchema = uiSchema.replace(
        /("ui:intro:0":\s*\{[\s\S]*?"translation":\s*)"[^"]*"(,\s*"status":\s*)"ready"/,
        '$1"BANNED_UNTRANSLATED_ASCII"$2"pending"'
      )
      expect(untranslatedSchema, "the disposable fixture must change ui:intro:0 only").not.toBe(uiSchema)
      writeFileSync(uiSchemaPath, untranslatedSchema)

      const result = spawnSync(process.execPath, ["scripts/i18n-check.mjs", schemaDir, "--strict"], {
        cwd: repoRoot,
        encoding: "utf8"
      })
      const output = `${result.stdout}${result.stderr}`
      writeFileSync(untranslatedEvidencePath, output)
      expect(result.status, "the unmodified strict checker must reject the disposable pending entry").toBe(1)
      expect(output).toContain('locales/ko/ui.json entry "ui:intro:0"')
      expect(output).toContain('status "pending" is not allowed with --strict')
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
