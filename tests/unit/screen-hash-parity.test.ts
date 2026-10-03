import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { fnv1a32 } from "../../scripts/lib/ui-templates.mjs"

// Todo 23: vendor/xu4/src/screen.cpp (web build) hashes each screenMessage()
// format with webFormatHash() (vendor/xu4/src/web_hash.h); the shell looks
// that hash up in GENERATED_UI_TEMPLATES, built with fnv1a32(). If the two
// ever disagree every message silently stays untranslated, so compile the
// real C header with the host compiler and compare on real format literals.

const projectRoot = fileURLToPath(new URL("../../", import.meta.url))
const workDir = mkdtempSync(join(tmpdir(), "u4-hash-parity-"))
afterAll(() => rmSync(workDir, { force: true, recursive: true }))

const FORMATS = [
  "",
  "a",
  "foobar",
  "Pass\n",
  "Enter %s!\n\n",
  "Moonglow",
  "%cSlow progress!%c\n",
  "\nThou hast achieved partial Avatarhood in the Virtue of %s\n",
  "%s says: I am %s\n",
  "\u0013color\u0010bytes\n"
]

describe("web_hash.h webFormatHash vs scripts/lib/ui-templates.mjs fnv1a32", () => {
  it("produces identical hashes for real screenMessage formats (incl. \\n, %c and control bytes)", () => {
    const source = join(workDir, "hash.c")
    const binary = join(workDir, "hash")
    const cases = FORMATS.map((text) => `"${Buffer.from(text, "latin1").toString("hex").replace(/(..)/g, "\\x$1")}"`)
    writeFileSync(
      source,
      `#include <stdio.h>
#include "web_hash.h"
int main(void) {
  const char* formats[] = { ${cases.join(", ")} };
  for (unsigned i = 0; i < sizeof(formats) / sizeof(formats[0]); ++i) {
    char hash[9];
    webFormatHash(formats[i], hash);
    printf("%s\\n", hash);
  }
  return 0;
}
`
    )
    const compile = spawnSync("cc", ["-std=c99", "-Wall", "-Werror", `-I${join(projectRoot, "vendor/xu4/src")}`, source, "-o", binary], {
      encoding: "utf8"
    })
    expect(compile.status, compile.stderr).toBe(0)
    const run = spawnSync(binary, [], { encoding: "utf8" })
    expect(run.status).toBe(0)
    expect(run.stdout.trim().split("\n")).toEqual(FORMATS.map((text) => fnv1a32(text)))
  })
})
