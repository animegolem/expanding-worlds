import { describe, expect, it } from 'vitest'
import { assertPublicHost, isPrivateAddress, resolveRedirectTarget } from './net-guard'

describe('resolveRedirectTarget', () => {
  it('resolves a relative Location against the current URL', () => {
    const target = resolveRedirectTarget('http://example.com/a/b', '/next')
    expect(target?.toString()).toBe('http://example.com/next')
  })

  it('resolves a relative Location without a leading slash', () => {
    const target = resolveRedirectTarget('http://example.com/a/b', 'next')
    expect(target?.toString()).toBe('http://example.com/a/next')
  })

  it('returns an absolute Location unchanged', () => {
    const target = resolveRedirectTarget('http://example.com/a', 'https://other.test/x')
    expect(target?.toString()).toBe('https://other.test/x')
  })

  it('carries through a protocol change so the caller can reject it', () => {
    const target = resolveRedirectTarget('http://example.com/a', 'file:///etc/passwd')
    expect(target?.protocol).toBe('file:')
  })

  it('accepts a URL instance as the current base', () => {
    const target = resolveRedirectTarget(new URL('http://example.com/a/b'), '../c')
    expect(target?.toString()).toBe('http://example.com/c')
  })

  it('fails closed on a missing Location', () => {
    expect(resolveRedirectTarget('http://example.com/a', null)).toBeNull()
    expect(resolveRedirectTarget('http://example.com/a', undefined)).toBeNull()
  })

  it('fails closed on a blank Location', () => {
    expect(resolveRedirectTarget('http://example.com/a', '')).toBeNull()
    expect(resolveRedirectTarget('http://example.com/a', '   ')).toBeNull()
  })

  it('fails closed on an unparseable Location with no base', () => {
    // Relative garbage still resolves against a valid base, so use a
    // base that cannot anchor it: a bare word with a bad base.
    expect(resolveRedirectTarget('not a url', 'also not a url')).toBeNull()
  })
})

describe('assertPublicHost — redirect hops are refused with the standard message', () => {
  const refusal = (host: string) => `refusing to fetch a private or local address (${host})`

  it('refuses a loopback redirect target (public → 127.0.0.1)', async () => {
    const target = resolveRedirectTarget('http://example.com/a', 'http://127.0.0.1/admin')
    expect(target).not.toBeNull()
    expect(await assertPublicHost(target!)).toBe(refusal('127.0.0.1'))
  })

  it('refuses an RFC1918 redirect target', async () => {
    expect(await assertPublicHost(new URL('http://10.0.0.5/'))).toBe(refusal('10.0.0.5'))
  })

  it('refuses the cloud-metadata address', async () => {
    expect(await assertPublicHost(new URL('http://169.254.169.254/latest/meta-data/'))).toBe(
      refusal('169.254.169.254'),
    )
  })

  it('refuses IPv6 loopback (bracketed host normalized)', async () => {
    expect(await assertPublicHost(new URL('http://[::1]/'))).toBe(refusal('[::1]'))
  })

  it('refuses localhost by name without a DNS lookup', async () => {
    expect(await assertPublicHost(new URL('http://localhost/'))).toBe(refusal('localhost'))
  })

  it('allows a public IP literal (no refusal)', async () => {
    expect(await assertPublicHost(new URL('http://93.184.216.34/'))).toBeNull()
  })
})

describe('isPrivateAddress sanity (hop guard building block)', () => {
  it('flags loopback, RFC1918, link-local, and ULA', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('10.1.2.3')).toBe(true)
    expect(isPrivateAddress('172.16.0.1')).toBe(true)
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
    expect(isPrivateAddress('169.254.169.254')).toBe(true)
    expect(isPrivateAddress('::1')).toBe(true)
    expect(isPrivateAddress('fd00::1')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
  })

  it('passes public addresses', () => {
    expect(isPrivateAddress('93.184.216.34')).toBe(false)
    expect(isPrivateAddress('8.8.8.8')).toBe(false)
    expect(isPrivateAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false)
  })
})
