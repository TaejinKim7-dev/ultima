import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// Todo 18: memory-growth smoke test. Acceptance criteria: "memory smoke
// runs 10 minutes or a bounded accelerated equivalent and records browser/
// version". Defaults to a short, CI-friendly duration (documented below);
// override with the MEMORY_SMOKE_MINUTES env var for a real, longer
// overnight run (e.g. `MEMORY_SMOKE_MINUTES=10 npm run test:memory-smoke`).
// Like every other long-running real-engine spec in this suite (see
// handoff.md's "e2e는 --workers=1로 긴 스펙 분리 실행" convention), run
// this individually rather than as part of a blind `npm run test:e2e`
// sweep.
//
// This creates a real character, reaches the real world map, then drives
// real repeated overworld movement (arrow keys) against the real running
// engine (real ultima4.zip) for the configured duration, sampling
// Chromium's non-standard `performance.memory.usedJSHeapSize` at a fixed
// interval. CAVEAT (stated, not hidden): `usedJSHeapSize` measures the JS
// heap only -- it does NOT include the wasm module's own linear memory
// (where the actual C++ engine/game state lives), so this is a JS-side
// leak smoke test, not full engine memory coverage. `--enable-precise-
// memory-info` is passed so Chromium reports real (non-quantized) values;
// without it, short-window samples can come back identical regardless of
// real allocation, making any ratio computed from them meaningless.
const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-18")
const evidenceDirTask42 = join(repoRoot, ".omo/evidence/ultima-web/task-42")

// `--enable-precise-memory-info` is a CHROMIUM-only switch, so F3 scoped it
// to the chromium project rather than handing it to every engine. Observed
// on Playwright 1.52 / WebKit 18.4: WebKit's launcher rejects the whole
// command line and this test died before any page existed --
// "[err] Cannot parse arguments: Unknown option --enable-precise-memory-info
//   Error: browserType.launch: Target page, context or browser has been closed"
// -- so WebKit got ZERO memory-smoke coverage. Firefox ignored the unknown
// flag. Scoping it keeps the chromium samples byte-for-byte identical and
// lets firefox/webkit actually run the engine-liveness half of this test
// (their `performance.memory` is undefined, which the verdict below already
// handles explicitly by recording the skip reason rather than a fake ratio).
test.use(
  async (
    { browserName }: { browserName: "chromium" | "firefox" | "webkit" },
    use: (options: { launchOptions?: { args?: string[] } }) => Promise<void>
  ) => {
    await use({
      launchOptions: browserName === "chromium" ? { args: ["--enable-precise-memory-info"] } : {}
    })
  }
)

// Real ultima4.zip is small and the loop body is cheap key presses, so a
// short default keeps this runnable in every normal dev pass; the
// acceptance criteria explicitly allows "a bounded accelerated
// equivalent" instead of the full 10 minutes.
const DEFAULT_MINUTES = 1
const SAMPLE_INTERVAL_MS = 5_000
// A real leak grows roughly monotonically and without bound; normal JIT
// warm-up/GC-pacing noise in a short window should not exceed this ratio
// between the settled early samples and the settled late samples.
const GROWTH_RATIO_THRESHOLD = 3

// Todo 42 wasm linear-memory cap (bytes). Measured on Chromium 136, 1-minute
// run (13 samples): wasm linear memory was flat at 16,973,824 bytes (16.2 MiB)
// from the first to the last sample. The cap is 64 MiB (67,108,864), about
// 4x the measured max, so normal allocator growth passes while a runaway
// engine-side leak fails. Wasm memory never shrinks, so this is an absolute
// cap on the maximum, not a return-to-baseline check. Override with
// MEMORY_SMOKE_WASM_CAP_BYTES (the failure-path proof plants a tiny cap).
const DEFAULT_WASM_MEMORY_CAP_BYTES = 67_108_864

const WASM_MEMORY_CAP_BYTES = Number(process.env["MEMORY_SMOKE_WASM_CAP_BYTES"] ?? DEFAULT_WASM_MEMORY_CAP_BYTES)

