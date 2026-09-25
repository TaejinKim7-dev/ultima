import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const scriptPath = join(projectRoot, "scripts/verify-workflow.mjs")
const realWorkflowPath = join(projectRoot, ".github/workflows/pages.yml")

const createdDirs: string[] = []

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()
    if (dir) rmSync(dir, { force: true, recursive: true })
  }
})

function tempWorkflowFrom(mutate: (source: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-workflow-"))
  createdDirs.push(dir)
  const source = readFileSync(realWorkflowPath, "utf8")
  const path = join(dir, "pages.yml")
  writeFileSync(path, mutate(source))
  return path
}

// Removes only the line(s) matching `pattern` -- unlike a substring filter,
// this leaves prose that merely *mentions* the same words (e.g. the header
// comment's "id-token: write") untouched, so the mutation exercises exactly
// "the real permission/step is gone" rather than "every trace of the word
// is gone".
function removeLinesMatching(source: string, pattern: RegExp): string {
  return source
    .split("\n")
    .filter((line) => !pattern.test(line))
    .join("\n")
}

function run(workflowPath: string) {
  return spawnSync("node", [scriptPath, workflowPath], { encoding: "utf8" })
}

describe("verify:workflow", () => {
  it("passes for the committed Pages workflow", () => {
    // Given / When: the real, committed workflow file.
    const result = run(realWorkflowPath)

    // Then: it satisfies every static check.
    expect(result.status, result.stderr).toBe(0)
  })

  it("rejects a workflow missing the .nojekyll run step (even though the step name and header comment still mention it)", () => {
    const path = tempWorkflowFrom((source) => removeLinesMatching(source, /^\s*run:.*\.nojekyll/))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(".nojekyll")
  })

  it("rejects a workflow with an unquoted step name containing \": \" (invalid plain YAML)", () => {
    // A real bug this project shipped once: `- name: Foo: bar (baz)` is not
    // valid plain-scalar YAML (a colon-space inside an unquoted value ends
    // the mapping early) -- GitHub Actions rejects the whole workflow file
    // before any job runs. scripts/verify-workflow.mjs has no YAML parser,
    // so it must catch this specific shape itself.
    const path = tempWorkflowFrom((source) =>
      source.replace(
        /name:\s*"Unit tests: wasm engine suite \(known gap, see header comment\)"/,
        "name: Unit tests: wasm engine suite (known gap, see header comment)"
      )
    )

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("invalid")
  })

  it("rejects an upload artifact root that is not the dist build output", () => {
    const path = tempWorkflowFrom((source) => source.replace(/path:\s*dist\b/, "path: ."))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("artifact root")
  })

  it("rejects a workflow missing include-hidden-files on the artifact upload (.nojekyll would be silently dropped)", () => {
    const path = tempWorkflowFrom((source) =>
      removeLinesMatching(source, /^\s*include-hidden-files:\s*"true"\s*$/)
    )

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("include-hidden-files")
  })

  it("rejects a workflow missing the actual id-token: write permission line (the header comment alone must not satisfy this)", () => {
    const path = tempWorkflowFrom((source) => removeLinesMatching(source, /^\s*id-token:\s*write\s*$/))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("id-token: write")
  })

  it("rejects a workflow missing the actual pages: write permission line", () => {
    const path = tempWorkflowFrom((source) => removeLinesMatching(source, /^\s*pages:\s*write\s*$/))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("pages: write")
  })

  it("rejects a workflow missing the HTTPS repository URL", () => {
    const path = tempWorkflowFrom((source) =>
      source.replaceAll("https://github.com/TaejinKim7-dev/ultima", "")
    )

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("https://github.com/TaejinKim7-dev/ultima")
  })

  it("rejects a workflow missing the SSH write remote", () => {
    const path = tempWorkflowFrom((source) =>
      source.replaceAll("git@github.com:TaejinKim7-dev/ultima.git", "")
    )

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("git@github.com:TaejinKim7-dev/ultima.git")
  })

  it("rejects a workflow missing the Pages base path", () => {
    const path = tempWorkflowFrom((source) => source.replaceAll("--base=/ultima/", ""))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("/ultima/")
  })

  it("rejects a workflow with an unpinned (non-SHA) action reference", () => {
    const path = tempWorkflowFrom((source) =>
      source.replace(/uses:\s*actions\/checkout@[0-9a-f]{40}/, "uses: actions/checkout@v7")
    )

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("actions/checkout")
    expect(result.stderr).toContain("pinned")
  })

  it("rejects a workflow with a floating node-version", () => {
    const path = tempWorkflowFrom((source) => source.replace(/node-version:\s*"[\d.]+"/, 'node-version: "22"'))

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("node-version")
  })

  it("rejects a workflow that runs audit:dist after the artifact upload", () => {
    const path = tempWorkflowFrom((source) => {
      const lines = source.split("\n")
      const auditIndex = lines.findIndex((line) => /^\s*run:.*npm run audit:dist/.test(line))
      const uploadIndex = lines.findIndex((line) => /^\s*uses:\s*actions\/upload-pages-artifact@/.test(line))
      if (auditIndex === -1 || uploadIndex === -1) {
        throw new Error("fixture workflow missing expected audit/upload lines")
      }
      // Move the audit:dist line to just after the upload step's `uses:` line.
      const [auditLine] = lines.splice(auditIndex, 1)
      if (auditLine === undefined) {
        throw new Error("fixture workflow audit line missing")
      }
      const newUploadIndex = lines.findIndex((line) => /^\s*uses:\s*actions\/upload-pages-artifact@/.test(line))
      lines.splice(newUploadIndex + 1, 0, auditLine)
      return lines.join("\n")
    })

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("audit:dist")
  })

  it("rejects a workflow that runs a literal git push command", () => {
    const path = tempWorkflowFrom((source) => `${source}\n# test fixture only\n      - run: git push origin main\n`)

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("git push")
  })

  it("rejects a workflow that leaks an original-game-data extension reference", () => {
    const path = tempWorkflowFrom((source) => `${source}\n      - run: cp ultima4.zip dist/\n`)

    const result = run(path)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("original")
  })
})
