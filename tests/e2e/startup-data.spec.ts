import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { buildStoreZip } from "../lib/test-zip.ts"
import { REQUIRED_ULTIMA4_ENTRIES } from "../../src/engine/zip.ts"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-9")

function dummyEntries(names: readonly string[]) {
  return names.map((name) => ({ name, data: new TextEncoder().encode(`dummy:${name}`) }))
}

async function selectZip(page: import("@playwright/test").Page, buffer: Uint8Array, name = "ultima4.zip") {
  await page.locator("#rom-picker").setInputFiles({
    name,
    mimeType: "application/zip",
    buffer: Buffer.from(buffer)
  })
}

test.describe("Step 9: browser startup, ZIP validation, virtual FS", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("happy path: a verified real original-data ZIP starts the engine (main called once)", async ({ page }) => {
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    await selectZip(page, buffer)
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    const started = await page.locator("body").getAttribute("data-engine-started")
    expect(started).toBe("true")
    await page.screenshot({ path: join(evidenceDir, "startup-title.png") })
  })

  test("missing required files: rejected before main, with a fatal runtime-error", async ({ page }) => {
    const zip = buildStoreZip(dummyEntries(["WORLD.MAP"])) // far from complete: no TLK/EXE/SHAPES.EGA

    await page.goto("/")
    await selectZip(page, zip, "incomplete.zip")
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("false")
    expect(await page.locator("body").getAttribute("data-engine-start-reason")).toBe("missing-files")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    expect(dialogueText).toContain("필요한 파일이 없습니다")
    writeFileSync(
      join(evidenceDir, "zip-validation.log"),
      `missing-files case: dialogue panel text:\n${dialogueText}\n`
    )
  })

  test("corrupted ZIP (truncated end-of-central-directory): rejected before main", async ({ page }) => {
    const zip = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES))
    const corrupted = zip.slice(0, zip.length - 22)

    await page.goto("/")
    await selectZip(page, corrupted, "corrupted.zip")
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("false")
    expect(await page.locator("body").getAttribute("data-engine-start-reason")).toBe("corrupted")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    appendLog("corrupted case: " + dialogueText)
  })

  test("structurally-complete ZIP with a mismatched hash: allowed with a warning, engine still starts", async ({
    page
  }) => {
    const zip = buildStoreZip(dummyEntries(REQUIRED_ULTIMA4_ENTRIES)) // complete, but not the real archive

    await page.goto("/")
    await selectZip(page, zip, "unverified-release.zip")
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })

    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("true")
    const dialogueText = await page.locator("#dialogue-history").innerText()
    expect(dialogueText).toContain("해시가 확인된 배포판과 다릅니다")
    appendLog("sha-mismatch-allowed case: " + dialogueText)
  })

  test("reload without reselecting data: stays in a clean waiting state, no crash, no auto-start", async ({
    page
  }) => {
    await page.goto("/")
    await page.reload()
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

    const engineStarted = await page.locator("body").getAttribute("data-engine-started")
    expect(engineStarted).toBeNull()
    await expect(page.locator("#rom-picker")).toBeEnabled()
    const dialogueText = await page.locator("#dialogue-history").innerText()
    expect(dialogueText).toBe("")
  })
})

function appendLog(line: string) {
  writeFileSync(join(evidenceDir, "zip-validation.log"), line + "\n", { flag: "a" })
}
