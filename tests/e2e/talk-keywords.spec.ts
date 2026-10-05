import { expect, test, type Page } from "./fixtures.ts"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveNpcTopics } from "../../src/i18n/localization.ts"

// Todo 48: the usable talk keywords as clickable chips, driven against the
// REAL running engine with the user's real ultima4.zip (same route helpers
// as korean-npc-alias / korean-castle-output -- the per-spec-file helper
// convention). A chip click must behave exactly like typing the chip label
// into #korean-keyword-input and pressing Enter: same gate, same rejection
// message when no native prompt is open, and it must never take focus.
//
// Moonglow case: after the approach sweep the menu shows the NPC's two
// topic glosses (keyword as secondary), clicking 직업 / a topic chip / 안녕
// drives the same responses a typed keyword does, and the talk line reads
// "대화: <direction>" with no leftover "방향?".
//
// Castle case: on Lord British's first meeting, during the "A new age"
// waitAnyKey pause there is no native prompt open, so a chip click is
// rejected with the existing message and synthesizes zero keystrokes; after
// Enter the LB chips are present and clicking 진실 prints lordBritishText:3.

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const evidenceDir = join(repoRoot, ".omo/evidence/ultima-web/task-48")

const tlk = (
  JSON.parse(readFileSync(join(repoRoot, "locales/ko/tlk.json"), "utf8")) as {
    entries: Record<string, { translation: string }>
  }
).entries

function squash(text: string): string {
  return text.replace(/\s+/g, "")
}

function occurrences(haystack: string, needle: string): number {
  return needle === "" ? 0 : haystack.split(needle).length - 1
}

async function panelText(page: Page): Promise<string> {
  return squash(await page.locator("#dialogue-history").innerText())
}

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

async function typeAscii(page: Page, text: string, perCharDelayMs = 150): Promise<void> {
  for (const ch of text) {
    await page.keyboard.press(ch)
    await page.waitForTimeout(perCharDelayMs)
  }
}

async function createCharacterAndWaitForSave(page: Page): Promise<boolean> {
  await page.waitForTimeout(2500)
  await pressKey(page, "Enter") // INTRO_TITLES -> INTRO_MAP
  await pressKey(page, "Enter") // INTRO_MAP -> INTRO_MENU
  await pressKey(page, "i") // name prompt
  await typeAscii(page, "Avatar")
  await pressKey(page, "Enter")
  await pressKey(page, "m") // sex prompt
  for (let i = 0; i < 26; i++) {
    await pressKey(page, "Enter", 700)
    if ((await page.locator("#save-status").innerText()).includes("완료")) return true
  }
  for (let i = 0; i < 20; i++) {
    await pressKey(page, "Enter", 2600)
    await pressKey(page, "a", 1500)
    if ((await page.locator("#save-status").innerText()).includes("완료")) return true
  }
  return false
}

/** Real Configure menu -> Debug Mode (see korean-npc-alias.spec.ts's enableDebugMode doc comment). */
async function enableDebugMode(page: Page): Promise<void> {
  await pressKey(page, "c", 2000)
  await pressKey(page, "g", 2000)
  await pressKey(page, "d", 2000)
  await pressKey(page, "u", 2000)
  await pressKey(page, "m", 2500)
}

async function cheat(page: Page, key: string): Promise<void> {
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await page.waitForTimeout(800)
  await pressKey(page, key, 800)
}

/** Teleports to Moonglow and walks in with the exact NPC-approach sweep korean-npc-alias.spec.ts proved reliable. */
async function gotoMoonglowAndApproachNpc(page: Page): Promise<void> {
  await cheat(page, "g")
  await typeAscii(page, "moonglow", 100)
  await pressKey(page, "Enter", 1500)
  await pressKey(page, "e", 2000) // Enter towne! Moonglow

  const npcTalkDirs = ["ArrowRight", "ArrowUp", "ArrowDown", "ArrowLeft"]
  for (let i = 0; i < 6; i++) {
    await pressKey(page, "ArrowRight", 900)
    for (const talkDir of npcTalkDirs) {
      await pressKey(page, "t", 400)
      await pressKey(page, talkDir, 900)
    }
  }
}

