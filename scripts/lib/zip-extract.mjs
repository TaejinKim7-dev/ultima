import { execFileSync } from "node:child_process"

/**
 * Extract one entry's raw bytes from a ZIP archive by shelling out to the
 * system `unzip` binary (already a build-time dependency of this repo's
 * verification tooling; no new npm dependency needed to touch the
 * original game data, which we never want to add a persistent library
 * binding for).
 */
export function extractZipEntry(zipPath, entryName) {
  try {
    return execFileSync("unzip", ["-p", zipPath, entryName], {
      maxBuffer: 64 * 1024 * 1024
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown unzip error"
    throw new Error(`failed to extract "${entryName}" from ${zipPath}: ${reason}`)
  }
}

/** List every entry name in a ZIP archive (one per line, via `unzip -Z1`). */
export function listZipEntries(zipPath) {
  const output = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
