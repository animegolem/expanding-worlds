import { describe, expect, it } from 'vitest'
import { sniff } from './sniff'

/**
 * Fixture builders: minimal valid headers constructed byte-by-byte so
 * each parser path is exercised without binary files in the repo.
 */

function pngBytes(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25)
  ihdr.writeUInt32BE(13, 0) // IHDR data length
  ihdr.write('IHDR', 4, 'latin1')
  ihdr.writeUInt32BE(width, 8)
  ihdr.writeUInt32BE(height, 12)
  ihdr[16] = 8 // bit depth
  ihdr[17] = 6 // color type RGBA
  // bytes 18–20: compression/filter/interlace 0; 21–24: CRC (unchecked)
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
    iend,
  ])
}

function jpegBytes(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8])
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x00, 0x00,
  ])
  // A marker segment the walker must skip before reaching SOF0.
  const dqt = Buffer.from([0xff, 0xdb, 0x00, 0x05, 0x00, 0x01, 0x02])
  const sof0 = Buffer.alloc(19)
  sof0[0] = 0xff
  sof0[1] = 0xc0
  sof0.writeUInt16BE(17, 2) // segment length
  sof0[4] = 8 // precision
  sof0.writeUInt16BE(height, 5)
  sof0.writeUInt16BE(width, 7)
  sof0[9] = 3 // components (payload after this is irrelevant to sniff)
  const eoi = Buffer.from([0xff, 0xd9])
  return Buffer.concat([soi, app0, dqt, sof0, eoi])
}

function gifBytes(width: number, height: number): Buffer {
  const buf = Buffer.alloc(14)
  buf.write('GIF89a', 0, 'latin1')
  buf.writeUInt16LE(width, 6)
  buf.writeUInt16LE(height, 8)
  buf[13] = 0x3b // trailer
  return buf
}

function riffWebp(fourcc: string, payload: Buffer): Buffer {
  const chunk = Buffer.alloc(8)
  chunk.write(fourcc, 0, 'latin1')
  chunk.writeUInt32LE(payload.length, 4)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(4 + 8 + payload.length, 4)
  header.write('WEBP', 8, 'latin1')
  return Buffer.concat([header, chunk, payload])
}

function webpVp8Bytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  // 3-byte frame tag, then start code 9D 01 2A, then 14-bit dims LE.
  payload[3] = 0x9d
  payload[4] = 0x01
  payload[5] = 0x2a
  payload.writeUInt16LE(width & 0x3fff, 6)
  payload.writeUInt16LE(height & 0x3fff, 8)
  return riffWebp('VP8 ', payload)
}

function webpVp8lBytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(5)
  payload[0] = 0x2f
  const w = width - 1
  const h = height - 1
  payload[1] = w & 0xff
  payload[2] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6)
  payload[3] = (h >> 2) & 0xff
  payload[4] = (h >> 10) & 0x0f
  return riffWebp('VP8L', payload)
}

function webpVp8xBytes(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10)
  const w = width - 1
  const h = height - 1
  payload[4] = w & 0xff
  payload[5] = (w >> 8) & 0xff
  payload[6] = (w >> 16) & 0xff
  payload[7] = h & 0xff
  payload[8] = (h >> 8) & 0xff
  payload[9] = (h >> 16) & 0xff
  return riffWebp('VP8X', payload)
}

function bmffBox(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + payload.length, 0)
  header.write(type, 4, 'latin1')
  return Buffer.concat([header, payload])
}

function avifBytes(width: number, height: number, brand = 'avif'): Buffer {
  const ftyp = bmffBox(
    'ftyp',
    Buffer.concat([
      Buffer.from(brand, 'latin1'),
      Buffer.alloc(4), // minor version
      Buffer.from('mif1', 'latin1'), // compatible brands
      Buffer.from('miaf', 'latin1'),
    ]),
  )
  const ispePayload = Buffer.alloc(12) // version/flags + w + h
  ispePayload.writeUInt32BE(width, 4)
  ispePayload.writeUInt32BE(height, 8)
  const ipco = bmffBox('ipco', bmffBox('ispe', ispePayload))
  const iprp = bmffBox('iprp', ipco)
  const meta = bmffBox('meta', Buffer.concat([Buffer.alloc(4), iprp])) // FullBox
  const mdat = bmffBox('mdat', Buffer.from([1, 2, 3]))
  return Buffer.concat([ftyp, meta, mdat])
}

