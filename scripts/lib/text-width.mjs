/**
 * Status-line width heuristic.
 *
 * The original DOS status panel is a fixed 15-character-cell column
 * (vendor/xu4/src/stats.h:13, `#define STATS_AREA_WIDTH 15`) drawn with an
 * 8x8 bitmap font -- see vendor/xu4/src/stats.cpp (STATS_AREA_WIDTH used
 * throughout for centering/clearing the status column). The web port keeps
 * the original status area position and size (see handoff.md requirement
 * #3), so a Korean status-line translation must still fit in that budget.
 *
 * Hangul syllables (and other East-Asian "wide" characters) render at
 * roughly double the width of a Latin glyph in any font capable of
 * rendering both scripts side by side, so we count each wide codepoint as
 * 2 columns. This is a conservative heuristic, not a pixel-accurate layout
 * simulation -- it exists to catch obviously-too-long translations before
 * they reach `i18n:check`, not to replace a real rendering QA pass.
 */
export const STATUS_AREA_WIDTH_COLUMNS = 15 // vendor/xu4/src/stats.h:13

function isWideCodePoint(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul Jamo
    (codePoint >= 0x3000 && codePoint <= 0x303f) || // CJK punctuation
    (codePoint >= 0x3130 && codePoint <= 0x318f) || // Hangul Compatibility Jamo
    (codePoint >= 0xa960 && codePoint <= 0xa97f) || // Hangul Jamo Extended-A
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xd7b0 && codePoint <= 0xd7ff) || // Hangul Jamo Extended-B
    (codePoint >= 0xff00 && codePoint <= 0xffef) // Fullwidth forms
  )
}

export function displayWidth(text) {
  let width = 0
  for (const character of text) {
    width += isWideCodePoint(character.codePointAt(0)) ? 2 : 1
  }
  return width
}
