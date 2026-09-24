import { createHash } from "node:crypto"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync, statSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const xu4Bin = resolve(repoRoot, "build/host/xu4-src/src/xu4")
const modulesDir = resolve(repoRoot, "build/host/modules")
const runDir = resolve(repoRoot, "build/native-run")
const evidenceDir = resolve(repoRoot, ".omo/evidence/ultima-web/task-3/native-baseline")
const profile = "qabaseline"
// Root cause of the earlier movement-based approach's flakiness: overworld/
// town tiles apply a random "Slow progress!" chance per step
// (vendor/xu4/src/location.cpp's slowedByTile()), so a fixed key sequence
// does not reliably land on a specific coordinate. We use xu4's own debug
// cheat menu instead (vendor/xu4/src/game.cpp's `case 3: /* ctrl-C */`,
// gated by `settings.debug`) to reach Moonglow deterministically:
// Ctrl-C -> 'g' (Goto, vendor/xu4/src/cheat.cpp) teleports directly onto a
// named portal's coordinates with no RNG involved.
const debugSettingsContents = "debug=1\n"
const gotoDestination = "moonglow"
// After entering the town, the NPC (a mage, "Calabrini") is a short walk
// east along the entrance corridor. In-town movement is RNG-slowed by
// slowedByTile() (vendor/xu4/src/location.cpp:117-133), so a fixed
// "walk N steps then talk once" sequence is not reproducible run-to-run:
// the simplified version failed with "Funny, no response!" on its real run.
// Instead this replicates the scratchpad probe procedure that genuinely
// succeeded once: after EVERY single "Right" step, attempt `t`+direction in
// all 4 directions. Each talk attempt consumes a game turn exactly like the
// probe, so the timing/RNG profile matches the one observed success.
const npcApproachSteps = 6
const npcTalkDirs = ["Right", "Up", "Down", "Left"]
// Guard against "Your Interest:" buffer pollution (plan.md 3.3): any talk
// attempt made AFTER a dialogue already opened types its `t` into the open
// discourse string prompt instead of starting a new talk (observed as
// "Your Interest: tttttt"). Discourse keyword matching compares the FIRST
// 4 input chars (vendor/xu4/src/discourse_tlk.cpp inputEq/strncasecmp),
// so a polluted buffer breaks even a correctly typed keyword. The interest
// prompt reads at most 16 chars (discourse_tlk.cpp:91 gameGetInput(16)),
// therefore 16 Backspaces always empty the buffer; on an already-empty
// buffer Backspace only plays the blocked-input sound
// (vendor/xu4/src/event.cpp ReadStringController::keyPressed), and at the
// top-level command prompt an unbound Backspace key is ignored
// (defaultKeyHandler returns false; game.cpp:1386 `valid && endTurn` gate
// means no turn is consumed). So the Backspace burst itself is safe in both
// states (dialogue open or not) and needs no screen feedback the script
// cannot observe. The KEYWORD typing after it is safe ONLY if a dialogue is
// actually open: with no dialogue, typed letters become top-level commands
// -- `h` burns food via holeUpAndCamp, `n` mutates party order via newOrder,
// `m` opens mixReagents (a nested prompt that desyncs every later key),
// `a` attacks, `t` opens a direction wait. A run whose screenshots show no
// `You meet ...` greeting must therefore be DISCARDED (its save ignored),
// never treated as keyword evidence.
const interestClearBackspaces = 16
const npcKeywords = ["name", "health"]

const ultima4Data = process.env.ULTIMA4_DATA
// The specific verified PC-version zip this project develops against (see
// handoff.md's "원본 데이터 검증 기록"). Overridable so a different verified
// release can be pinned without editing this script.
const expectedSha256 = process.env.ULTIMA4_DATA_SHA256 ??
  "94aa748cfa1d0e7aa2e518abebb994f3c18acf7edb78c3bd37cd0a4404e6ba74"
const badZipLog = resolve(repoRoot, ".omo/evidence/ultima-web/task-3/bad-zip.log")

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function xdotool(display, ...args) {
  const result = spawnSync("xdotool", args, { env: { ...process.env, DISPLAY: display } })
  if (result.status !== 0) {
    throw new Error(`xdotool ${args.join(" ")} failed: ${result.stderr}`)
  }
}

function screenshot(display, path) {
  const result = spawnSync("import", ["-window", "root", path], {
    env: { ...process.env, DISPLAY: display }
  })
  if (result.status !== 0) {
    throw new Error(`screenshot capture failed for ${path}: ${result.stderr}`)
  }
}

