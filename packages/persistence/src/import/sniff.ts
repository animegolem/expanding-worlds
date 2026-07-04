/**
 * Magic-byte type detection and header dimension parsing for the
 * Phase 1 raster formats (RFC-0001 §4.7): PNG, JPEG, WebP, GIF, AVIF.
 * Detection NEVER consults the filename or extension — bytes only.
 *
 * Pure functions over byte buffers; no native image dependency in
 * Phase 1 core. Unrecognized or truncated inputs return null and the
 * pipeline rejects them with a structured notice, creating no records.
 */

export type SniffedFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif'

export interface SniffResult {
  format: SniffedFormat
  mimeType: string
  width: number
  height: number
}

/** How many leading bytes callers should feed sniff(); AVIF metadata
 * (ftyp + meta/iprp/ipco/ispe) precedes mdat, so this comfortably
 * covers header parsing for all five formats. */
export const SNIFF_HEADER_BYTES = 512 * 1024

export function sniff(bytes: Uint8Array): SniffResult | null {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return sniffPng(buf) ?? sniffJpeg(buf) ?? sniffGif(buf) ?? sniffWebp(buf) ?? sniffAvif(buf)
}

function hasAscii(buf: Buffer, offset: number, text: string): boolean {
  if (offset + text.length > buf.length) return false
  for (let i = 0; i < text.length; i += 1) {
    if (buf[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

// --- PNG: 8-byte signature, then the IHDR chunk with BE dimensions.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function sniffPng(buf: Buffer): SniffResult | null {
  if (buf.length < 8 || PNG_SIGNATURE.some((b, i) => buf[i] !== b)) return null
  // IHDR must be the first chunk: length(4) 'IHDR'(4) width(4) height(4).
  if (buf.length < 24 || !hasAscii(buf, 12, 'IHDR')) return null
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (width === 0 || height === 0) return null
  return { format: 'png', mimeType: 'image/png', width, height }
}

// --- JPEG: SOI then a marker walk to the first SOFn frame header.

function isSofMarker(marker: number): boolean {
  // SOF0–SOF15 carry frame dimensions, except DHT (C4), JPG (C8),
  // and DAC (CC) which reuse the C0 block numbering.
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

function sniffJpeg(buf: Buffer): SniffResult | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) return null // desynchronized stream
    // Skip fill bytes: any number of 0xFF may pad before a marker.
    let marker = buf[offset + 1]!
    while (marker === 0xff && offset + 2 < buf.length) {
      offset += 1
      marker = buf[offset + 1]!
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2 // standalone marker, no length segment
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null // EOI/SOS before any SOF
    if (offset + 4 > buf.length) return null
    const length = buf.readUInt16BE(offset + 2)
    if (length < 2) return null
    if (isSofMarker(marker)) {
      // SOFn payload: precision(1) height(2 BE) width(2 BE) ...
      if (offset + 9 > buf.length) return null
      const height = buf.readUInt16BE(offset + 5)
      const width = buf.readUInt16BE(offset + 7)
      if (width === 0 || height === 0) return null
      return { format: 'jpeg', mimeType: 'image/jpeg', width, height }
    }
    offset += 2 + length
  }
  return null
}

// --- GIF: 'GIF87a'/'GIF89a' then LE logical-screen dimensions.

function sniffGif(buf: Buffer): SniffResult | null {
  if (buf.length < 10) return null
  if (!hasAscii(buf, 0, 'GIF87a') && !hasAscii(buf, 0, 'GIF89a')) return null
  const width = buf.readUInt16LE(6)
  const height = buf.readUInt16LE(8)
  if (width === 0 || height === 0) return null
  return { format: 'gif', mimeType: 'image/gif', width, height }
}

// --- WebP: RIFF container; dimensions differ per VP8/VP8L/VP8X chunk.

function sniffWebp(buf: Buffer): SniffResult | null {
  if (buf.length < 20 || !hasAscii(buf, 0, 'RIFF') || !hasAscii(buf, 8, 'WEBP')) return null
  const result = (width: number, height: number): SniffResult | null =>
    width === 0 || height === 0
      ? null
      : { format: 'webp', mimeType: 'image/webp', width, height }
  // First chunk header at 12: fourcc(4) size(4), payload at 20.
  if (hasAscii(buf, 12, 'VP8 ')) {
    // Lossy: 3-byte frame tag, 3-byte start code 9D 01 2A, then
    // 14-bit width/height in LE u16s.
    if (buf.length < 30 || buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null
    return result(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff)
  }
  if (hasAscii(buf, 12, 'VP8L')) {
    // Lossless: signature 0x2F then 14-bit width-1 / height-1 packed LSB-first.
    if (buf.length < 25 || buf[20] !== 0x2f) return null
    const b0 = buf[21]!
    const b1 = buf[22]!
    const b2 = buf[23]!
    const b3 = buf[24]!
    const width = 1 + (((b1 & 0x3f) << 8) | b0)
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    return result(width, height)
  }
  if (hasAscii(buf, 12, 'VP8X')) {
    // Extended: flags(4), then 24-bit LE canvas width-1 / height-1.
    if (buf.length < 30) return null
    const width = 1 + (buf[24]! | (buf[25]! << 8) | (buf[26]! << 16))
    const height = 1 + (buf[27]! | (buf[28]! << 8) | (buf[29]! << 16))
    return result(width, height)
  }
  return null
}

// --- AVIF: ISO-BMFF. Brand check on the ftyp box, dimensions from the
// ispe (ImageSpatialExtentsProperty) box inside meta → iprp → ipco.

interface BmffBox {
  type: string
  /** Payload bounds within the buffer (may be clipped by truncation). */
  start: number
  end: number
}

function* walkBoxes(buf: Buffer, start: number, end: number): Generator<BmffBox> {
  let offset = start
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset)
    let headerSize = 8
    const type = buf.toString('latin1', offset + 4, offset + 8)
    if (size === 1) {
      // 64-bit largesize; JS numbers cover any realistic header region.
      if (offset + 16 > end) return
      size = Number(buf.readBigUInt64BE(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      size = end - offset // box extends to end of enclosing scope
    }
    if (size < headerSize) return
    yield { type, start: offset + headerSize, end: Math.min(offset + size, end) }
    offset += size
  }
}

function findBox(buf: Buffer, start: number, end: number, type: string): BmffBox | null {
  for (const box of walkBoxes(buf, start, end)) {
    if (box.type === type) return box
  }
  return null
}

function sniffAvif(buf: Buffer): SniffResult | null {
  if (buf.length < 16) return null
  const ftyp = findBox(buf, 0, buf.length, 'ftyp')
  if (!ftyp || ftyp.start !== 8) return null // ftyp must be first
  // Brands: major at +0, compatible list from +8 in 4-byte steps.
  const brands: string[] = [buf.toString('latin1', ftyp.start, ftyp.start + 4)]
  for (let at = ftyp.start + 8; at + 4 <= ftyp.end; at += 4) {
    brands.push(buf.toString('latin1', at, at + 4))
  }
  if (!brands.includes('avif') && !brands.includes('avis')) return null

  const meta = findBox(buf, 0, buf.length, 'meta')
  if (!meta) return null
  // meta is a FullBox: skip 4 bytes of version/flags.
  const iprp = findBox(buf, meta.start + 4, meta.end, 'iprp')
  if (!iprp) return null
  const ipco = findBox(buf, iprp.start, iprp.end, 'ipco')
  if (!ipco) return null
  // First ispe: fine for Phase 1 sniffing — single-image AVIFs carry
  // one; pathological multi-property files may attribute a thumbnail's
  // extents first, which only skews advisory dimensions, never bytes.
  const ispe = findBox(buf, ipco.start, ipco.end, 'ispe')
  if (!ispe || ispe.end - ispe.start < 12) return null
  const width = buf.readUInt32BE(ispe.start + 4) // FullBox: +4 version/flags
  const height = buf.readUInt32BE(ispe.start + 8)
  if (width === 0 || height === 0) return null
  return { format: 'avif', mimeType: 'image/avif', width, height }
}