async function submitKorean(page: Page, word: string): Promise<void> {
  const input = page.locator("#korean-keyword-input")
  await input.click()
  await input.fill(word)
  await input.press("Enter")
  await page.waitForTimeout(2000)
  await input.blur()
}

/** Clicks a chip by its label; the click must never take focus. */
async function clickChip(page: Page, label: string): Promise<void> {
  const chip = page.locator(`#talk-keywords button.talk-keyword-chip[data-label="${label}"]`)
  await chip.click()
  await page.waitForTimeout(2000)
}

test.describe("Todo 48: talk keywords as clickable chips", () => {
  test.beforeAll(() => {
    mkdirSync(evidenceDir, { recursive: true })
  })

  test("Moonglow NPC: chips show the topic glosses, a chip click submits like a typed keyword, 안녕 hides them, and the direction line has no 방향?", async ({
    page
  }) => {
    test.setTimeout(600_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await bootAndSelectZip(page, buffer)
    expect(await createCharacterAndWaitForSave(page), 'engine never reported "저장 완료"').toBe(true)

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 2500)

    await gotoMoonglowAndApproachNpc(page)
    for (let i = 0; i < 16; i++) {
      await pressKey(page, "Backspace", 60) // clear the interest-prompt buffer the sweep left behind
    }

    // The sweep reached some Moonglow NPC: the menu is visible and names it.
    await expect(page.locator("#talk-keywords")).toBeVisible({ timeout: 10_000 })
    const npcKey = await page.locator("#talk-keywords").getAttribute("data-npc")
    expect(npcKey, "#talk-keywords must carry data-npc for an NPC conversation").toBeTruthy()
    const topics = resolveNpcTopics(npcKey!)
    expect(topics.length).toBeGreaterThan(0)

    // The two topic chips show the gloss with the raw keyword as secondary.
    for (const topic of topics) {
      const chip = page.locator(`#talk-keywords button.talk-keyword-chip[data-keyword="${topic.keyword}"]`)
      await expect(chip).toBeVisible()
      await expect(chip.locator(".talk-keyword-label")).toHaveText(topic.gloss)
      await expect(chip.locator(".talk-keyword-secondary")).toHaveText(topic.keyword)
      // Todo 50 acceptance #3: the secondary label has its own declaration
      // (src/shell.css .talk-keyword-secondary), and only these topic chips render it.
      expect(
        await chip
          .locator(".talk-keyword-secondary")
          .evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0]!.trim().replace(/^"|"$/g, "")),
        ".talk-keyword-secondary must compute font-family to NeoDunggeunmo"
      ).toBe("NeoDunggeunmo")
    }
    await expect(page.locator('#talk-keywords button.talk-keyword-chip[data-label="직업"]')).toBeVisible()
    await expect(page.locator('#talk-keywords button.talk-keyword-chip[data-label="안녕"]')).toBeVisible()

    // Clicking 직업 submits exactly like typing it and pressing Enter.
    const jobHead = squash(tlk[`${npcKey}:job`]?.translation ?? "").slice(0, 12)
    expect(jobHead).not.toBe("")
    await clickChip(page, "직업")
    const afterJob = await panelText(page)
    expect(afterJob, "clicking the 직업 chip did not print the NPC's Korean job line").toContain(jobHead)

    // Unblock any ask-pause the job answer triggered, and answer the question.
    await pressKey(page, "Backspace", 1200)
    const answerChip = page.locator('#talk-keywords button.talk-keyword-chip[data-label="예"]')
    if (await answerChip.isVisible().catch(() => false)) {
      await answerChip.click()
      await page.waitForTimeout(2000)
    }

    // Clicking the topic chip prints response1; typing its gloss does too.
    const topic = topics[0]!
    const responseHead = squash(tlk[`${npcKey}:response1`]?.translation ?? "").slice(0, 12)
    expect(responseHead).not.toBe("")
    const beforeTopic = occurrences(await panelText(page), responseHead)
    await clickChip(page, topic.gloss)
    const afterChip = occurrences(await panelText(page), responseHead)
    expect(afterChip, `clicking the ${topic.gloss} chip did not print response1`).toBe(beforeTopic + 1)
    await submitKorean(page, topic.gloss)
    const afterTyped = occurrences(await panelText(page), responseHead)
    expect(afterTyped, `typing the gloss ${topic.gloss} did not print response1`).toBe(afterChip + 1)

    // The talk direction lines read "대화: <direction>", never "대화: 방향?<direction>".
    const historyLines = (await page.locator("#dialogue-history").innerText()).split("\n")
    const directionLines = historyLines.filter((line) => /^대화: [가-힣]+$/.test(line.trim()))
    expect(directionLines.length, "the sweep should have produced some 대화: <direction> lines").toBeGreaterThan(0)
    expect(
      historyLines.some((line) => line.includes("방향?")),
      'a committed line still contains the leftover "방향?" prompt'
    ).toBe(false)

    // The input column stays inside the game's height while the menu is up.
    const inputBox = await page.locator("#korean-keyword-input").boundingBox()
    const gameBox = await page.locator("#game-canvas").boundingBox()
    expect(inputBox).not.toBeNull()
    expect(gameBox).not.toBeNull()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(gameBox!.y + gameBox!.height + 1)

    // 안녕 (bye) ends the conversation: the menu hides after the end signal,
    // and an arrow key moves the avatar again.
    await clickChip(page, "안녕")
    await page.waitForTimeout(1500)
    await expect(page.locator("#talk-keywords")).toBeHidden()
    const beforeMove = await page.locator("#game-canvas").screenshot()
    writeFileSync(join(evidenceDir, "talk-keywords-before-move.png"), beforeMove)
    await pressKey(page, "ArrowLeft", 900)
    const afterMove = await page.locator("#game-canvas").screenshot()
    expect(afterMove.equals(beforeMove), "the avatar did not move after the chip-driven bye").toBe(false)
    await page.screenshot({ path: join(evidenceDir, "talk-keywords.png") })
  })

  test("Lord British: chips are rejected while no prompt is open, then appear and answer 진실 after Enter", async ({ page }) => {
    test.setTimeout(900_000)
    const zipPath = process.env["ULTIMA4_DATA"]
    test.skip(!zipPath || !existsSync(zipPath), "ULTIMA4_DATA not set to a verified original ultima4.zip")
    const buffer = readFileSync(zipPath!)

    await bootAndSelectZip(page, buffer)
    expect(await createCharacterAndWaitForSave(page), 'engine never reported "저장 완료"').toBe(true)

    await bootAndSelectZip(page, buffer)
    await page.waitForTimeout(2500)
    await pressKey(page, "Enter")
    await pressKey(page, "Enter")
    await enableDebugMode(page)
    await pressKey(page, "j", 2500)

    await cheat(page, "g")
    await typeAscii(page, "britannia", 100)
    await pressKey(page, "Enter", 1500)
    await pressKey(page, "e", 2500) // Enter the castle
    await cheat(page, "c") // collision off

    // Floor 2 stairs -> Lord British at (19,7).
    await cheat(page, "g")
    await typeAscii(page, "britannia", 100)
    await pressKey(page, "Enter", 1500)
    await pressKey(page, "k", 2500)
    for (let i = 0; i < 15; i++) await pressKey(page, "ArrowRight", 350)
    for (let i = 0; i < 4; i++) await pressKey(page, "ArrowDown", 350)
    await pressKey(page, "t", 500)
    await pressKey(page, "ArrowRight", 2500)

    // First meeting: "At long last" (:17) then "A new age" (:18), which
    // blocks on a waitAnyKey with NO prompt open.
    const newAge = squash("\n\n로드 브리티시가 앉으며 말한다: 브리타니아에 새 시대가 열렸다. 위대한 악의 군주들은 사라졌으나 백성에게는 방향과 삶의 목적이 없구나...\n").slice(0, 14)
    await expect
      .poll(async () => (await panelText(page)).includes(newAge), { timeout: 30_000 })
      .toBe(true)
    await page.waitForTimeout(500) // let the greeting settle at the pause

    // A chip click during this pause must be rejected with the existing
    // message, synthesize zero keystrokes, and not advance the greeting.
    const championHead = squash("덕의 챔피언이 필요하다").slice(0, 10)
    await page.evaluate(() => {
      const w = window as unknown as { __ultimaSyntheticKeydowns: number }
      w.__ultimaSyntheticKeydowns = 0
      window.addEventListener("keydown", (event) => {
        if ((event as unknown as { __ultimaSynthetic?: boolean }).__ultimaSynthetic === true) {
          w.__ultimaSyntheticKeydowns += 1
        }
      })
    })
    await clickChip(page, "진실")
    const syntheticKeydowns = await page.evaluate(
      () => (window as unknown as { __ultimaSyntheticKeydowns: number }).__ultimaSyntheticKeydowns
    )
    const noPromptPanel = await panelText(page)
    writeFileSync(
      join(evidenceDir, "no-prompt.log"),
      [
        `synthetic keydowns during the waitAnyKey pause: ${syntheticKeydowns}`,
        `rejection message present: ${noPromptPanel.includes("지금은열린입력요청이없습니다")}`,
        `:19 champion line present after the click: ${noPromptPanel.includes(championHead)}`
      ].join("\n") + "\n"
    )
    expect(syntheticKeydowns, "a rejected chip click must synthesize zero keystrokes").toBe(0)
    expect(
      noPromptPanel,
      "a chip click with no native prompt open must show the existing rejection message"
    ).toContain("지금은열린입력요청이없습니다")
    expect(noPromptPanel, "the rejected click must not advance the greeting to the champion line").not.toContain(
      championHead
    )

    // Enter passes the waitAnyKey; the interest prompt opens and the LB
    // chips appear.
    await pressKey(page, "Enter", 2500)
    await expect(page.locator("#talk-keywords")).toBeVisible({ timeout: 15_000 })
    expect(await page.locator("#talk-keywords").getAttribute("data-speaker")).toBe("lordBritish")
    await expect(page.locator('#talk-keywords button.talk-keyword-chip[data-label="진실"]')).toBeVisible()
    await expect(page.locator('#talk-keywords button.talk-keyword-chip[data-label="정직"]')).toBeVisible()

    // Clicking 진실 prints the lordBritishText:3 reply.
    const truthHead = squash("그가 말한다: 많은 진실을 라이시움에서 배울 수 있다").slice(0, 14)
    const before = occurrences(await panelText(page), truthHead)
    await clickChip(page, "진실")
    const after = occurrences(await panelText(page), truthHead)
    expect(after, "clicking the 진실 chip did not print lordBritishText:3").toBe(before + 1)
    await page.screenshot({ path: join(evidenceDir, "lb-chips.png") })

    // The long LB list still fits inside the game's height (no page growth).
    const inputBox = await page.locator("#korean-keyword-input").boundingBox()
    const gameBox = await page.locator("#game-canvas").boundingBox()
    expect(inputBox).not.toBeNull()
    expect(gameBox).not.toBeNull()
    expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(gameBox!.y + gameBox!.height + 1)

    // Todo 50 acceptance #3 (computed font-family of every Korean surface):
    // the chip and its smaller secondary label are two separate declarations
    // (src/shell.css:321 inherit vs :337 NeoDunggeunmo first) so each gets
    // its own one-line assertion.
    expect(
      await page.evaluate(() => {
        const el = document.querySelector("#talk-keywords button.talk-keyword-chip") as HTMLElement | null
        return el === null
          ? null
          : getComputedStyle(el).fontFamily.split(",")[0]!.trim().replace(/^"|"$/g, "")
      }),
      ".talk-keyword-chip must compute font-family to NeoDunggeunmo (chip inherits body)"
    ).toBe("NeoDunggeunmo")
    // .talk-keyword-secondary is rendered ONLY for chips that have a secondary
    // label (shell.ts:756-761: `if (chip.secondary !== undefined)`). LB's
    // keyword set has none of those, so the selector resolves to null here --
    // skip the assertion in that case (the Moonglow case covers the same
    // selector, so it isn't unobserved).
    const secondaryFamily = await page.evaluate(() => {
      const el = document.querySelector("#talk-keywords .talk-keyword-secondary") as HTMLElement | null
      return el === null ? null : getComputedStyle(el).fontFamily.split(",")[0]!.trim().replace(/^"|"$/g, "")
    })
    if (secondaryFamily !== null) {
      expect(secondaryFamily, ".talk-keyword-secondary must compute font-family to NeoDunggeunmo").toBe("NeoDunggeunmo")
    }
  })
})