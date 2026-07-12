/**
 * In-app update check (AI-IMP-278): a courtesy fetch of the public
 * GitHub releases API at launch and on demand. Deliberately NOT
 * electron-updater — builds are unsigned, so the honest verb is
 * "open the download", never auto-install. A failed launch check is
 * silent (GR-3: a courtesy check's failure is not the user's
 * problem); only the explicit Settings ask surfaces errors.
 */

const RELEASES_LATEST_URL =
  'https://api.github.com/repos/animegolem/expanding-worlds/releases/latest'

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface LatestRelease {
  tag_name: string
  html_url: string
  assets: readonly ReleaseAsset[]
}

export interface UpdateStatus {
  state: 'update-available' | 'up-to-date' | 'error'
  current: string
  latest?: string
  /** Platform asset when one matched, else the release page. */
  downloadUrl?: string
  message?: string
}

/** Semver-ish compare tolerant of a leading v and short tuples:
 * negative when a < b, 0 when equal, positive when a > b. Anything
 * unparseable compares as 0.0.0 (never claims an update). */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .trim()
      .replace(/^v/i, '')
      .split(/[.+-]/, 3)
      .map((part) => {
        const n = Number.parseInt(part, 10)
        return Number.isFinite(n) && n >= 0 ? n : 0
      })
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

const ASSET_SUFFIX: Partial<Record<NodeJS.Platform, string>> = {
  darwin: '.dmg',
  win32: '.exe',
  linux: '.appimage',
}

/** The platform installer when the release carries one; the release
 * page otherwise — never a wrong-platform binary. */
export function pickDownloadUrl(release: LatestRelease, platform: NodeJS.Platform): string {
  const suffix = ASSET_SUFFIX[platform]
  if (suffix) {
    const asset = release.assets.find((entry) => entry.name.toLowerCase().endsWith(suffix))
    if (asset) return asset.browser_download_url
  }
  return release.html_url
}

export async function checkForUpdate(
  currentVersion: string,
  platform: NodeJS.Platform,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateStatus> {
  const current = currentVersion
  try {
    const response = await fetchImpl(RELEASES_LATEST_URL, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      return { state: 'error', current, message: `the release page answered ${response.status}` }
    }
    const release = (await response.json()) as LatestRelease
    if (typeof release?.tag_name !== 'string' || typeof release?.html_url !== 'string') {
      return { state: 'error', current, message: 'the release page answered strangely' }
    }
    const latest = release.tag_name.replace(/^v/i, '')
    if (compareVersions(latest, current) > 0) {
      return {
        state: 'update-available',
        current,
        latest,
        downloadUrl: pickDownloadUrl({ ...release, assets: release.assets ?? [] }, platform),
      }
    }
    return { state: 'up-to-date', current, latest }
  } catch {
    return { state: 'error', current, message: 'couldn’t reach the release page — try again' }
  }
}
