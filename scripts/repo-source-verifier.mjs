import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

export class RepositorySourceVerificationError extends Error {}

function sourceTreeEntries(directory) {
  const entries = []

  function visit(currentDirectory, relativeDirectory) {
    const directoryEntries = readdirSync(currentDirectory, { withFileTypes: true })
    for (const entry of directoryEntries) {
      const relativePath = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`
      const absolutePath = resolve(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        visit(absolutePath, relativePath)
        continue
      }

      if (entry.isFile()) {
        entries.push(relativePath)
        continue
      }

      throw new RepositorySourceVerificationError(
        `vendor source contains unsupported entry: ${relativePath}`
      )
    }
  }

  visit(directory, "")
  return entries.sort((left, right) => left.localeCompare(right))
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

export function summarizeSourceTree(directory) {
  const entries = sourceTreeEntries(directory)
  const digest = createHash("sha256")

  for (const relativePath of entries) {
    digest.update(relativePath)
    digest.update("\0")
    digest.update(sha256File(resolve(directory, relativePath)))
    digest.update("\n")
  }

  return { fileCount: entries.length, treeSha256: digest.digest("hex") }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new RepositorySourceVerificationError(`source manifest field ${fieldName} must be a string`)
  }

  return value
}

function readSourceManifest(repositoryRoot) {
  const manifestPath = resolve(repositoryRoot, "vendor/source-manifest.json")
  let parsedManifest

  try {
    parsedManifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown read error"
    throw new RepositorySourceVerificationError(`cannot read source manifest: ${reason}`)
  }

  if (
    typeof parsedManifest !== "object" ||
    parsedManifest === null ||
    !("components" in parsedManifest) ||
    !Array.isArray(parsedManifest.components)
  ) {
    throw new RepositorySourceVerificationError("source manifest must contain a components array")
  }

  return parsedManifest.components.map((component, index) => {
    if (typeof component !== "object" || component === null) {
      throw new RepositorySourceVerificationError(`source manifest component ${index} must be an object`)
    }

    return {
      name: requireString(component.name, `components[${index}].name`),
      path: requireString(component.path, `components[${index}].path`),
      revision: requireString(component.revision, `components[${index}].revision`),
      upstream: requireString(component.upstream, `components[${index}].upstream`),
      fileCount: component.fileCount,
      treeSha256: requireString(component.treeSha256, `components[${index}].treeSha256`)
    }
  })
}

function trackedRepositoryPaths(repositoryRoot) {
  try {
    const output = execFileSync("git", ["-C", repositoryRoot, "ls-files", "-z"], {
      encoding: "utf8"
    })
    return output.split("\0").filter((path) => path.length > 0)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown git error"
    throw new RepositorySourceVerificationError(`cannot list tracked repository paths: ${reason}`)
  }
}

const originalGameDataPath = /(^|\/).+\.(zip|sav|ega|map|tlk|exe)$/i

function rejectTrackedOriginalGameData(repositoryRoot) {
  const forbiddenPath = trackedRepositoryPaths(repositoryRoot).find((path) =>
    originalGameDataPath.test(path)
  )

  if (forbiddenPath !== undefined) {
    throw new RepositorySourceVerificationError(
      `forbidden original-game-data path is tracked: ${forbiddenPath}`
    )
  }
}

export function verifyRepositorySources(repositoryRoot) {
  rejectTrackedOriginalGameData(repositoryRoot)
  const components = readSourceManifest(repositoryRoot)

  for (const component of components) {
    if (typeof component.fileCount !== "number" || !Number.isSafeInteger(component.fileCount)) {
      throw new RepositorySourceVerificationError(
        `source manifest field ${component.name}.fileCount must be a safe integer`
      )
    }

    const summary = summarizeSourceTree(resolve(repositoryRoot, component.path))
    if (summary.fileCount !== component.fileCount || summary.treeSha256 !== component.treeSha256) {
      throw new RepositorySourceVerificationError(
        `pinned source mismatch for ${component.name} at revision ${component.revision}`
      )
    }
  }

  return components.length
}
