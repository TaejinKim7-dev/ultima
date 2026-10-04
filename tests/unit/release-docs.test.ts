import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

// Todo 20: `npm run verify:release-docs` checks the release docs (README.md,
// docs/WEB_PORT.md, docs/GITHUB_PAGES.md -- not the append-only handoff.md /
// docs/handoff.md session log, see the last tests) for commands that
// don't exist, missing source pins, dead evidence/repo links, stale
// placeholder text, and deployment claims nobody verified. Every case here
// runs against a throwaway fixture repo root, never the real docs (those
// are Todo 20's own deliverable).

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/verify-release-docs.mjs")

const XU4_REV = "6a7ee3d0079cfdc1c8fb9ba7a3c710a957155a71"
const BORON_REV = "84e7a81f68aa7588419f7b164e94e096a1c3fa07"

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

type FixtureFiles = Record<string, string | null>

// F1: the canonical plan and its byte-identical mirror. Both are tracked, so
// a fresh clone always has them and the verifier hard-requires them.
const PLAN_TEXT = `# Ultima IV web port plan

## Verification strategy

| command | contract |
|---|---|
| \`npm run test:unit\` | every component unit test |
| \`npm run build:site -- --base=/ultima/\` | Pages artifact |
| \`npm run audit:dist\` | artifact audit |
`

// Every tracked artifact `verify:release-docs` hard-requires (F1 decision):
// they exist in a fresh clone because git tracks them.
const TRACKED_ARTIFACTS = [
  ".omo/plans/ultima-web.md",
  "docs/ULTIMA_WEB_PLAN.md",
  "docs/WEB_PORT.md",
  ".github/workflows/pages.yml",
  "docs/TESTING_POLICY.md",
  "docs/AI_AGENT_HANDOFF.md"
] as const

const BASE_FILES: FixtureFiles = {
  "package.json": JSON.stringify({ scripts: { "build:site": "x", "test:unit": "x", "audit:dist": "x" } }),
  "vendor/source-manifest.json": JSON.stringify({
    components: [
      { name: "xu4", revision: XU4_REV },
      { name: "boron", revision: BORON_REV }
    ]
  }),
  "scripts/build-site.mjs": "",
  ".github/workflows/pages.yml": "name: pages\non: [push]\n",
  "docs/TESTING_POLICY.md": "# Testing policy\n\nEvery component has its own unit test.\n",
  "docs/AI_AGENT_HANDOFF.md": "# Handoff format\n\nRecord the verification commands and their exit codes.\n",
  "README.md": "# Ultima\n\nRun `npm ci` then `npm run build:site -- --base=/ultima/`. See [the port notes](docs/WEB_PORT.md).\n",
  "docs/WEB_PORT.md": `# Web port\n\nPins: xu4 \`${XU4_REV}\`, boron \`${BORON_REV}\`. Build script: \`scripts/build-site.mjs\`.\n`,
  "docs/GITHUB_PAGES.md": "# Pages\n\nSet Source to GitHub Actions, then `npm run audit:dist`.\n",
  "handoff.md": "# Handoff\n\n`npm run test:unit` passed.\n",
  "docs/handoff.md": "# Handoff\n\n`npm run test:unit` passed.\n"
}