async function withXvfb(fn) {
  const display = `:${90 + (process.pid % 300)}`
  const xvfb = spawn("Xvfb", [display, "-screen", "0", "1024x768x24"], { stdio: "ignore" })
  try {
    // Poll until the display actually accepts connections instead of a
    // fixed sleep -- Xvfb's startup time is not guaranteed.
    const deadline = Date.now() + 10_000
    for (;;) {
      const probe = spawnSync("xdotool", ["getdisplaygeometry"], {
        env: { ...process.env, DISPLAY: display }
      })
      if (probe.status === 0) break
      if (Date.now() > deadline) throw new Error(`Xvfb on ${display} never became ready`)
      await sleep(200)
    }
    return await fn(display)
  } finally {
    xvfb.kill("SIGKILL")
  }
}

function runXu4(display, extraArgs) {
  const child = spawn(xu4Bin, extraArgs, {
    cwd: runDir,
    env: { ...process.env, DISPLAY: display },
    stdio: ["ignore", "pipe", "pipe"]
  })
  let output = ""
  child.stdout.on("data", (d) => { output += d })
  child.stderr.on("data", (d) => { output += d })
  return { child, getOutput: () => output }
}

function killAndWait(child) {
  return new Promise((resolveKill) => {
    child.once("exit", () => resolveKill())
    child.kill("SIGKILL")
  })
}

async function verifyMissingDataIsRejected(display) {
  // Negative case: no ultima4.zip present at all. xu4 must refuse to start
  // (exit nonzero, no window, no game state) rather than hang or crash.
  const emptyDir = resolve(repoRoot, "build/native-run-empty")
  rmSync(emptyDir, { recursive: true, force: true })
  mkdirSync(emptyDir, { recursive: true })

  const result = spawnSync(xu4Bin, ["-q"], {
    cwd: emptyDir,
    env: { ...process.env, DISPLAY: display },
    encoding: "utf8"
  })
  rmSync(emptyDir, { recursive: true, force: true })

  if (result.status === 0) {
    throw new Error("negative case failed: xu4 exited 0 with no original data present")
  }
  if (!result.stdout.includes("requires the PC version of Ultima IV") &&
      !result.stderr.includes("requires the PC version of Ultima IV")) {
    throw new Error(`negative case failed: unexpected output: ${result.stdout}${result.stderr}`)
  }
  console.log(`Negative case OK: missing data rejected (exit ${result.status})`)
}

