import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

// Step 8 focused browser QA: the shell's real input queue (bundled from
// src/bridge/input-queue.ts) is driven with genuine DOM keydown and IME
// composition events. Full game-loop wiring is Step 9, so this spec proves
// the browser-safe queue semantics the engine will consume: movement,
// command key, NPC text, IME Korean, and — critically — that a repeated key
// arriving during a prompt transition is NOT delivered to the next prompt.
const evidenceDir = fileURLToPath(new URL("../../.omo/evidence/ultima-web/task-8/", import.meta.url))

test("browser input queues safely across prompt transitions", async ({ page }) => {
  mkdirSync(evidenceDir, { recursive: true })
  await page.goto("/ultima/")
  await expect(page.locator("body")).toHaveAttribute("data-bridge-ready", "true")

  const hasQueue = await page.evaluate(
    () => typeof window.ultimaInput?.enqueueKey === "function"
  )
  expect(hasQueue).toBe(true)

  await page.context().tracing.start({ screenshots: true, snapshots: true })

  // Movement + command keys arrive through real DOM keydowns and are only
  // enqueued, never dispatched: the engine loop drains them.
  await page.evaluate(() => window.ultimaInput?.reset())
  await page.keyboard.press("ArrowUp")
  const moved = await page.evaluate(() => window.ultimaInput?.drainKeys().map((e) => e.key))
  expect(moved).toEqual(["[".charCodeAt(0)])
  await page.keyboard.press("a")
  const commanded = await page.evaluate(
    () => window.ultimaInput?.drainKeys().map((e) => e.key)
  )
  expect(commanded).toEqual(["a".charCodeAt(0)])

  // NPC text prompt with a request ID round-trips through the queue.
  const submitted = await page.evaluate(() => {
    window.ultimaInput?.beginPrompt(100)
    return window.ultimaInput?.submitText(100, "hawkwind")
  })
  expect(submitted?.ok).toBe(true)
  const npcText = await page.evaluate(() => window.ultimaInput?.takeText(100))
  expect(npcText).toBe("hawkwind")

  // IME Korean: a keydown mid-composition is swallowed (never a final key);
  // the confirmed composition result is accepted as text afterwards.
  const imeFlow = await page.evaluate(() => {
    const queue = window.ultimaInput
    queue?.beginPrompt(200)
    document.dispatchEvent(new CompositionEvent("compositionstart"))
    const composingDuring = queue?.isComposing()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))
    const pendingDuring = queue?.pendingKeys()
    document.dispatchEvent(new CompositionEvent("compositionend"))
    const submit = queue?.submitText(200, "아바타")
    const taken = queue?.takeText(200)
    return { composingDuring, pendingDuring, submitOk: submit?.ok, taken }
  })
  expect(imeFlow.composingDuring).toBe(true)
  expect(imeFlow.pendingDuring).toBe(0)
  expect(imeFlow.submitOk).toBe(true)
  expect(imeFlow.taken).toBe("아바타")

  // Repeated key during a prompt transition is not delivered onward.
  const transition = await page.evaluate(() => {
    const queue = window.ultimaInput
    queue?.beginPrompt(1)
    queue?.enqueueKey(88)
    queue?.enqueueKey(88)
    queue?.beginPrompt(2)
    return { pending: queue?.pendingKeys(), drained: queue?.drainKeys() }
  })
  expect(transition.pending).toBe(0)
  expect(transition.drained).toEqual([])

  // Stale request ID: rejected as a bridge error with no game mutation.
  const stale = await page.evaluate(() => window.ultimaInput?.submitText(1, "stale-answer"))
  expect(stale?.ok).toBe(false)
  if (stale !== undefined && !stale.ok) {
    expect(stale.error).toBe("stale")
    expect(stale.bridgeError.type).toBe("runtime-error")
    expect(stale.bridgeError.fatal).toBe(false)
  }
  const noMutation = await page.evaluate(() => ({
    pending: window.ultimaInput?.pendingKeys(),
    oldPrompt: window.ultimaInput?.takeText(1),
    newPrompt: window.ultimaInput?.takeText(2)
  }))
  expect(noMutation).toEqual({ pending: 0, oldPrompt: null, newPrompt: null })
  writeFileSync(
    `${evidenceDir}stale-request.log`,
    [
      "Step 8 failure QA: stale request ID submission",
      `submitted requestId=1 while active prompt=2`,
      `rejection: ${JSON.stringify(stale)}`,
      `post-state (no game mutation): ${JSON.stringify(noMutation)}`
    ].join("\n") + "\n"
  )

  await page.context().tracing.stop({ path: `${evidenceDir}input-flow.trace.zip` })
})
