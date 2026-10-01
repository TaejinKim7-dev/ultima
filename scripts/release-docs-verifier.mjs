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
//   - Evidence: `.omo/evidence/` is git-ignored and local-only, so NOTHING
//     under it can be a hard requirement -- a fresh clone has none of it and
//     `git ls-files .omo/evidence` is empty by policy (AGENTS.md). A backticked
//     local evidence path is therefore a SOFT check: present -> reported as
//     present; absent -> SKIPPED with a visible warning naming the path (never
//     a silent pass, never a failure). F1 replaced Todo 20's per-task-directory
//     heuristic with this: that heuristic turned a git-ignored path into a hard
//     failure as soon as *some* other file of the same task happened to exist
//     locally, so the check was structurally broken in a fresh clone that had
//     run any build or test step.
//   - Tracked artifacts: everything git tracks is a HARD requirement, because a
//     fresh clone always has it. See TRACKED_ARTIFACTS below.
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

// F1 (user decision): the TRACKED half of the plan-compliance check. Every one
// of these is committed to git, so a fresh clone is required to have it --
// unlike `.omo/evidence/**`, which is git-ignored by policy.
export const TRACKED_ARTIFACTS = [
  ".omo/plans/ultima-web.md",
  "docs/ULTIMA_WEB_PLAN.md",
  "docs/WEB_PORT.md",
  ".github/workflows/pages.yml",
  "docs/TESTING_POLICY.md",
  "docs/AI_AGENT_HANDOFF.md"
]

// AGENTS.md: `docs/ULTIMA_WEB_PLAN.md` must stay byte-identical to the
// canonical plan `.omo/plans/ultima-web.md` (`cmp` must succeed).
export const PLAN_MIRROR = { canonical: ".omo/plans/ultima-web.md", mirror: "docs/ULTIMA_WEB_PLAN.md" }

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

/** 1-based line number of `index` inside `text`. */
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length
}

/**
 * Pure check over already-read docs.
 *
 * @param {{
 *   docs: { path: string, text: string }[],
 *   pinDocs: { path: string, text: string }[],
 *   scripts: string[],
 *   components: { name: string, revision: string }[],
 *   pathExists: (repoRelativePath: string) => boolean
 * }} input
 * @returns {{ problems: string[], warnings: string[], evidence: { documented: number, present: number, skipped: number } }}
 */
export function checkReleaseDocs(input) {
  const problems = []
  const warnings = []
  const evidence = { documented: 0, present: 0, skipped: 0 }
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
        // LOCAL-ONLY (git-ignored): soft check, never a failure.
        evidence.documented += 1
        if (input.pathExists(path)) {
          evidence.present += 1
        } else {
          evidence.skipped += 1
          warnings.push(
            `${doc.path}:${lineOf(doc.text, match.index)}: SKIPPED local-only evidence "${path}" not found ` +
              "(.omo/evidence/ is git-ignored and exists only on the machine that produced it; not a failure)"
          )
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

  return { problems, warnings, evidence }
}

/** Every `npm run <script>` the text names, ignoring globs/templates. */
function npmRunNames(text) {
  const names = []
  for (const match of text.matchAll(NPM_RUN_PATTERN)) {
    if (match[2] === "") names.push(match[1])
  }
  return names
}

/**
 * Reads the real files under `root` and throws with every tracked problem
 * listed. Local-only evidence problems are returned as `warnings` instead --
 * they never fail the check.
 */
export function verifyReleaseDocs(
  root,
  { docPaths = RELEASE_DOCS, pinDocPaths = PIN_DOCS, trackedPaths = TRACKED_ARTIFACTS } = {}
) {
  const problems = []
  const warnings = []
  const exists = (path) => existsSync(join(root, path))

  // ---- TRACKED artifacts: hard requirements (a fresh clone has them) ----
  const trackedPresent = []
  for (const path of trackedPaths) {
    if (exists(path)) {
      trackedPresent.push(path)
    } else {
      problems.push(
        `required tracked release artifact ${path} is missing -- it is committed to git, so a fresh clone must have it`
      )
    }
  }

  const canonicalPlan = exists(PLAN_MIRROR.canonical) ? readFileSync(join(root, PLAN_MIRROR.canonical)) : null
  const mirrorPlan = exists(PLAN_MIRROR.mirror) ? readFileSync(join(root, PLAN_MIRROR.mirror)) : null
  let planMirror = false
  if (canonicalPlan !== null && mirrorPlan !== null) {
    planMirror = canonicalPlan.equals(mirrorPlan)
    if (!planMirror) {
      problems.push(
        `${PLAN_MIRROR.mirror} is not byte-identical to ${PLAN_MIRROR.canonical} (AGENTS.md requires \`cmp\` to succeed)`
      )
    }
  }

  // ---- package scripts: every documented/planned `npm run` must exist ----
  let scripts = []
  if (exists("package.json")) {
    scripts = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {})
  } else {
    problems.push("package.json is missing -- cannot check any documented command")
  }
  const scriptNames = new Set(scripts)

  // The plan's Verification strategy is the canonical command list (F1: every
  // command it lists must exist). The mirror is byte-identical, so one scan of
  // the canonical file covers both.
  if (canonicalPlan !== null) {
    for (const name of npmRunNames(canonicalPlan.toString("utf8"))) {
      if (!scriptNames.has(name)) {
        problems.push(
          `${PLAN_MIRROR.canonical}: "npm run ${name}" is not a script in package.json (Verification strategy command missing)`
        )
      }
    }
  }

  // ---- release docs / pin docs: the Todo 20 checks ----
  const docs = []
  for (const path of docPaths) {
    if (!exists(path)) {
      problems.push(`required release doc ${path} is missing`)
      continue
    }
    docs.push({ path, text: readFileSync(join(root, path), "utf8") })
  }
  const pinDocs = pinDocPaths.filter((path) => exists(path)).map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }))

  let components = []
  if (exists("vendor/source-manifest.json")) {
    components = JSON.parse(readFileSync(join(root, "vendor/source-manifest.json"), "utf8")).components ?? []
  } else {
    problems.push("vendor/source-manifest.json is missing -- cannot check source pins")
  }

  const checked = checkReleaseDocs({
    docs,
    pinDocs,
    scripts,
    components,
    pathExists: exists
  })
  problems.push(...checked.problems)
  warnings.push(...checked.warnings)

  if (problems.length > 0) {
    const unique = [...new Set(problems)]
    throw new ReleaseDocsVerificationError(`${unique.length} problem(s):\n  - ${unique.join("\n  - ")}`)
  }

  return {
    docs: docs.length,
    components: components.length,
    scripts: scripts.length,
    tracked: { required: trackedPaths.length, present: trackedPresent.length, paths: trackedPresent },
    planMirror,
    evidence: checked.evidence,
    warnings
  }
}
