/**
 * Original DOS Ultima IV .TLK (NPC dialogue) record codec.
 *
 * Format confirmed from TWO independent authoritative sources inside the
 * pinned xu4 export (not guessed):
 *   - vendor/xu4/src/util/tlkconv.c (talk_init(), tlkSize=288 implicit via
 *     the tlk_buffer[288] caller buffers, field order in `struct Talk`)
 *   - vendor/xu4/src/discourse_tlk.cpp:199-238 (`struct U4Talk`, tlkSize=288
 *     literal at line 263, field order in U4Talk_load()/U4Talk_setOffsets())
 *
 * Record layout (288 bytes, one per NPC, 16 records per .TLK file):
 *   byte 0: question trigger (0=none, 3=job, 4=health, 5=topic1, 6=topic2)
 *   byte 1: questionHumility
 *   byte 2: turnAway probability
 *   byte 3..: 12 NUL-terminated strings, in this exact order.
 *
 * Verified against the real original ZIP file listing (not committed):
 * all 16 *.TLK files are exactly 4608 bytes = 16 * 288.
 */

export const TLK_RECORD_SIZE = 288
export const TLK_RECORDS_PER_FILE = 16

// Order matches struct Talk in tlkconv.c and the NAME..KEYWORD2 enum in
// xmlToTlk()/tlkToXml() there, and struct U4Talk's name..topic2 members in
// discourse_tlk.cpp.
export const TLK_FIELD_ORDER = [
  "name",
  "pronoun",
  "look",
  "job",
  "health",
  "response1",
  "response2",
  "question",
  "yes",
  "no",
  "topic1",
  "topic2"
]

const ASK_AFTER_BY_TRIGGER = { 3: "job", 4: "health", 5: "topic1", 6: "topic2" }

/**
 * Build the public/private inventory key for one TLK field.
 * Shape required by the Todo 4 acceptance criteria: `map:npcIndex:field`.
 */
export function tlkKey(map, npcIndex, field) {
  return `${map}:${npcIndex}:${field}`
}

/**
 * Parse one 288-byte TLK record starting at `recordOffset` in `buffer`.
 *
 * Returns raw byte slices (Buffer) per field -- callers decide how to
 * decode (the original DOS text is CP437/Latin-1-ish, not UTF-8) and must
 * hash the RAW bytes, not a lossily-decoded string, so drift detection
 * stays exact.
 */
export function parseTlkRecord(buffer, recordOffset) {
  const end = recordOffset + TLK_RECORD_SIZE
  if (recordOffset < 0 || end > buffer.length) {
    throw new Error(
      `TLK record at offset ${recordOffset} (size ${TLK_RECORD_SIZE}) exceeds buffer length ${buffer.length}`
    )
  }

  const trigger = buffer[recordOffset]
  const questionHumility = buffer[recordOffset + 1]
  const turnAway = buffer[recordOffset + 2]

  const fields = {}
  let cursor = recordOffset + 3
  for (const field of TLK_FIELD_ORDER) {
    let nul = buffer.indexOf(0, cursor)
    if (nul === -1 || nul > end) nul = end
    fields[field] = buffer.subarray(cursor, nul)
    cursor = nul + 1
  }

  return {
    trigger,
    questionHumility,
    turnAway,
    askAfter: ASK_AFTER_BY_TRIGGER[trigger] ?? null,
    fields
  }
}

/**
 * A record is treated as an unused/padding slot when its `name` field is
 * empty -- every real NPC has a name, so an empty name is not a
 * translatable string, it is "this slot is not used in this town".
 */
export function isUnusedRecord(record) {
  return record.fields.name.length === 0
}
