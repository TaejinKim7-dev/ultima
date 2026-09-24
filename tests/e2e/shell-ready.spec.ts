import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-5/", import.meta.url))

test("static shell loads at /ultima/, wires the bridge, and never uploads local files", async ({
  page
}) => {
  const nonGetRequests: Array<{ method: string; url: string }> = []
  page.on("request", (request) => {
    if (request.method() !== "GET") {
      nonGetRequests.push({ method: request.method(), url: request.url() })
    }
  })

  // Given: the project-site base path this repo will deploy to.
  await page.goto("/ultima/")
  await expect(page).toHaveURL(/\/ultima\/$/)

  // When: the shell finishes wiring itself, it must mark itself ready.
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
  const abiVersion = await page.evaluate(() => window.ultimaBridge?.abiVersion)
  expect(abiVersion).toBe(1)

  // The user picks their own local ultima4.zip -- mocked in-memory here so
  // no original game data ever touches this repository or its evidence.
  await page.locator("#rom-picker").setInputFiles({
    name: "ultima4.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK mock original data placeholder")
  })
  await expect(page.locator("#dialogue-history")).toContainText("ultima4.zip")

  // Save import: an in-memory JSON payload, never a file on disk.
  await page.locator("#save-import").setInputFiles({
    name: "mock-save.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ mock: true }))
  })
  await expect(page.locator("#save-status")).toHaveText("저장 완료")

  // Save export triggers a local download, never a network request.
  const downloadPromise = page.waitForEvent("download")
  await page.locator("#save-export").click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe("ultima4-save-export.json")

  // Then: selecting/importing/exporting local files must never have made a
  // non-GET network request (i.e. nothing was ever uploaded anywhere).
  expect(nonGetRequests).toEqual([])

  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(
    `${evidenceDir}shell-ready.json`,
    JSON.stringify(
      {
        scenario: "happy path: static shell at /ultima/, file picker mock, bridge-ready state",
        observedAt: new Date().toISOString(),
        url: page.url(),
        bridgeReady: true,
        abiVersion,
        romPickerAcknowledged: true,
        saveImportStatus: "저장 완료",
        saveExportFilename: download.suggestedFilename(),
        nonGetRequestsObserved: nonGetRequests
      },
      null,
      2
    )
  )
})