interface MemorySample {
  readonly atMs: number
  readonly usedJSHeapSize: number | null
  readonly wasmMemoryBytes: number | null
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

test.describe("Todo 18: memory-growth smoke", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("repeated real overworld movement over a sustained window does not show unbounded JS-heap growth", async ({
    page,
    browser
  }) => {
    const minutes = Number(process.env["MEMORY_SMOKE_MINUTES"] ?? DEFAULT_MINUTES)
    const durationMs = minutes * 60_000
    test.setTimeout(durationMs + 300_000)

    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await page.goto("/")
    await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")
    await page.locator("#rom-picker").setInputFiles({ name: "ultima4.zip", mimeType: "application/zip", buffer })
    await page.waitForFunction(() => document.body.dataset["engineStarted"] !== undefined, { timeout: 20_000 })
    expect(await page.locator("body").getAttribute("data-engine-started")).toBe("true")
    await page.locator("#game-canvas").click()

    const saved = await createCharacterAndWaitForSave(page)
    expect(saved, "a real character must be created to reach the real overworld").toBe(true)
    await page.waitForTimeout(6000) // let the post-save segue screens land on the world map
    await pressKey(page, "Enter", 1200) // clear a possible lingering waitAnyKey() segue screen

    const samples: MemorySample[] = []
    const start = Date.now()
    async function sample(): Promise<void> {
      const usedJSHeapSize = await page.evaluate(() => {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        return mem ? mem.usedJSHeapSize : null
      })
      // Fresh read every time -- never cache the buffer or its length.
      const wasmMemoryBytes = await page.evaluate(() => window.ultimaWasmMemory?.bytes() ?? null)
      samples.push({ atMs: Date.now() - start, usedJSHeapSize, wasmMemoryBytes })
    }

    await sample()
    while (Date.now() - start < durationMs) {
      // Cheap, safe, repeatable REAL overworld movement.
      await page.keyboard.press("ArrowRight")
      await page.waitForTimeout(150)
      await page.keyboard.press("ArrowLeft")
      await page.waitForTimeout(150)
      if (samples.length === 0 || Date.now() - start - samples[samples.length - 1]!.atMs >= SAMPLE_INTERVAL_MS) {
        await sample()
      }
    }
    await sample()

    expect(
      await page.locator("body").getAttribute("data-engine-started"),
      "engine must still be alive at the end of the smoke window"
    ).toBe("true")

    const browserName = browser.browserType().name()
    const browserVersion = browser.version()
    const heapSamples = samples.filter((s): s is MemorySample & { usedJSHeapSize: number } => s.usedJSHeapSize !== null)

    let verdict: string
    let ratio: number | null = null
    if (heapSamples.length < 4) {
      verdict =
        "performance.memory unavailable in this browser/context -- heap-growth verdict skipped (browser/version still recorded below)."
    } else {
      const warmupCount = Math.max(1, Math.floor(heapSamples.length * 0.2))
      const early = heapSamples.slice(warmupCount, warmupCount + 3)
      const late = heapSamples.slice(-3)
      const earlyAvg = early.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / early.length
      const lateAvg = late.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / late.length
      ratio = earlyAvg > 0 ? lateAvg / earlyAvg : 1
      verdict = `earlyAvg=${Math.round(earlyAvg)} lateAvg=${Math.round(lateAvg)} ratio=${ratio.toFixed(3)} (threshold ${GROWTH_RATIO_THRESHOLD})`
    }

    const wasmSamples = samples.filter((s): s is MemorySample & { wasmMemoryBytes: number } => s.wasmMemoryBytes !== null)
    const wasmMax = wasmSamples.reduce((max, s) => Math.max(max, s.wasmMemoryBytes), 0)
    const wasmFirst = wasmSamples[0]?.wasmMemoryBytes ?? null
    const wasmVerdict = `wasm linear memory: first=${wasmFirst} max=${wasmMax} cap=${WASM_MEMORY_CAP_BYTES} samples=${wasmSamples.length}/${samples.length}`

    writeFileSync(
      join(evidenceDir, "memory-smoke.log"),
      `browser: ${browserName} ${browserVersion}\nduration: ${minutes} minute(s) (MEMORY_SMOKE_MINUTES=${minutes})\n` +
        `caveat: usedJSHeapSize covers the JS heap only; wasm linear memory is sampled separately as wasmMemoryBytes.\n` +
        `samples: ${JSON.stringify(samples)}\nverdict: ${verdict}\n${wasmVerdict}\n`
    )
    mkdirSync(evidenceDirTask42, { recursive: true })
    writeFileSync(
      join(evidenceDirTask42, `memory-smoke-${browserName}.json`),
      JSON.stringify(
        { browser: browserName, version: browserVersion, minutes, wasmMemoryCapBytes: WASM_MEMORY_CAP_BYTES, wasmMemoryMaxBytes: wasmMax, jsHeapRatio: ratio, samples },
        null,
        2
      ) + "\n"
    )
    if (ratio !== null) {
      expect(ratio, `possible unbounded heap growth: ${verdict}`).toBeLessThan(GROWTH_RATIO_THRESHOLD)
    }
    expect(wasmSamples.length, `wasm memory must be readable on every sample: ${wasmVerdict}`).toBe(samples.length)
    expect(wasmMax, `wasm linear memory exceeded its cap: ${wasmVerdict}`).toBeLessThanOrEqual(WASM_MEMORY_CAP_BYTES)
  })
})
