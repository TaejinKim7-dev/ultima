// Minimal STORE-only (uncompressed) ZIP writer, test-fixture-only.
//
// This exists purely so unit/e2e tests can build small synthetic ZIP
// buffers (valid, missing-entry, and corrupted variants) without touching
// real Ultima IV data or adding a zip-writing npm dependency. It writes
// exactly the subset of the ZIP format `src/engine/zip.ts` needs to read:
// local file headers + central directory + end-of-central-directory
// record, method 0 (stored), no encryption, no zip64.

function crc32(data: Uint8Array): number {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      const mask = -(crc & 1)
      crc = (crc >>> 1) ^ (0xedb88320 & mask)
    }
  }
  return ~crc >>> 0
}

export interface TestZipEntry {
  readonly name: string
  readonly data: Uint8Array
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true)
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true)
}

/** Builds a valid, minimal STORE-only ZIP containing exactly `entries`. */
export function buildStoreZip(entries: readonly TestZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const centralDirectoryRecords: { name: Uint8Array; crc: number; size: number; offset: number }[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name)
    const crc = crc32(entry.data)
    const localHeader = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(localHeader.buffer)
    writeUint32LE(view, 0, 0x04034b50) // local file header signature
    writeUint16LE(view, 4, 20) // version needed
    writeUint16LE(view, 6, 0) // flags
    writeUint16LE(view, 8, 0) // method: stored
    writeUint16LE(view, 10, 0) // mod time
    writeUint16LE(view, 12, 0) // mod date
    writeUint32LE(view, 14, crc)
    writeUint32LE(view, 18, entry.data.length) // compressed size
    writeUint32LE(view, 22, entry.data.length) // uncompressed size
    writeUint16LE(view, 26, nameBytes.length)
    writeUint16LE(view, 28, 0) // extra length
    localHeader.set(nameBytes, 30)

    centralDirectoryRecords.push({ name: nameBytes, crc, size: entry.data.length, offset })
    chunks.push(localHeader, entry.data)
    offset += localHeader.length + entry.data.length
  }

  const centralDirectoryStart = offset
  for (const record of centralDirectoryRecords) {
    const header = new Uint8Array(46 + record.name.length)
    const view = new DataView(header.buffer)
    writeUint32LE(view, 0, 0x02014b50) // central directory signature
    writeUint16LE(view, 4, 20) // version made by
    writeUint16LE(view, 6, 20) // version needed
    writeUint16LE(view, 8, 0) // flags
    writeUint16LE(view, 10, 0) // method
    writeUint16LE(view, 12, 0) // mod time
    writeUint16LE(view, 14, 0) // mod date
    writeUint32LE(view, 16, record.crc)
    writeUint32LE(view, 20, record.size)
    writeUint32LE(view, 24, record.size)
    writeUint16LE(view, 28, record.name.length)
    writeUint16LE(view, 30, 0) // extra length
    writeUint16LE(view, 32, 0) // comment length
    writeUint16LE(view, 34, 0) // disk number start
    writeUint16LE(view, 36, 0) // internal attrs
    writeUint32LE(view, 38, 0) // external attrs
    writeUint32LE(view, 42, record.offset)
    header.set(record.name, 46)
    chunks.push(header)
    offset += header.length
  }
  const centralDirectorySize = offset - centralDirectoryStart

  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  writeUint32LE(eocdView, 0, 0x06054b50)
  writeUint16LE(eocdView, 4, 0) // disk number
  writeUint16LE(eocdView, 6, 0) // disk with CD
  writeUint16LE(eocdView, 8, centralDirectoryRecords.length)
  writeUint16LE(eocdView, 10, centralDirectoryRecords.length)
  writeUint32LE(eocdView, 12, centralDirectorySize)
  writeUint32LE(eocdView, 16, centralDirectoryStart)
  writeUint16LE(eocdView, 20, 0) // comment length
  chunks.push(eocd)

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}