async function main() {
  if (!ultima4Data) {
    throw new Error("ULTIMA4_DATA is required: set it to an absolute path to a verified original ultima4.zip")
  }
  if (!existsSync(ultima4Data)) {
    throw new Error(`ULTIMA4_DATA file does not exist: ${ultima4Data}`)
  }

  // Failure scenario from the plan: a wrong (but structurally valid) zip
  // must block startup before xu4 is ever launched, i.e. before any game
  // state could be mutated -- not merely fail once xu4 itself rejects it.
  const actualSha256 = sha256(ultima4Data)
  if (actualSha256 !== expectedSha256) {
    mkdirSync(dirname(badZipLog), { recursive: true })
    const message =
      `ULTIMA4_DATA sha256 mismatch: expected ${expectedSha256}, got ${actualSha256} (${ultima4Data})`
    writeFileSync(badZipLog, message + "\n")
    throw new Error(message)
  }

  if (!existsSync(xu4Bin)) {
    throw new Error(`${xu4Bin} not found -- run "npm run build:native" first`)
  }
  for (const mod of ["render.pak", "Ultima-IV.mod", "U4-Upgrade.mod"]) {
    if (!existsSync(resolve(modulesDir, mod))) {
      throw new Error(`${mod} not found under ${modulesDir} -- run "npm run build:modules" first`)
    }
  }

  console.log(`ULTIMA4_DATA sha256: ${sha256(ultima4Data)}`)

  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(runDir, { recursive: true })
  for (const mod of ["render.pak", "Ultima-IV.mod", "U4-Upgrade.mod"]) {
    cpSync(resolve(modulesDir, mod), resolve(runDir, mod))
  }
  symlinkSync(ultima4Data, resolve(runDir, "ultima4.zip"))

  rmSync(evidenceDir, { recursive: true, force: true })
  mkdirSync(evidenceDir, { recursive: true })

  await withXvfb(async (display) => {
    await verifyMissingDataIsRejected(display)

    // Fresh profile dir under build/native-run/profiles/qabaseline/, so
    // saves never touch the real user's $HOME.
    rmSync(resolve(runDir, "profiles"), { recursive: true, force: true })

    // Enable the debug cheat menu for this profile. Per
    // vendor/xu4/src/settings.cpp's Settings::init(), passing "-p <profile>"
    // makes the settings file "./profiles/<profile>/xu4rc" (relative to cwd,
    // which is runDir below) -- note the filename is "xu4rc" on Linux, NOT
    // "xu4.cfg" (that name is Windows/Cygwin-only per the
    // SETTINGS_BASE_FILENAME macro). Writing the wrong filename/path here
    // silently leaves debug mode off with no error.
    const profileDir = resolve(runDir, "profiles", profile)
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(resolve(profileDir, "xu4rc"), debugSettingsContents)

    console.log("Launching xu4 (new game)...")
    const { child, getOutput } = runXu4(display, ["-i", "-q", "-p", profile])
    await sleep(4000)
    screenshot(display, resolve(evidenceDir, "01-title-menu.png"))

    xdotool(display, "key", "i")
    await sleep(1500)
    xdotool(display, "type", "QABASELINE")
    await sleep(300)
    xdotool(display, "key", "Return")
    await sleep(1500)
    xdotool(display, "key", "m")
    await sleep(1500)
    screenshot(display, resolve(evidenceDir, "02-name-sex-done.png"))

    // Narration and the virtue quiz both advance on 'a': waitAnyKey()
    // accepts any key, and readChoice("ab") accepts 'a' as a valid (if
    // arbitrary) answer. vendor/xu4/src/intro.cpp's finishInitiateGame()
    // writes party.sav *immediately* after the quiz resolves (well before
    // the game world is ever shown), so we poll for that file instead of
    // hardcoding a press count -- the exact count derived by reading
    // showStory() (24 screens) + startQuestions() (8 * 2) + 2 segue
    // screens = 42 turned out to still be short in practice (animateTree()
    // calls inside showStory() apparently eat more real time than a fixed
    // 1s/press budget accounts for), and sending 'a' past the real end is
    // unsafe once in the game world ('a' is bound to attack() there).
    const partySavePath = resolve(runDir, "profiles", profile, "party.sav")
    const NEW_GAME_MAX_PRESSES = 90
    let newGameDone = false
    for (let i = 0; i < NEW_GAME_MAX_PRESSES; i++) {
      if (existsSync(partySavePath)) {
        newGameDone = true
        break
      }
      xdotool(display, "key", "a")
      await sleep(900)
    }
    if (!newGameDone) {
      throw new Error(
        `character creation did not finish within ${NEW_GAME_MAX_PRESSES} 'a' presses ` +
        `(${partySavePath} never appeared)`
      )
    }
    // One more short wait: finishInitiateGame() shows two more segue
    // screens (each needs one more "any key") after party.sav is written,
    // before xu4.stage actually becomes StagePlay.
    xdotool(display, "key", "a")
    await sleep(1000)
    xdotool(display, "key", "a")
    await sleep(1500)
    screenshot(display, resolve(evidenceDir, "03-world-entered.png"))

    console.log("Teleporting to Moonglow via the debug cheat menu (Ctrl-C -> Goto)...")
    xdotool(display, "key", "ctrl+c")
    await sleep(1000)
    xdotool(display, "key", "g")
    await sleep(1000)
    xdotool(display, "type", "--delay", "100", gotoDestination)
    await sleep(500)
    xdotool(display, "key", "Return")
    await sleep(1500)
    screenshot(display, resolve(evidenceDir, "04-goto-moonglow.png"))

    console.log("Entering Moonglow for NPC dialogue...")
    xdotool(display, "key", "e")
    await sleep(2000)
    screenshot(display, resolve(evidenceDir, "05-moonglow-entered.png"))
    // Plan.md 3.3 enter-guard, best available without OCR: screenMessage()
    // output (e.g. "Enter towne! Moonglow" vs "Enter what?") is drawn to the
    // screen only, never to stdout, so the script cannot fail fast here
    // programmatically. A human MUST confirm "Enter towne!" in
    // 05-moonglow-entered.png before trusting any later screenshot; if the
    // town was not entered, every later input is misinterpreted as a
    // top-level command and the run's evidence is invalid.
    console.log("CHECKPOINT: verify 'Enter towne! Moonglow' in 05-moonglow-entered.png")

    console.log("Approaching NPC: one step east + talk in all 4 directions, per step...")
    for (let i = 0; i < npcApproachSteps; i++) {
      xdotool(display, "key", "Right")
      await sleep(900)
      for (const talkDir of npcTalkDirs) {
        xdotool(display, "key", "t")
        await sleep(400)
        xdotool(display, "key", talkDir)
        await sleep(900)
      }
      screenshot(display, resolve(evidenceDir, `06-approach-step-${i + 1}.png`))
    }
    screenshot(display, resolve(evidenceDir, "07-approach-done.png"))
    // Plan.md 3.3 dialogue-open guard, best available without OCR: the
    // script cannot detect whether any sweep attempt printed
    // `You meet ...`. A human MUST confirm the greeting in
    // 06-approach-step-N.png / 07-approach-done.png before trusting the
    // keyword screenshots below; with no greeting, the typed keywords below
    // become top-level commands (see interestClearBackspaces comment) and
    // this run's evidence AND save must be discarded.
    console.log("CHECKPOINT: verify 'You meet ...' in 06-approach-step-N/07-approach-done.png")

    // Clear any stray `t` characters typed into an already-open
    // "Your Interest:" prompt by the sweep above, then submit the keyword.
    async function clearInterestAndType(word) {
      for (let i = 0; i < interestClearBackspaces; i++) {
        xdotool(display, "key", "BackSpace")
        await sleep(60)
      }
      xdotool(display, "type", "--delay", "150", word)
      xdotool(display, "key", "Return")
      await sleep(2000)
    }

    await clearInterestAndType(npcKeywords[0])
    screenshot(display, resolve(evidenceDir, "08-npc-name.png"))

    await clearInterestAndType(npcKeywords[1])
    screenshot(display, resolve(evidenceDir, "09-npc-health.png"))

    await clearInterestAndType("bye")
    screenshot(display, resolve(evidenceDir, "10-npc-bye.png"))

    // Walking back to the exact entrance tile to cross the map edge is just
    // as RNG-fragile as the original approach movement, so exit the same
    // deterministic way we entered: the cheat menu's 'x' (Exit Map, see
    // vendor/xu4/src/cheat.cpp's `case 'x'`) returns to the parent (world)
    // map from any position, which is also required before 'q' can save
    // (CTX_CAN_SAVE_GAME excludes CTX_CITY -- see vendor/xu4/src/location.h).
    console.log("Exiting back to the world map via the debug cheat menu...")
    xdotool(display, "key", "ctrl+c")
    await sleep(1000)
    xdotool(display, "key", "x")
    await sleep(1500)
    screenshot(display, resolve(evidenceDir, "11-returned-to-world.png"))

    console.log("Saving (quit & save)...")
    xdotool(display, "key", "q")
    await sleep(1000)
    screenshot(display, resolve(evidenceDir, "12-quit-and-save.png"))

    const savePartyPath = resolve(runDir, "profiles", profile, "party.sav")
    if (!existsSync(savePartyPath) || statSync(savePartyPath).size === 0) {
      throw new Error(`save did not produce a non-empty ${savePartyPath}`)
    }
    console.log(`Save verified: ${savePartyPath} (${statSync(savePartyPath).size} bytes)`)

    await killAndWait(child)
    if (getOutput().toLowerCase().includes("segmentation")) {
      throw new Error(`xu4 output suggests a crash: ${getOutput()}`)
    }

    console.log("Relaunching to verify restart/load...")
    // -i ("skip intro") also auto-loads the last save when one exists for
    // this profile (see xu4's --help text), so no menu navigation is
    // needed here -- pressing 'j' ("Journey Onward") at this point would
    // land on the in-game 'j' binding (Jimmy/lockpick) instead, since the
    // save is already loaded by the time we could send it.
    const relaunch = runXu4(display, ["-i", "-q", "-p", profile])
    await sleep(3500)
    screenshot(display, resolve(evidenceDir, "13-reloaded.png"))
    await killAndWait(relaunch.child)
    if (relaunch.getOutput().toLowerCase().includes("segmentation")) {
      throw new Error(`xu4 output suggests a crash on reload: ${relaunch.getOutput()}`)
    }
  })

  console.log(`native baseline QA evidence written to ${evidenceDir}`)
}

if (process.argv[2] === "--print-npc-dialogue-plan") {
  console.log(
    `goto=${gotoDestination}; enter=e; approachSteps=${npcApproachSteps}; ` +
    `talkPerStep=${npcTalkDirs.join(",")}; clearInterest=backspace*${interestClearBackspaces}; ` +
    `keywords=${npcKeywords.join(",")}; exit=bye; exitMap=x`
  )
} else {
  try {
    await main()
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown qa:native-baseline error"
    console.error(`qa:native-baseline failed: ${reason}`)
    process.exitCode = 1
  }
}
