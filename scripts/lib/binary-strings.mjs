/**
 * TITLE.EXE / AVATAR.EXE embedded string-table codec.
 *
 * xu4 reads these tables with `u4read_stringtable()`
 * (vendor/xu4/src/u4file.cpp:578-598): seek to an offset (or continue from
 * the current position when offset is -1), then read N NUL-terminated
 * strings back to back. Every table below is cited to the exact call site
 * that reads it, so these offsets are not guessed.
 */

/**
 * Read `count` NUL-terminated byte strings starting at `offset` in `buffer`.
 * Mirrors u4read_stringtable()'s "read forward" behavior. Throws if the
 * buffer runs out before `count` strings are found (a corrupt/truncated
 * source file, not a translation problem).
 */
export function readNullTerminatedStrings(buffer, offset, count) {
  let cursor = offset
  const strings = []
  for (let i = 0; i < count; i++) {
    const nul = buffer.indexOf(0, cursor)
    if (nul === -1) {
      throw new Error(
        `unterminated string at offset ${cursor}: found ${i} of ${count} expected strings`
      )
    }
    strings.push(buffer.subarray(cursor, nul))
    cursor = nul + 1
  }
  return { strings, endOffset: cursor }
}

/**
 * Build the public/private inventory key for one binary string-table entry.
 * Shape required by the Todo 4 acceptance criteria: `resource:table:index`.
 */
export function binaryKey(resource, table, index) {
  return `${resource}:${table}:${index}`
}

/**
 * Extract every known TITLE.EXE / AVATAR.EXE string table.
 *
 * @param buffers {{ "title.exe"?: Buffer, "avatar.exe"?: Buffer }}
 * @returns {{resource: string, table: string, index: number, bytes: Buffer}[]}
 */
export function extractBinaryTables(buffers) {
  const entries = []

  const titleBuf = buffers["title.exe"]
  if (titleBuf) {
    // vendor/xu4/src/intro.cpp:59 INTRO_TEXT_OFFSET = 17445 - 1
    // vendor/xu4/src/intro.cpp:101-103: three tables read back to back,
    // the 2nd and 3rd continuing wherever the previous read stopped.
    let cursor = 17444
    for (const [table, count] of [
      ["introQuestions", 28],
      ["introText", 24],
      ["introGypsy", 15]
    ]) {
      const { strings, endOffset } = readNullTerminatedStrings(titleBuf, cursor, count)
      strings.forEach((bytes, index) => entries.push({ resource: "title.exe", table, index, bytes }))
      cursor = endOffset
    }
  }

  const avatarBuf = buffers["avatar.exe"]
  if (avatarBuf) {
    // Lord British dialogue: vendor/xu4/src/discourse_castle.cpp:44,50-51,59,62
    // A single 3140-byte raw block at offset 87581 holds 25 keyword strings
    // followed by 24 response strings (LB_KEY_COUNT=24, +1 empty keyword).
    // The block has one documented byte-level corruption in the original
    // binary: 7 bytes at relative offset 2724 are patched to '\n' when they
    // read as the sentinel byte 0xAB, *before* the strings are split, so we
    // must do the same before locating NUL terminators near that offset.
    const lbOffset = 87581
    const lbLength = 172 + 1 + 2967 // discourse_castle.cpp:44
    const lbSlice = Buffer.from(avatarBuf.subarray(lbOffset, lbOffset + lbLength))
    const lbBadOffset = 2724
    if (lbSlice[lbBadOffset] === 0xab) {
      lbSlice.fill(0x0a, lbBadOffset, lbBadOffset + 7) // discourse_castle.cpp:53-60
    }
    const { strings: lbKeywords, endOffset: afterLbKeywords } = readNullTerminatedStrings(lbSlice, 0, 25)
    lbKeywords.forEach((bytes, index) =>
      entries.push({ resource: "avatar.exe", table: "lordBritishKeyword", index, bytes })
    )
    const { strings: lbTexts } = readNullTerminatedStrings(lbSlice, afterLbKeywords, 24)
    lbTexts.forEach((bytes, index) =>
      entries.push({ resource: "avatar.exe", table: "lordBritishText", index, bytes })
    )

    // Hawkwind dialogue: vendor/xu4/src/discourse_castle.cpp:70,73,76-77,79
    // 53 sequential strings in a 3485-byte raw block at offset 74729.
    const hwOffset = 74729
    const hwLength = 3485
    const hwSlice = avatarBuf.subarray(hwOffset, hwOffset + hwLength)
    const { strings: hwText } = readNullTerminatedStrings(hwSlice, 0, 53)
    hwText.forEach((bytes, index) =>
      entries.push({ resource: "avatar.exe", table: "hawkwindText", index, bytes })
    )

    // Codex + shrine tables: vendor/xu4/src/codex.cpp:43-45,
    // vendor/xu4/src/shrine.cpp:54. Independent fixed offsets (not chained).
    for (const [table, offset, count] of [
      ["virtueQuestions", 0x0fc7b, 11],
      ["endgameText1", 0x0fee4, 7],
      ["endgameText2", 0x10187, 5],
      ["shrineAdvice", 93682, 24]
    ]) {
      const { strings } = readNullTerminatedStrings(avatarBuf, offset, count)
      strings.forEach((bytes, index) => entries.push({ resource: "avatar.exe", table, index, bytes }))
    }
  }

  return entries
}
