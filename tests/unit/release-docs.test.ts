import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

// Todo 20: `npm run verify:release-docs` checks the release docs (README.md,
// docs/WEB_PORT.md, docs/GITHUB_PAGES.md -- not the append-only handoff.md
// session log, see the last test) for commands that
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

const BASE_FILES: FixtureFiles = {
  "package.json": JSON.stringify({ scripts: { "build:site": "x", "test:unit": "x", "audit:dist": "x" } }),
  "vendor/source-manifest.json": JSON.stringify({
    components: [
      { name: "xu4", revision: XU4_REV },
      { name: "boron", revision: BORON_REV }
    ]
  }),
  "scripts/build-site.mjs": "",
  "README.md": "# Ultima\n\nRun `npm ci` then `npm run build:site -- --base=/ultima/`. See [the port notes](docs/WEB_PORT.md).\n",
  "docs/WEB_PORT.md": `# Web port\n\nPins: xu4 \`${XU4_REV}\`, boron \`${BORON_REV}\`. Build script: \`scripts/build-site.mjs\`.\n`,
  "docs/GITHUB_PAGES.md": "# Pages\n\nSet Source to GitHub Actions, then `npm run audit:dist`.\n",
  "handoff.md": "# Handoff\n\n`npm run test:unit` passed.\n"
}

function fixtureRoot(overrides: FixtureFiles = {}): string {
  const root = mkdtempSync(join(tmpdir(), "verify-release-docs-"))
  createdDirs.push(root)
  const files = { ...BASE_FILES, ...overrides }
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
    const result = run(fixtureRoot({ "docs/GITHUB_PAGES.md": "# Pages\n\nWorkflow: `.github/workflows/pages.yml`.\n" }))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(".github/workflows/pages.yml")
  })

  it("checks .omo/evidence paths only when that task's local evidence directory exists (git-ignored; absent in a fresh clone)", () => {
    const doc = "# Handoff\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"

    const freshClone = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc }))
    expect(freshClone.status, freshClone.stderr).toBe(0)

    const withTaskDir = run(fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-19/README": "" }))
    expect(withTaskDir.status).toBe(1)
    expect(withTaskDir.stderr).toContain("pages-static-smoke.json")

    const present = run(
      fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-19/pages-static-smoke.json": "{}" })
    )
    expect(present.status, present.stderr).toBe(0)
  })

  it("Todo 20 fresh-clone QA: a clean clone that ran the quickstart (deps:wasm/build:wasm write only task-6 build logs) still passes", () => {
    // Found by the real fresh-clone QA (.omo/evidence/ultima-web/task-20/fresh-clone.log):
    // the documented build writes .omo/evidence/ultima-web/task-6/*.log, so an
    // evidence tree exists even though none of the documented evidence does.
    const doc = "# Pages\n\nEvidence: `.omo/evidence/ultima-web/task-19/pages-static-smoke.json`.\n"
    const afterQuickstart = run(
      fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-6/build.log": "build" })
    )
    expect(afterQuickstart.status, afterQuickstart.stderr).toBe(0)

    // A task directory that exists locally is still checked file by file.
    const taskDirWithoutFile = run(
      fixtureRoot({ "docs/GITHUB_PAGES.md": doc, ".omo/evidence/ultima-web/task-19/other.log": "" })
    )
    expect(taskDirWithoutFile.status).toBe(1)
    expect(taskDirWithoutFile.stderr).toContain("pages-static-smoke.json")
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
})