function pdfBytes(): Buffer {
  return Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'latin1')
}

describe('sniff', () => {
  it('detects PNG and parses IHDR dimensions', () => {
    expect(sniff(pngBytes(640, 480))).toEqual({
      format: 'png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
    })
  })

  it('detects JPEG by walking markers to SOF0', () => {
    expect(sniff(jpegBytes(1920, 1080))).toEqual({
      format: 'jpeg',
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
    })
  })

  it('parses a progressive JPEG (SOF2) and tolerates fill bytes', () => {
    const base = jpegBytes(300, 200)
    base[base.indexOf(0xc0, 2)] = 0xc2 // SOF0 → SOF2
    // Insert 0xFF fill padding before the first marker after SOI.
    const padded = Buffer.concat([base.subarray(0, 2), Buffer.from([0xff, 0xff]), base.subarray(2)])
    expect(sniff(padded)).toMatchObject({ format: 'jpeg', width: 300, height: 200 })
  })

  it('detects GIF with LE screen dimensions', () => {
    expect(sniff(gifBytes(12, 34))).toEqual({
      format: 'gif',
      mimeType: 'image/gif',
      width: 12,
      height: 34,
    })
  })

  it('parses WebP VP8 (lossy)', () => {
    expect(sniff(webpVp8Bytes(800, 600))).toMatchObject({
      format: 'webp',
      mimeType: 'image/webp',
      width: 800,
      height: 600,
    })
  })

  it('parses WebP VP8L (lossless) bit packing', () => {
    expect(sniff(webpVp8lBytes(16383, 16383))).toMatchObject({ width: 16383, height: 16383 })
    expect(sniff(webpVp8lBytes(1, 1))).toMatchObject({ format: 'webp', width: 1, height: 1 })
    expect(sniff(webpVp8lBytes(1057, 2731))).toMatchObject({ width: 1057, height: 2731 })
  })

  it('parses WebP VP8X (extended) 24-bit canvas dimensions', () => {
    expect(sniff(webpVp8xBytes(70000, 5))).toMatchObject({
      format: 'webp',
      width: 70000,
      height: 5,
    })
  })

  it('parses AVIF via ftyp brand and the ispe box', () => {
    expect(sniff(avifBytes(2048, 1024))).toEqual({
      format: 'avif',
      mimeType: 'image/avif',
      width: 2048,
      height: 1024,
    })
    expect(sniff(avifBytes(64, 64, 'avis'))).toMatchObject({ format: 'avif' })
  })

  it('rejects non-avif ISO-BMFF (e.g. an MP4 brand)', () => {
    expect(sniff(avifBytes(10, 10, 'isom'))).toBeNull()
  })

  it('detection is bytes-only: GIF bytes are GIF whatever the file claims', () => {
    // The mislabeled-extension case lives at the pipeline level too;
    // here: sniff has no filename input at all, only bytes.
    const bytes = gifBytes(3, 4)
    expect(sniff(bytes)).toMatchObject({ format: 'gif', mimeType: 'image/gif' })
  })

  it('returns null for unsupported types (PDF) and random bytes', () => {
    expect(sniff(pdfBytes())).toBeNull()
    expect(sniff(Buffer.from('hello world, definitely not an image'))).toBeNull()
    expect(sniff(Buffer.alloc(0))).toBeNull()
  })

  it('returns null for truncated headers of every format', () => {
    expect(sniff(pngBytes(9, 9).subarray(0, 8))).toBeNull() // signature only
    expect(sniff(pngBytes(9, 9).subarray(0, 20))).toBeNull() // cut inside IHDR
    expect(sniff(jpegBytes(9, 9).subarray(0, 2))).toBeNull() // SOI only
    expect(sniff(jpegBytes(9, 9).subarray(0, 21))).toBeNull() // cut before SOF
    expect(sniff(gifBytes(9, 9).subarray(0, 7))).toBeNull()
    expect(sniff(webpVp8Bytes(9, 9).subarray(0, 16))).toBeNull()
    expect(sniff(webpVp8lBytes(9, 9).subarray(0, 21))).toBeNull()
    expect(sniff(avifBytes(9, 9).subarray(0, 16))).toBeNull() // ftyp only
  })

  it('returns null for zero-dimension headers', () => {
    expect(sniff(pngBytes(0, 100))).toBeNull()
    expect(sniff(gifBytes(100, 0))).toBeNull()
  })
})
