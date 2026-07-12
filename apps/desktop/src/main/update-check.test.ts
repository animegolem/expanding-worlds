import { describe, expect, it } from 'vitest'
import {
  checkForUpdate,
  compareVersions,
  pickDownloadUrl,
  type LatestRelease,
} from './update-check'

describe('compareVersions', () => {
  it.each([
    ['0.24.0', '0.24.0', 0],
    ['v0.25.0', '0.24.0', 1],
    ['0.24.1', '0.24.0', 1],
    ['0.24.0', '0.25.0', -1],
    ['1.0.0', '0.99.9', 1],
    ['0.24', '0.24.0', 0],
    ['garbage', '0.0.0', 0],
    ['0.24.0-beta', '0.24.0', 0],
  ])('%s vs %s → sign %i', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign)
  })
})

const release: LatestRelease = {
  tag_name: 'v0.25.0',
  html_url: 'https://github.com/animegolem/expanding-worlds/releases/tag/v0.25.0',
  assets: [
    { name: 'Expanding.Worlds-0.25.0-arm64.dmg', browser_download_url: 'https://dl/mac.dmg' },
    { name: 'Expanding.Worlds.Setup.0.25.0.exe', browser_download_url: 'https://dl/win.exe' },
    { name: 'Expanding.Worlds-0.25.0.AppImage', browser_download_url: 'https://dl/linux.AppImage' },
  ],
}

describe('pickDownloadUrl', () => {
  it.each([
    ['darwin', 'https://dl/mac.dmg'],
    ['win32', 'https://dl/win.exe'],
    ['linux', 'https://dl/linux.AppImage'],
  ] as const)('%s gets its installer', (platform, url) => {
    expect(pickDownloadUrl(release, platform)).toBe(url)
  })

  it('falls back to the release page when no asset matches', () => {
    expect(pickDownloadUrl({ ...release, assets: [] }, 'win32')).toBe(release.html_url)
    expect(pickDownloadUrl(release, 'freebsd')).toBe(release.html_url)
  })
})

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    })) as unknown as typeof fetch
}

describe('checkForUpdate', () => {
  it('reports an available update with the platform asset', async () => {
    const status = await checkForUpdate('0.24.0', 'win32', fakeFetch(release))
    expect(status).toEqual({
      state: 'update-available',
      current: '0.24.0',
      latest: '0.25.0',
      downloadUrl: 'https://dl/win.exe',
    })
  })

  it('reports up-to-date when running the latest (or newer)', async () => {
    expect((await checkForUpdate('0.25.0', 'darwin', fakeFetch(release))).state).toBe('up-to-date')
    expect((await checkForUpdate('0.26.0', 'darwin', fakeFetch(release))).state).toBe('up-to-date')
  })

  it('reports errors as facts, never as updates', async () => {
    expect((await checkForUpdate('0.24.0', 'win32', fakeFetch({}, 403))).state).toBe('error')
    expect((await checkForUpdate('0.24.0', 'win32', fakeFetch({ nope: true }))).state).toBe('error')
    const throwing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    const status = await checkForUpdate('0.24.0', 'win32', throwing)
    expect(status.state).toBe('error')
    expect(status.message).toMatch(/release page/)
  })
})
