import { createHash } from "node:crypto"

/**
 * Hash raw bytes (or a UTF-8 string) and return a prefixed hex digest.
 * Prefixing with the algorithm name keeps the schema forward-compatible if
 * we ever need to change the digest algorithm for new entries.
 */
export function sourceHash(input) {
  const buffer = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`
}
