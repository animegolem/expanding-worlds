/**
 * Identity primitives per RFC-0001 §4.11: RFC 9562 UUIDv7 for all
 * persisted identities, and human-facing short codes derived from the
 * random tail (never the shared timestamp prefix).
 */

// WebCrypto is present in every supported runtime (Node ≥19, browsers,
// Electron) but absent from the ES2022 lib types this package builds
// against.
declare const crypto: { getRandomValues(array: Uint8Array): Uint8Array }

const HEX: string[] = []
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'))

let lastMs = -1
let seq = 0

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * RFC 9562 UUIDv7: 48-bit unix-ms timestamp, 12-bit monotonic
 * sequence in rand_a (re-randomized each new millisecond), random
 * rand_b. Strictly increasing within one process.
 */
export function uuidv7(): string {
  let ms = Date.now()
  if (ms <= lastMs) {
    seq += 1
    if (seq > 0xfff) {
      // Sequence exhausted within one millisecond: borrow the next.
      lastMs += 1
      seq = randomBytes(2)[0]! & 0x7f
    }
    ms = lastMs
  } else {
    lastMs = ms
    // Random starting point, kept low enough to leave increment room.
    const r = randomBytes(2)
    seq = ((r[0]! << 8) | r[1]!) & 0x7ff
  }

  const bytes = new Uint8Array(16)
  bytes[0] = (ms / 0x10000000000) & 0xff
  bytes[1] = (ms / 0x100000000) & 0xff
  bytes[2] = (ms / 0x1000000) & 0xff
  bytes[3] = (ms / 0x10000) & 0xff
  bytes[4] = (ms / 0x100) & 0xff
  bytes[5] = ms & 0xff
  bytes[6] = 0x70 | ((seq >> 8) & 0x0f)
  bytes[7] = seq & 0xff
  const tail = randomBytes(8)
  bytes.set(tail, 8)
  bytes[8] = 0x80 | (bytes[8]! & 0x3f)

  let hex = ''
  for (let i = 0; i < 16; i++) hex += HEX[bytes[i]!]
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Crockford base32 without confusable characters, lowercased. */
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Human-facing short code per §4.11: derived exclusively from the
 * UUID's random tail (final seven bytes), because nearby UUIDv7
 * values share their timestamp prefix.
 */
export function shortCode(uuid: string, length = 8): string {
  const hex = uuid.replaceAll('-', '')
  if (hex.length !== 32 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error(`shortCode: not a UUID: ${uuid}`)
  }
  // Bytes 9..15 are pure rand_b; byte 8's high bits are the variant.
  const tail = hex.slice(18)
  let value = 0n
  for (let i = 0; i < tail.length; i += 2) {
    value = (value << 8n) | BigInt(parseInt(tail.slice(i, i + 2), 16))
  }
  let out = ''
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(value & 31n)]! + out
    value >>= 5n
  }
  return out
}
