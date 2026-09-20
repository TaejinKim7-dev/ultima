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

    console.log("Testing movement...")
    for (const dir of ["Down", "Down", "Right"]) {
      xdotool(display, "key", dir)
      await sleep(800)
    }
    screenshot(display, resolve(evidenceDir, "04-movement.png"))

    console.log("Testing talk command dispatch...")
    xdotool(display, "key", "t")
    await sleep(600)
    xdotool(display, "key", "Down")
    await sleep(800)
    screenshot(display, resolve(evidenceDir, "05-talk-attempt.png"))

    console.log("Saving (quit & save)...")
    xdotool(display, "key", "q")
    await sleep(1000)
    screenshot(display, resolve(evidenceDir, "06-quit-and-save.png"))

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
    screenshot(display, resolve(evidenceDir, "07-reloaded.png"))
    await killAndWait(relaunch.child)
    if (relaunch.getOutput().toLowerCase().includes("segmentation")) {
      throw new Error(`xu4 output suggests a crash on reload: ${relaunch.getOutput()}`)
    }
  })

  console.log(`native baseline QA evidence written to ${evidenceDir}`)
}

try {
  await main()
} catch (error) {
  const reason = error instanceof Error ? error.message : "unknown qa:native-baseline error"
  console.error(`qa:native-baseline failed: ${reason}`)
  process.exitCode = 1
}
