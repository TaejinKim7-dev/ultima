import { existsSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"

// Static checker for Todo 20's release docs -- `npm run verify:release-docs`.
// Plain-text checks only (no markdown parser), in the same spirit as
// scripts/workflow-verifier.mjs. Every problem is collected and reported at
// once rather than stopping at the first one.
//
// Policies (documented here because the docs themselves are checked by it):
//   - Commands: every `npm run <script>` in a release doc must be a script
//     in package.json (globs like `npm run cmake:*` are skipped). `npm ci` / `npm test` / `npx ...` are not checked.
//   - Source pins: every component in vendor/source-manifest.json must have
//     its full revision (and name) in docs/SOURCE_PINS.md or
//     docs/WEB_PORT.md -- the two docs a reader goes to for "which exact
//     upstream commit is this".
//   - Links: relative markdown links `[text](path)` must resolve relative to
//     the doc's own directory (anchors stripped; http(s)/mailto/#anchor
//     skipped). Backticked repo paths (`docs/...`, `scripts/...`, `src/...`,
//     `tests/...`, `locales/...`, `vendor/...`, `.github/...`) must exist
//     from the repo root.
//   - Evidence: `.omo/evidence/` is git-ignored and local-only. A backticked
//     evidence path is checked only when its task directory
//     (`.omo/evidence/<project>/<task>/`) exists locally, i.e. that task's
//     evidence was produced on this machine. A fresh clone has none of them
//     -- except build logs the documented quickstart itself writes (e.g.
//     `deps:wasm`/`build:wasm` -> `task-6/`), which is why "any local
//     evidence tree" is not the switch (found by Todo 20's fresh-clone QA).
//   - Paths containing glob/template characters (`*`, `{`, `<`, `$`) are
//     never checked.
//   - Placeholders: TODO/TBD/FIXME (upper-case words, so the project's own
//     "Todo 19" step names are fine), "placeholder", "<fill", "lorem" are
//     stale text. A line can opt out with `<!-- release-docs:allow-placeholder -->`
//     (e.g. a historical note that genuinely describes a placeholder).
//   - Deployment claims ("deployed at/to", "is live at", "배포 완료",
//     "배포되었") are only allowed in a doc that also has a line
//     `Verified deployment: https://taejinkim7-dev.github.io/ultima/ (Actions run <id>)`
//     -- a deploy must never be claimed unless one was actually produced.

export class ReleaseDocsVerificationError extends Error {}

//   - handoff.md is NOT a release doc for this check: it is the project's
//     append-only session log (AGENTS.md), so its old commands, removed
//     paths and quoted placeholders are accurate history, not stale docs.
//     Current instructions live in README.md / docs/WEB_PORT.md /
//     docs/GITHUB_PAGES.md, which README links handoff.md from.
export const RELEASE_DOCS = ["README.md", "docs/WEB_PORT.md", "docs/GITHUB_PAGES.md"]
export const PIN_DOCS = ["docs/SOURCE_PINS.md", "docs/WEB_PORT.md"]

const NPM_RUN_PATTERN = /npm run ([A-Za-z0-9:_-]+)([*<{]?)/g
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const BACKTICK_PATTERN = /`([^`\n]+)`/g
const REPO_PATH_PREFIX = /^(docs|scripts|src|tests|locales|vendor|\.github)\//
const EVIDENCE_PREFIX = /^\.omo\/evidence\//
const TEMPLATE_CHARS = /[*{<$]/
const PLACEHOLDER_PATTERNS = [/\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /placeholder/i, /<fill/i, /\blorem\b/i]
const PLACEHOLDER_ALLOW_MARKER = "<!-- release-docs:allow-placeholder -->"
const DEPLOY_CLAIM_PATTERN = /deployed (at|to)\b|is live at|now live\b|배포 완료|배포되었/i
const VERIFIED_DEPLOY_PATTERN =
  /^Verified deployment: https:\/\/taejinkim7-dev\.github\.io\/ultima\/ \(Actions run \d+\)\s*$/m

/**
 * Pure check over already-read docs. Returns every problem found (empty
 * array = pass).
 *
 * @param {{
 *   docs: { path: string, text: string }[],
 *   pinDocs: { path: string, text: string }[],
 *   scripts: string[],
 *   components: { name: string, revision: string }[],
 *   pathExists: (repoRelativePath: string) => boolean
 * }} input
 * @returns {string[]}
 */
export function checkReleaseDocs(input) {
  const problems = []
  const scripts = new Set(input.scripts)

  for (const doc of input.docs) {
    for (const match of doc.text.matchAll(NPM_RUN_PATTERN)) {
      const name = match[1]
      if (match[2] !== "") continue // a glob/template like `npm run cmake:*`, not one script
      if (!scripts.has(name)) {
        problems.push(`${doc.path}: "npm run ${name}" is not a script in package.json`)
      }
    }

    for (const match of doc.text.matchAll(MARKDOWN_LINK_PATTERN)) {
      const target = match[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue
      const withoutAnchor = target.split("#")[0]
      if (withoutAnchor === "" || TEMPLATE_CHARS.test(withoutAnchor)) continue
      const resolved = normalize(join(dirname(doc.path), withoutAnchor))
      if (!input.pathExists(resolved)) {
        problems.push(`${doc.path}: link target "${target}" does not exist (resolved to ${resolved})`)
      }
    }

    for (const match of doc.text.matchAll(BACKTICK_PATTERN)) {
      const candidate = match[1].trim()
      if (/\s/.test(candidate) || TEMPLATE_CHARS.test(candidate)) continue
      const path = candidate.replace(/[.,;:]+$/, "")
      if (EVIDENCE_PREFIX.test(path)) {
        const taskDir = path.split("/").slice(0, 4).join("/")
        if (input.pathExists(taskDir) && !input.pathExists(path)) {
          problems.push(`${doc.path}: evidence path "${path}" does not exist in the local .omo/evidence tree`)
        }
        continue
      }
      if (REPO_PATH_PREFIX.test(path) && !input.pathExists(path)) {
        problems.push(`${doc.path}: repo path "${path}" does not exist`)
      }
    }

    doc.text.split("\n").forEach((line, index) => {
      if (line.includes(PLACEHOLDER_ALLOW_MARKER)) return
      const hit = PLACEHOLDER_PATTERNS.find((pattern) => pattern.test(line))
      if (hit !== undefined) {
        problems.push(`${doc.path}:${index + 1}: stale placeholder text (${hit}): ${line.trim()}`)
      }
    })

    if (DEPLOY_CLAIM_PATTERN.test(doc.text) && !VERIFIED_DEPLOY_PATTERN.test(doc.text)) {
      problems.push(
        `${doc.path}: claims a deployment but has no "Verified deployment: https://taejinkim7-dev.github.io/ultima/ (Actions run <id>)" line`
      )
    }
  }

  const pinText = input.pinDocs.map((doc) => doc.text).join("\n")
  for (const component of input.components) {
    if (!pinText.includes(component.revision) || !pinText.includes(component.name)) {
      problems.push(
        `source pin ${component.name} ${component.revision} is not documented in ${PIN_DOCS.join(" or ")}`
      )
    }
  }

  return problems
}

/** Reads the real files under `root` and throws with every problem listed. */
export function verifyReleaseDocs(root, { docPaths = RELEASE_DOCS, pinDocPaths = PIN_DOCS } = {}) {
  const problems = []
  const docs = []
  for (const path of docPaths) {
    const full = join(root, path)
    if (!existsSync(full)) {
      problems.push(`required release doc ${path} is missing`)
      continue
    }
    docs.push({ path, text: readFileSync(full, "utf8") })
  }
  const pinDocs = pinDocPaths
    .filter((path) => existsSync(join(root, path)))
    .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }))

  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const manifest = JSON.parse(readFileSync(join(root, "vendor/source-manifest.json"), "utf8"))

  problems.push(
    ...checkReleaseDocs({
      docs,
      pinDocs,
      scripts: Object.keys(packageJson.scripts ?? {}),
      components: manifest.components ?? [],
      pathExists: (path) => existsSync(join(root, path))
    })
  )

  if (problems.length > 0) {
    throw new ReleaseDocsVerificationError(`${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`)
  }
  return { docs: docs.length, components: (manifest.components ?? []).length }
}