function fixtureRoot(overrides: FixtureFiles = {}, plan: string = PLAN_TEXT): string {
  const root = mkdtempSync(join(tmpdir(), "verify-release-docs-"))
  createdDirs.push(root)
  const files: FixtureFiles = {
    ...BASE_FILES,
    ".omo/plans/ultima-web.md": plan,
    "docs/ULTIMA_WEB_PLAN.md": plan,
    ...overrides
  }
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

function run(root: string) {
  return spawnSync("node", [scriptPath, `--root=${root}`], { encoding: "utf8" })
}

describe("verify:release-docs", () => {
  it("passes for a complete fixture (commands exist, pins documented, links resolve)", () => {
    const result = run(fixtureRoot())

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("passed")
  })

  it("rejects a missing required release doc", () => {
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": null }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/GITHUB_PAGES.md")
  })

  it("rejects an `npm run` command that package.json does not define", () => {
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": "# Pages\n\nRun `npm run verify:everything` first.\n" }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("verify:everything")
  })

  it("does not treat a glob like `npm run cmake:*` as a concrete script name", () => {
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": "# Pages\n\nAlso run the `npm run cmake:*` commands.\n" }))

    expect(result.status, result.stderr).toBe(0)
  })

  it("failure QA: removing one required source pin from the docs makes the verifier fail", () => {
    const result = run(
      fixtureRoot({ "docs/WEB_PORT.md": `# Web port\n\nPins: xu4 \`${XU4_REV}\`. Build script: \`scripts/build-site.mjs\`.\n` })
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("boron")
    expect(result.stderr).toContain(BORON_REV)
  })

  it("accepts pins documented in docs/SOURCE_PINS.md instead of docs/WEB_PORT.md", () => {
    const result = run(
      fixtureRoot({
        "docs/WEB_PORT.md": "# Web port\n\nSee [pins](SOURCE_PINS.md).\n",
        "docs/SOURCE_PINS.md": `xu4 ${XU4_REV}\nboron ${BORON_REV}\n`
      })
    )

    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects a relative markdown link to a file that does not exist", () => {
    const result = run(fixtureRoot({ "README.md": "# Ultima\n\nSee [guide](docs/USER_GUIDE.md).\n" }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("docs/USER_GUIDE.md")
  })

  it("ignores external links and in-page anchors", () => {
    const result = run(
      fixtureRoot({
        "README.md": "# Ultima\n\n[site](https://taejinkim7-dev.github.io/ultima/) [top](#ultima) [pins](docs/WEB_PORT.md#web-port)\n"
      })
    )

    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects a backticked tracked-repo path that does not exist", () => {
    // `.github/workflows/pages.yml` is tracked and now part of the fixture, so
    // this uses a sibling workflow path: a doc pointing at a tracked repo path
    // that no longer exists must still fail.
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": "# Pages\n\nWorkflow: `.github/workflows/deploy.yml`.\n" }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(".github/workflows/deploy.yml")
  })

  // ---------------------------------------------------------------------------
  // F1 spec change (approved by the user): requirements split in two.
  //   TRACKED artifacts are hard requirements -- they are in git, so a fresh
  //   clone must have them, and a missing/diverged one is a failure.
  //   LOCAL-ONLY evidence (`.omo/evidence/**`, git-ignored) can never be a hard
  //   requirement in a fresh clone, so it is a soft check: an absent path is
  //   SKIPPED with a visible warning naming the path -- never a silent pass,
  //   never a failure.
  // ---------------------------------------------------------------------------

  it("TRACKED: hard-requires every tracked release artifact a fresh clone has", () => {
    for (const path of TRACKED_ARTIFACTS) {
      const result = run(fixtureRoot({ [path]: null }))
      expect(result.status, path).toBe(1)
      expect(result.stderr, path).toContain(path)
    }
  })

  it("TRACKED: docs/ULTIMA_WEB_PLAN.md must stay byte-identical to .omo/plans/ultima-web.md", () => {
    const drifted = run(fixtureRoot({ "docs/ULTIMA_WEB_PLAN.md": `${PLAN_TEXT}\n<!-- one byte of drift -->\n` }))
    expect(drifted.status).toBe(1)
    expect(drifted.stderr).toContain("byte-identical")
    expect(drifted.stderr).toContain(".omo/plans/ultima-web.md")

    const identical = run(fixtureRoot())
    expect(identical.status, identical.stderr).toBe(0)
  })

  it("TRACKED: every `npm run` command the canonical plan lists must exist in package.json", () => {
    const result = run(fixtureRoot({}, PLAN_TEXT.replace("npm run audit:dist", "npm run audit:everything")))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("audit:everything")
  })

  it("LOCAL-ONLY: evidence absent in a fresh clone is skipped with a visible warning naming the path", () => {
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const freshClone = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc }))
    expect(freshClone.status, freshClone.stderr).toBe(0)
    expect(freshClone.stdout).toContain(".omo/evidence/ultima-web/task-19/pages-static-smoke.json")
    expect(freshClone.stdout).toMatch(/skipped/i)
  })

  it("LOCAL-ONLY: a sibling file in the same task dir does NOT make a missing documented file a failure", () => {
    // This is the F1 defect: the old verifier keyed the check on the task
    // directory existing, so any local evidence in task-19 turned a
    // git-ignored, never-committed path into a hard failure.
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-19/other.log": "" }))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("pages-static-smoke.json")
  })

  it("LOCAL-ONLY: integration/ and final/ evidence is skipped the same way", () => {
    const doc =
      "# Pages\n\nSee `.omo/evidence/ultima-web/integration/verify-integration.log` and " +
      "`.omo/evidence/ultima-web/final/F1-plan-compliance.md`.\n"

    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc }))
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain("integration/verify-integration.log")
    expect(result.stdout).toContain("final/F1-plan-compliance.md")
  })

  it("LOCAL-ONLY: evidence present on this machine is reported as present, not as skipped", () => {
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const result = run(
      fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-19/pages-static-smoke.json": "{}" })
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).not.toContain("pages-static-smoke.json")
  })

  it("reports tracked requirements and skipped local evidence as visibly different outcomes", () => {
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc }))
    expect(result.status, result.stderr).toBe(0)
    // "tracked ... satisfied" vs "local-only evidence ... skipped": a reader
    // must be able to tell the two apart without reading the source.
    expect(result.stdout).toMatch(/tracked/i)
    expect(result.stdout).toMatch(/local-only/i)
    expect(result.stdout).toMatch(/skipped/i)
  })

  it("F1 fresh-clone QA: the documented quickstart writing only task-6 build logs still passes", () => {
    // Found by the real fresh-clone QA (.omo/evidence/ultima-web/task-20/fresh-clone.log):
    // the documented build writes .omo/evidence/ultima-web/task-6/*.log, so a local
    // evidence tree exists even though none of the documented evidence does.
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const afterQuickstart = run(
      fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-6/build.log": "build" })
    )
    expect(afterQuickstart.status, afterQuickstart.stderr).toBe(0)
    expect(afterQuickstart.stdout).toContain("pages-static-smoke.json")
  })

  it("rejects stale placeholder text (TODO / TBD / FIXME / placeholder / <fill / lorem)", () => {
    for (const stale of ["TODO: write this", "TBD", "FIXME later", "placeholder section", "<fill in URL>", "Lorem ipsum"]) {
      const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": `# Pages\n\n${stale}\n` }))
      expect(result.status, stale).toBe(1)
      expect(result.stderr, stale).toContain("placeholder")
    }
  })

  it("does not mistake the project's own 'Todo 19' step names for TODO placeholders", () => {
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": "# Pages\n\nTodo 19 finished; Todo 20 is next.\n" }))

    expect(result.status, result.stderr).toBe(0)
  })

  it("allows a line to opt out of the placeholder check with an explicit marker", () => {
    const result = run(
      fixtureRoot({
        "docs/GITHUB_PAGES.md": "# Pages\n\nTodo 5's save export was a placeholder JSON stub. <!-- release-docs:allow-placeholder -->\n"
      })
    )

    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects a deployment claim with no verified-deployment marker", () => {
    for (const claim of ["The site is deployed at https://taejinkim7-dev.github.io/ultima/.", "GitHub Pages 배포 완료."]) {
      const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": `# Pages\n\n${claim}\n` }))
      expect(result.status, claim).toBe(1)
      expect(result.stderr, claim).toContain("deployment")
    }
  })

  it("accepts a deployment claim backed by a 'Verified deployment:' line naming the URL and Actions run", () => {
    const result = run(
      fixtureRoot({
        "docs/GITHUB_PAGES.md":
          "# Pages\n\nThe site is deployed at https://taejinkim7-dev.github.io/ultima/.\n\n" +
          "Verified deployment: https://taejinkim7-dev.github.io/ultima/ (Actions run 36314599335)\n"
      })
    )

    expect(result.status, result.stderr).toBe(0)
  })

  it("reports every problem at once, not just the first", () => {
    const result = run(fixtureRoot({ "README.md": "# Ultima\n\n`npm run nope` and [x](missing.md) TODO\n" }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("nope")
    expect(result.stderr).toContain("missing.md")
    expect(result.stderr).toContain("placeholder")
  })
  it("does not scan handoff.md: it is an append-only historical log whose old paths/placeholders are history, not release docs", () => {
    const result = run(
      fixtureRoot({ "handoff.md": "# Handoff\n\nOld run: `npm run verify:gone`, `scripts/removed.mjs`, TODO from 2026-09-24.\n" })
    )

    expect(result.status, result.stderr).toBe(0)
  })
  it("does not scan docs/handoff.md either: it is the append-only session log moved under docs/", () => {
    const result = run(
      fixtureRoot({ "docs/handoff.md": "# Handoff\n\nOld run: `npm run verify:gone`, `scripts/removed.mjs`, TODO from 2026-09-24.\n" })
    )

    expect(result.status, result.stderr).toBe(0)
  })
})
