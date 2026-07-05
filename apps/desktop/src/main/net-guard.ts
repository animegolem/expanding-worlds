import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for user-initiated URL imports (AI-IMP-057): a dropped
 * link must not fetch loopback, private, link-local, or ULA targets
 * (router admin panels, the dev server, cloud metadata endpoints).
 * Threat level is desktop/user-initiated, so the residual
 * TOCTOU between this resolution and net.fetch's own is accepted.
 */

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number)
    const a = parts[0]!
    const b = parts[1]!
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 ULA
  if (/^fe[89ab]/.test(lower)) return true // fe80::/10 link-local
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7)) // v4-mapped
  return false
}

/** Null when the host is public; a user-facing refusal otherwise. */
export async function assertPublicHost(url: URL): Promise<string | null> {
  const refusal = `refusing to fetch a private or local address (${url.hostname})`
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return refusal
  if (isIP(host) !== 0) return isPrivateAddress(host) ? refusal : null
  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.some((entry) => isPrivateAddress(entry.address))) return refusal
  } catch {
    return `could not resolve ${host}`
  }
  return null
}
