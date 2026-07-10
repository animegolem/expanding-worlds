import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for user-initiated URL imports (AI-IMP-057): a dropped
 * link must not fetch loopback, private, link-local, or ULA targets
 * (router admin panels, the dev server, cloud metadata endpoints).
 * Threat level is desktop/user-initiated, so the residual
 * TOCTOU between this resolution and the fetch's own is accepted.
 *
 * AI-IMP-124: redirect hops are no longer a bypass. `fetchUrlForImport`
 * follows redirects manually, one request per hop, re-running the
 * protocol check and `assertPublicHost` on every target before any
 * request is sent to it (see `resolveRedirectTarget`). Only the DNS
 * TOCTOU remains accepted.
 */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const value = parseIpv4(ip)!
    // IANA marks the PCP and TURN anycast addresses globally reachable
    // even though the surrounding 192.0.0.0/24 protocol block is not.
    if (value === parseIpv4('192.0.0.9') || value === parseIpv4('192.0.0.10')) return false
    return IPV4_NON_GLOBAL.some(([base, prefix]) => inIpv4Cidr(value, base, prefix))
  }
  if (isIP(ip) !== 6) return true
  const value = parseIpv6(ip)
  if (value === null) return true

  // IPv4-mapped and the NAT64 well-known prefix are globally routable
  // containers. Their embedded destination decides the policy.
  if (inIpv6Cidr(value, '::ffff:0:0', 96) || inIpv6Cidr(value, '64:ff9b::', 96)) {
    return isPrivateAddress(ipv4FromLowBits(value))
  }
  // 6to4 embeds IPv4 immediately after 2002::/16.
  if (inIpv6Cidr(value, '2002::', 16)) {
    const embedded = Number((value >> 80n) & 0xffff_ffffn)
    return isPrivateAddress(formatIpv4(embedded))
  }

  return IPV6_NON_GLOBAL.some(([base, prefix]) => inIpv6Cidr(value, base, prefix))
}

type Ipv4Cidr = readonly [base: number, prefix: number]
type Ipv6Cidr = readonly [base: string, prefix: number]

// IANA IPv4 Special-Purpose Address Registry entries whose globally
// reachable flag is false (plus multicast/reserved address space).
const IPV4_NON_GLOBAL: readonly Ipv4Cidr[] = [
  [parseIpv4('0.0.0.0')!, 8],
  [parseIpv4('10.0.0.0')!, 8],
  [parseIpv4('100.64.0.0')!, 10],
  [parseIpv4('127.0.0.0')!, 8],
  [parseIpv4('169.254.0.0')!, 16],
  [parseIpv4('172.16.0.0')!, 12],
  [parseIpv4('192.0.0.0')!, 24],
  [parseIpv4('192.0.2.0')!, 24],
  [parseIpv4('192.88.99.0')!, 24],
  [parseIpv4('192.168.0.0')!, 16],
  [parseIpv4('198.18.0.0')!, 15],
  [parseIpv4('198.51.100.0')!, 24],
  [parseIpv4('203.0.113.0')!, 24],
  [parseIpv4('224.0.0.0')!, 4],
  [parseIpv4('240.0.0.0')!, 4],
]

// IANA IPv6 special-purpose space that is not globally reachable.
// Mapped/NAT64-WKP/6to4 are handled above because their embedded IPv4
// decides whether a real request can reach a local target.
const IPV6_NON_GLOBAL: readonly Ipv6Cidr[] = [
  ['::', 96], // unspecified, loopback, and deprecated v4-compatible
  ['64:ff9b::', 32], // malformed/adjacent translation spellings fail closed
  ['64:ff9b:1::', 48], // NAT64 local-use
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:2::', 48], // benchmarking
  ['2001:10::', 28], // ORCHID (deprecated)
  ['2001:20::', 28], // ORCHIDv2
  ['2001:db8::', 32], // documentation
  ['3fff::', 20], // documentation
  ['5f00::', 16], // segment-routing SIDs
  ['fc00::', 7], // unique-local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8], // multicast
]

function parseIpv4(ip: string): number | null {
  if (isIP(ip) !== 4) return null
  return ip
    .split('.')
    .map(Number)
    .reduce((value, octet) => (value * 256 + octet) >>> 0, 0)
}

function inIpv4Cidr(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffff_ffff << (32 - prefix)) >>> 0
  return (value & mask) >>> 0 === (base & mask) >>> 0
}

function parseIpv6(ip: string): bigint | null {
  if (isIP(ip) !== 6) return null
  let normalized = ip.toLowerCase()
  if (normalized.includes('.')) {
    const colon = normalized.lastIndexOf(':')
    const v4 = parseIpv4(normalized.slice(colon + 1))
    if (v4 === null) return null
    normalized = `${normalized.slice(0, colon)}:${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] === '' ? [] : halves[0]!.split(':')
  const right = halves.length === 1 || halves[1] === '' ? [] : halves[1]!.split(':')
  const missing = 8 - left.length - right.length
  if (missing < 0 || halves.length === 1 && missing !== 0) return null
  const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  if (groups.length !== 8) return null
  let value = 0n
  for (const group of groups) {
    const parsed = Number.parseInt(group, 16)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff) return null
    value = (value << 16n) | BigInt(parsed)
  }
  return value
}

function inIpv6Cidr(value: bigint, base: string, prefix: number): boolean {
  const baseValue = parseIpv6(base)
  if (baseValue === null) throw new Error(`invalid IPv6 CIDR base ${base}`)
  const shift = BigInt(128 - prefix)
  return value >> shift === baseValue >> shift
}

function ipv4FromLowBits(value: bigint): string {
  return formatIpv4(Number(value & 0xffff_ffffn))
}

function formatIpv4(value: number): string {
  return [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255].join('.')
}

/**
 * Resolve a redirect's Location against the URL that issued it, so a
 * hop can be re-guarded before it is followed. Returns null (fail
 * closed) when the Location is missing, blank, or unparseable — the
 * caller must refuse rather than follow. A relative Location resolves
 * against `current`; an absolute one is returned as-is. Protocol and
 * host policy are enforced by the caller, not here.
 */
export function resolveRedirectTarget(current: string | URL, location: string | null | undefined): URL | null {
  if (typeof location !== 'string') return null
  const trimmed = location.trim()
  if (trimmed === '') return null
  try {
    return new URL(trimmed, current)
  } catch {
    return null
  }
}

/** Null when the host is public; a user-facing refusal otherwise. */
export async function assertPublicHost(
  url: URL,
  resolveHost: typeof lookup = lookup,
): Promise<string | null> {
  const refusal = `refusing to fetch a private or local address (${url.hostname})`
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return refusal
  if (isIP(host) !== 0) return isPrivateAddress(host) ? refusal : null
  try {
    const addresses = await resolveHost(host, { all: true })
    if (addresses.some((entry) => isPrivateAddress(entry.address))) return refusal
  } catch {
    return `could not resolve ${host}`
  }
  return null
}
