import { readFileSync } from "node:fs"

// Static (no YAML parser, no `act`) validator for `.github/workflows/pages.yml`
// -- Todo 19's acceptance criteria explicitly allows "`act` or `npm run
// verify:workflow`". This project has no YAML dependency, so this checks
// the workflow file as plain text instead of parsing it, the same way
// scripts/check-base-path.mjs checks built HTML as text.
//
// Structural checks (permissions, artifact path, `.nojekyll`, step
// ordering) are matched against *non-comment* lines with an anchored
// regex, not a plain substring search over the whole file -- the header
// comment legitimately talks about "id-token: write", "audit:dist", etc.
// as documentation, and a plain `text.includes(...)` would be satisfied
// by that prose alone even if the real permission/step were missing.

export class WorkflowVerificationError extends Error {}

// These may legitimately also appear in the header comment/documentation,
// so a plain whole-file substring search is the right check for them.
const REQUIRED_SUBSTRINGS = [
  {
    value: "https://github.com/TaejinKim7-dev/ultima",
    describe: (value) => `workflow is missing the HTTPS repository URL "${value}"`
  },
  {
    value: "git@github.com:TaejinKim7-dev/ultima.git",
    describe: (value) => `workflow is missing the SSH write remote "${value}"`
  },
  {
    value: "https://taejinkim7-dev.github.io/ultima/",
    describe: (value) => `workflow is missing the expected GitHub Pages URL "${value}"`
  },
  {
    value: "--base=/ultima/",
    describe: (value) => `workflow does not build the site with the required GitHub Pages base ("${value}")`
  }
]

// Structural checks: each must have at least one matching *non-comment*
// line, anchored to the actual YAML key (an optional trailing `# ...`
// comment on the same line is tolerated).
const REQUIRED_LINE_PATTERNS = [
  {
    pattern: /^\s*pages:\s*write\s*(#.*)?$/,
    describe: () => 'workflow is missing the required "pages: write" permission (as an actual permission, not just in a comment)'
  },
  {
    pattern: /^\s*id-token:\s*write\s*(#.*)?$/,
    describe: () =>
      'workflow is missing the required "id-token: write" permission (as an actual permission, not just in a comment)'
  },
  {
    pattern: /^\s*path:\s*dist\s*(#.*)?$/,
    describe: () =>
      'workflow does not upload "dist" as the Pages artifact root ("path: dist"), so dist/index.html would not land at the artifact root'
  },
  {
    pattern: /^\s*include-hidden-files:\s*"true"\s*(#.*)?$/,
    describe: () =>
      'workflow is missing "include-hidden-files: \\"true\\"" on the Pages artifact upload -- without it, ".nojekyll" (a dotfile) is silently dropped from the uploaded artifact'
  },
  {
    pattern: /^\s*run:.*\.nojekyll/,
    describe: () => 'workflow is missing a run step that creates ".nojekyll" (GitHub Pages must not run Jekyll over this artifact)'
  }
]

const AUDIT_RUN_LINE = /^\s*run:.*npm run audit:dist/
const UPLOAD_USES_LINE = /^\s*uses:\s*actions\/upload-pages-artifact@/
const USES_LINE = /uses:\s*([^\s@]+)@(\S+)/g
const SHA_PIN = /^[0-9a-f]{40}$/
const NODE_VERSION_LINE = /node-version:\s*"([^"]*)"/
const EXACT_SEMVER = /^\d+\.\d+\.\d+$/
const GIT_PUSH = /\bgit\s+push\b/i
const ORIGINAL_DATA_EXTENSION = /\.(zip|sav|ega|map|tlk|exe)\b/i

function nonCommentLines(text) {
  return text.split("\n").filter((line) => !line.trim().startsWith("#"))
}

function checkRequiredSubstrings(text) {
  for (const { value, describe } of REQUIRED_SUBSTRINGS) {
    if (!text.includes(value)) {
      throw new WorkflowVerificationError(describe(value))
    }
  }
}

function checkRequiredLinePatterns(lines) {
  for (const { pattern, describe } of REQUIRED_LINE_PATTERNS) {
    if (!lines.some((line) => pattern.test(line))) {
      throw new WorkflowVerificationError(describe())
    }
  }
}

function checkActionsArePinnedToShas(text) {
  for (const match of text.matchAll(USES_LINE)) {
    const [, action, ref] = match
    if (action === undefined || ref === undefined) {
      continue
    }
    if (!SHA_PIN.test(ref)) {
      throw new WorkflowVerificationError(
        `workflow action "${action}" is not pinned to a full commit SHA (found "@${ref}"); pinned tool versions are required`
      )
    }
  }
}

function checkNodeVersionIsExact(text) {
  const match = NODE_VERSION_LINE.exec(text)
  if (match === null) {
    throw new WorkflowVerificationError('workflow is missing a "node-version" input for actions/setup-node')
  }
  const [, version] = match
  if (version === undefined || !EXACT_SEMVER.test(version)) {
    throw new WorkflowVerificationError(
      `workflow's "node-version" must be an exact pinned version (e.g. "22.23.3"), found "${version}"`
    )
  }
}

function checkAuditRunsBeforeUpload(lines) {
  const auditIndex = lines.findIndex((line) => AUDIT_RUN_LINE.test(line))
  const uploadIndex = lines.findIndex((line) => UPLOAD_USES_LINE.test(line))
  if (auditIndex === -1) {
    throw new WorkflowVerificationError('workflow is missing an "npm run audit:dist" run step')
  }
  if (uploadIndex === -1) {
    throw new WorkflowVerificationError('workflow is missing an "actions/upload-pages-artifact" step')
  }
  if (auditIndex > uploadIndex) {
    throw new WorkflowVerificationError(
      '"audit:dist" must run before the Pages artifact is uploaded, so a failed audit blocks publishing'
    )
  }
}

function checkNoGitPush(text) {
  if (GIT_PUSH.test(text)) {
    throw new WorkflowVerificationError(
      "workflow must not run a literal \"git push\" -- GitHub Pages deployment uses the official OIDC-based Pages Actions, not a git-level push"
    )
  }
}

function checkNoOriginalDataReferences(text) {
  const match = ORIGINAL_DATA_EXTENSION.exec(text)
  if (match !== null) {
    throw new WorkflowVerificationError(
      `workflow references what looks like an original Ultima IV game data path ("${match[0]}"); the artifact must never include original game data`
    )
  }
}

/**
 * Statically validates a `.github/workflows/pages.yml`-shaped GitHub Actions
 * workflow file's text against Todo 19's acceptance criteria. Throws a
 * `WorkflowVerificationError` describing the first violation found.
 */
export function verifyWorkflow(workflowPath) {
  let text
  try {
    text = readFileSync(workflowPath, "utf8")
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown read error"
    throw new WorkflowVerificationError(`cannot read workflow file at ${workflowPath}: ${reason}`)
  }

  const lines = nonCommentLines(text)

  checkRequiredSubstrings(text)
  checkRequiredLinePatterns(lines)
  checkActionsArePinnedToShas(text)
  checkNodeVersionIsExact(text)
  checkAuditRunsBeforeUpload(lines)
  checkNoGitPush(text)
  checkNoOriginalDataReferences(text)
}
