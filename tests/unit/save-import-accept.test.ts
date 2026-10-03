import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Todo 46: the file chooser behind "세이브 가져오기" filters by the input's
// `accept` attribute, but the e2e specs use setInputFiles(), which bypasses
// it -- so nothing noticed that the real export (`ultima4-save.dat`,
// src/shell.ts) was hidden by an accept list of ".json,.sav".

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8")
const exportedFilename = /downloadBlob\(doc, new Blob\(\[archive\][^)]*\), "([^"]+)"\)/.exec(
  readFileSync(new URL("../../src/shell.ts", import.meta.url), "utf8")
)?.[1]

describe("save import file chooser", () => {
  it("found the real export filename in src/shell.ts", () => {
    expect(exportedFilename).toBe("ultima4-save.dat")
  })

  it("accepts the extension of the file the export button produces", () => {
    const accept = /<input[^>]*id="save-import"[^>]*accept="([^"]*)"/.exec(indexHtml)?.[1] ?? ""
    const extension = "." + exportedFilename!.split(".").pop()
    expect(accept.split(",").map((part) => part.trim())).toContain(extension)
  })

  it("still accepts the placeholder export and legacy extensions", () => {
    const accept = /<input[^>]*id="save-import"[^>]*accept="([^"]*)"/.exec(indexHtml)?.[1] ?? ""
    for (const extension of [".json", ".sav"]) {
      expect(accept.split(",").map((part) => part.trim())).toContain(extension)
    }
  })
})
