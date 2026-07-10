import { app, BrowserWindow, dialog, ipcMain, net, powerMonitor, protocol, session, utilityProcess, type UtilityProcess } from 'electron'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandEnvelope } from '@ew/commands'
import { assertManagedPath, blobRelativePath, thumbnailRelativePath } from '@ew/persistence'
import { loadAppSettingsFile, writeAppSettingsFile } from './app-settings'
import { assertPublicHost, resolveRedirectTarget } from './net-guard'
import { createSnapshotEngine } from './snapshot'
import { MaterializedProjectOpenRegistry } from './open-capability'
import type {
  ProjectRequest,
  ProjectResponse,
  ServiceStatusEvent,
  SnapshotPushState,
  UtilityEnvelope,
  UtilityMessage,
} from '@ew/protocol'

/**
 * Main process: window lifecycle and narrow IPC routing only
 * (RFC-0001 §13.2). All project work lives in the utility process;
 * main forwards requests, correlates responses by envelope id, and
 * fans project-changed events out to every window.
 */

let utility: UtilityProcess | null = null
let nextId = 0

interface PendingCall {
  resolve: (response: ProjectResponse) => void
  request: ProjectRequest
}
const pending = new Map<number, PendingCall>()
let restartAttempted = false

/** Error response matching the request's shape, so callers see a
 * structured failure instead of a promise that never settles
 * (AI-IMP-053: a dead utility used to hang every Project API call). */
function deadResponse(request: ProjectRequest, message: string): ProjectResponse {
  switch (request.type) {
    case 'execute-command':
      return {
        type: 'execute-command',
        result: {
          status: 'error',
          commandId: request.envelope.commandId,
          code: 'UTILITY_DIED',
          message,
        },
      }
    case 'close-project':
      // Nothing left to close.
      return { type: 'close-project', ok: true }
    case 'ping':
      return { pong: false, from: 'utility' } as unknown as ProjectResponse
    default:
      return { type: request.type, ok: false, code: 'UTILITY_DIED', message } as ProjectResponse
  }
}

// Cold-boot init resolves before App mounts (the renderer gates its
// mount on initSettings), so the event carrying the recovery summary
// — or a boot refusal — fires into a room with no listener. Retain
// the latest event; the renderer PULLS it when it attaches
// (project:service-current), then stays subscribed (AI-IMP-106).
let lastServiceEvent: ServiceStatusEvent | null = null

function broadcastService(event: ServiceStatusEvent): void {
  lastServiceEvent = event
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('project:service', event)
  }
}

function onUtilityDied(reason: string): void {
  utility = null
  projectReady = false
  // The secondary slots died with the process; asset requests
  // carrying ?scope must 404 rather than read a stale root.
  secondaryDirs.clear()
  for (const call of pending.values()) call.resolve(deadResponse(call.request, reason))
  pending.clear()
  if (restartAttempted) {
    console.error('[main] utility died again before recovering:', reason)
    broadcastService({ status: 'failed', message: reason })
    return
  }
  restartAttempted = true
  console.error('[main] utility died, restarting:', reason)
  broadcastService({ status: 'restarting', message: reason })
  startUtility()
  void callUtility({
    type: 'init-project',
    dir: projectDir(),
    createIfMissing: true,
    title: 'Untitled Project',
  }).then((response) => {
    if ('ok' in response && response.ok === false) {
      broadcastService({ status: 'failed', message: response.message })
      return
    }
    projectReady = true
    restartAttempted = false
    broadcastService(
      'recovery' in response
        ? { status: 'ok', recovery: response.recovery }
        : { status: 'ok' },
    )
  })
}

function startUtility(): void {
  const proc = utilityProcess.fork(join(__dirname, 'utility.cjs'), [], {
    serviceName: 'ew-project-service',
  })
  utility = proc
  proc.on('message', (message: UtilityMessage) => {
    if (message.kind === 'response') {
      const call = pending.get(message.id)
      if (call) {
        pending.delete(message.id)
        call.resolve(message.payload)
      }
      return
    }
    if (message.kind === 'thumbnail-ready') {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('asset:thumbnail-ready', {
          assetId: message.assetId,
          contentHash: message.contentHash,
        })
      }
      return
    }
    if (message.kind === 'export-progress') {
      // §16 export progress (AI-IMP-157): fan out to the Settings
      // surface; an export is not project activity for the idle clock.
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('export:progress', message.progress)
      }
      return
    }
    // §11.4 idle cadence: a committed change is activity — it resets
    // the idle-checkpoint timer (the command gateway's commit stream).
    snapshots.noteActivity()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('project:event', message.event)
    }
  })
  proc.on('exit', (code) => {
    // Deliberate shutdown kills the utility; only unexpected exits
    // trigger recovery.
    if (utility !== proc || closingCleanly) return
    onUtilityDied(`project service exited unexpectedly (code ${code})`)
  })
}

function callUtility(payload: ProjectRequest): Promise<ProjectResponse> {
  return new Promise((resolve) => {
    if (!utility) {
      resolve(deadResponse(payload, 'the project service is not running'))
      return
    }
    const id = ++nextId
    pending.set(id, { resolve, request: payload })
    utility.postMessage({ id, payload } satisfies UtilityEnvelope<ProjectRequest>)
  })
}

/** §11.4 restore (AI-IMP-121): Open Restored Project relaunches the app
 * pointed at the materialized sibling directory by appending a
 * `--ew-open-dir=` arg; it wins over everything so the reboot lands on
 * the restored project. Otherwise the env override (e2e) or the fixed
 * default apply. */
const OPEN_DIR_ARG = '--ew-open-dir='

function projectDir(): string {
  const arg = process.argv.find((a) => a.startsWith(OPEN_DIR_ARG))
  if (arg) return arg.slice(OPEN_DIR_ARG.length)
  return process.env['EW_PROJECT_DIR'] ?? join(app.getPath('userData'), 'projects', 'default')
}

/** CA-004: return a user-facing refusal string if `destPath` lands
 * inside the active project directory, else null. Compares realpaths so
 * a symlink can't dodge the check; the dest file may not exist yet, so
 * its PARENT is resolved (falling back to a lexical resolve when the
 * parent itself is a not-yet-created directory). */
function destInsideProject(destPath: string): string | null {
  let projectReal: string
  try {
    projectReal = realpathSync(projectDir())
  } catch {
    return null // no project dir on disk yet — nothing to protect
  }
  let destDirReal: string
  try {
    destDirReal = realpathSync(dirname(destPath))
  } catch {
    // Parent not yet created: a non-existent directory can't be the live
    // project, but resolve lexically so a `<project>/new/x.ewproj` pick
    // is still caught.
    destDirReal = dirname(resolve(destPath))
  }
  const prefix = projectReal.endsWith(sep) ? projectReal : projectReal + sep
  if (destDirReal === projectReal || destDirReal.startsWith(prefix)) {
    return 'Choose a location outside the project folder — exporting into the project itself could overwrite your live data.'
  }
  return null
}

/** §14.4 create-new library (AI-IMP-094): the default location the
 * gallery's create path proposes. Env override mirrors projectDir's —
 * e2e must not write into the real userData. */
function defaultLibraryDir(): string {
  return process.env['EW_LIBRARY_DIR'] ?? join(app.getPath('userData'), 'projects', 'library')
}

/** The bundled seed-image set for the first-open library example
 * (AI-IMP-094). Dev and e2e resolve relative to the built main entry
 * (out/main/ → ../../resources/seed; app.getAppPath() is unreliable
 * when Electron is launched pointing at the entry file, as e2e
 * does); a packaged app expects the directory under
 * process.resourcesPath (electron-builder extraResources). */
function seedResourcesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'seed')
    : join(__dirname, '..', '..', 'resources', 'seed')
}

// ---- §14.4 secondary store roots (AI-IMP-089) ----
// The ew-asset protocol serves the PRIMARY project's store; a
// `?scope=source` query re-roots a request at the open secondary's
// directory instead. Main records target→dir on a successful
// secondary open (the utility owns the slot; this map only mirrors
// where its store lives) and forgets it on close, on project close,
// and on utility death — the slots die with the process.
const secondaryDirs = new Map<'source' | 'library', string>()

/** Resolve an ew-asset request's serving root from its `scope`
 * query param: absent → the primary project; `source` → the open
 * source slot's dir; anything else (or a closed slot) → null, which
 * the handler answers 404 — the renderer's ordinary fallback path. */
function assetScopeDir(url: string): string | null {
  const q = url.indexOf('?')
  if (q === -1) return projectDir()
  const scope = new URLSearchParams(url.slice(q + 1)).get('scope')
  if (scope === null) return projectDir()
  if (scope === 'source') return secondaryDirs.get('source') ?? null
  return null
}

// ---- §11.5 app-tier settings (AI-IMP-074) ----
// Preferences that follow the application rather than any project:
// one flat JSON file in the configuration directory, loaded once,
// rewritten whole on every set (a handful of keys). Defaults live in
// the renderer store; a missing file is simply empty (fresh install).
// The env override keeps e2e app instances out of the real user
// config. The file-level read/write logic (atomic write, corrupt-file
// recovery — CA-015/AI-IMP-237) lives in the electron-free
// `app-settings.ts` so it unit-tests without an Electron `app`
// instance; this module owns the in-memory cache, the IPC surface,
// and cross-window broadcast.

function appConfigDir(): string {
  return process.env['EW_APP_CONFIG_DIR'] ?? app.getPath('userData')
}

const APP_SETTINGS_FILENAME = 'app-settings.json'
let appSettings: Record<string, unknown> | null = null
// Set when loadAppSettings() had to recover from a corrupt file;
// app-settings:get consumes (reads and clears) it once so the
// renderer's one boot-time read surfaces exactly one recovery toast.
let appSettingsRecovered = false

function appSettingsPath(): string {
  return join(appConfigDir(), APP_SETTINGS_FILENAME)
}

function loadAppSettings(): Record<string, unknown> {
  if (appSettings) return appSettings
  const loaded = loadAppSettingsFile(appSettingsPath())
  appSettings = loaded.settings
  if (loaded.recovered) appSettingsRecovered = true
  return appSettings
}

interface SetAppSettingResult {
  ok: boolean
  message?: string
}

function setAppSetting(key: string, value: unknown): SetAppSettingResult {
  const settings = loadAppSettings()
  const hadKey = Object.prototype.hasOwnProperty.call(settings, key)
  const previous = settings[key]
  settings[key] = value
  try {
    writeAppSettingsFile(appSettingsPath(), settings)
  } catch (err) {
    // Roll back the in-memory copy so main's cache doesn't disagree
    // with the file it failed to write; the renderer performs the
    // matching optimistic-value revert on a failed result.
    if (hadKey) settings[key] = previous
    else delete settings[key]
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  // Cross-window sync: every window (including the writer, which
  // already applied optimistically and dedupes) hears the change.
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app-settings:changed', { key, value })
  }
  return { ok: true }
}

/**
 * ew-asset://<sha256>: managed blobs for the sandboxed renderer
 * (RFC-0001 §11.1 — the renderer never reads project storage
 * directly). Content-addressed, so responses are immutable forever.
 */
let projectReady = false
// The trailing query tolerates the renderer's ?v= cache-bust on
// thumbnail-ready repaints (PR #3 review) and the ?scope=source
// store re-root (AI-IMP-089): same guard, params handled after.
const ASSET_URL_RE = /^ew-asset:\/\/([0-9a-f]{64})\/?(?:\?[^#]*)?$/
const THUMB_URL_RE = /^ew-asset:\/\/([0-9a-f]{64})\/thumb\/?(?:\?[^#]*)?$/

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ew-asset',
    privileges: { secure: true, stream: true, supportFetchAPI: true, corsEnabled: true },
  },
])

function registerAssetProtocol(): void {
  protocol.handle('ew-asset', async (request) => {
    if (!projectReady) return new Response('no project open', { status: 503 })
    // <hash>/thumb serves the WebP derivative (AI-IMP-076); 404 when
    // not (yet) generated — the renderer falls back to the original.
    // Derivatives regenerate, so no immutable cache header here.
    // `?scope=source` re-roots the request at the open secondary's
    // store (AI-IMP-089); a closed slot answers 404 like a missing
    // file — the renderer's fallback chain already absorbs it.
    const servingDir = assetScopeDir(request.url)
    if (servingDir === null) return new Response('no such scope', { status: 404 })
    const thumb = THUMB_URL_RE.exec(request.url)
    if (thumb) {
      try {
        const path = assertManagedPath(
          servingDir,
          join(servingDir, thumbnailRelativePath(thumb[1]!)),
        )
        const file = await net.fetch(
          pathToFileURL(path).toString(),
        )
        if (!file.ok) return new Response('no thumbnail', { status: 404 })
        return new Response(file.body, {
          headers: {
            'content-type': 'image/webp',
            'cache-control': 'public, max-age=3600',
            'access-control-allow-origin': '*',
          },
        })
      } catch {
        return new Response('no thumbnail', { status: 404 })
      }
    }
    const match = ASSET_URL_RE.exec(request.url)
    // The regex is the traversal guard: only a bare hex hash resolves.
    if (!match) return new Response('bad asset url', { status: 400 })
    const path = assertManagedPath(servingDir, join(servingDir, blobRelativePath(match[1]!)))
    try {
      const file = await net.fetch(pathToFileURL(path).toString())
      if (!file.ok) return new Response('unknown asset', { status: 404 })
      return new Response(file.body, {
        headers: {
          'cache-control': 'public, max-age=31536000, immutable',
          // Blobs are content-addressed and non-secret within the app;
          // the page origin (file:// or the dev server) may read them.
          'access-control-allow-origin': '*',
        },
      })
    } catch {
      return new Response('unknown asset', { status: 404 })
    }
  })
}

// ---- URL fetch for import (RFC-0001 §6.1, AI-IMP-020) ----
// A URL-only drop fetches over the network as a user-initiated act;
// main does the fetch because the renderer is sandboxed. Non-image or
// oversized bodies are rejected here so no bytes reach the pipeline.

const FETCH_URL_TIMEOUT_MS = 30_000
const FETCH_URL_MAX_BYTES = 100 * 1024 * 1024
// AI-IMP-124: cap the manual redirect chain. Every hop is re-guarded
// before a request reaches it, so this only bounds redirect loops.
const FETCH_URL_MAX_REDIRECTS = 5

/** Minimal magic-byte check for the Phase 1 raster formats (§4.7).
 * Deliberately re-implemented here: main must not depend on
 * persistence internals, and the authoritative sniff still runs in
 * the import pipeline. */
function looksLikeImage(bytes: Uint8Array): boolean {
  const at = (i: number): number => bytes[i] ?? -1
  const ascii = (offset: number, text: string): boolean =>
    [...text].every((ch, i) => at(offset + i) === ch.charCodeAt(0))
  if (at(0) === 0x89 && ascii(1, 'PNG')) return true
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return true
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return true
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return true
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return true
  return false
}

function filenameForUrl(url: URL, disposition: string | null): string {
  const match = disposition ? /filename\*?=(?:utf-8'')?"?([^";]+)"?/i.exec(disposition) : null
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      return match[1]
    }
  }
  const base = url.pathname.split('/').filter((part) => part.length > 0).pop()
  if (!base) return 'downloaded-image'
  try {
    return decodeURIComponent(base)
  } catch {
    return base
  }
}

export type FetchUrlForImportResult =
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; message: string }

/** Outcome of a single, non-redirect-following request (one hop). */
type FetchHopResult =
  | { kind: 'redirect'; location: string }
  | {
      kind: 'final'
      statusCode: number
      contentType: string
      disposition: string | null
      bytes: Uint8Array
    }
  | { kind: 'oversize' }
  | { kind: 'aborted' }

/**
 * Issue exactly one request with redirects disabled. A redirect
 * surfaces as `{ kind: 'redirect' }` carrying the target so the caller
 * can re-guard it before following (AI-IMP-124); net.fetch cannot do
 * this — its redirect:'manual' throws without exposing the Location,
 * and followRedirect() must run synchronously, before an async
 * assertPublicHost could clear the hop. The whole-chain AbortController
 * aborts the in-flight request on timeout or oversize.
 */
function fetchOneHop(target: string, signal: AbortSignal): Promise<FetchHopResult> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url: target, redirect: 'manual' })
    let settled = false
    const onAbort = () => request.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    const done = (result: FetchHopResult): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const fail = (err: unknown): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
    const headerValue = (headers: Record<string, string | string[]>, name: string): string | null => {
      const value = headers[name]
      if (value == null) return null
      return Array.isArray(value) ? (value[0] ?? null) : value
    }
    request.on('redirect', (_statusCode, _method, redirectUrl) => {
      // Stop before the socket follows; the caller re-guards the target.
      request.abort()
      done({ kind: 'redirect', location: redirectUrl })
    })
    request.on('response', (response) => {
      const declared = Number(headerValue(response.headers, 'content-length') ?? '0')
      if (declared > FETCH_URL_MAX_BYTES) {
        request.abort()
        done({ kind: 'oversize' })
        return
      }
      const chunks: Uint8Array[] = []
      let total = 0
      response.on('data', (chunk: Buffer) => {
        total += chunk.byteLength
        if (total > FETCH_URL_MAX_BYTES) {
          request.abort()
          done({ kind: 'oversize' })
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        done({
          kind: 'final',
          statusCode: response.statusCode,
          contentType: headerValue(response.headers, 'content-type') ?? '',
          disposition: headerValue(response.headers, 'content-disposition'),
          bytes,
        })
      })
      response.on('error', (err) => fail(err))
    })
    request.on('error', (err) => {
      if (signal.aborted) done({ kind: 'aborted' })
      else fail(err)
    })
    request.end()
  })
}

async function fetchUrlForImport(rawUrl: string): Promise<FetchUrlForImportResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, message: `not a valid URL: ${rawUrl}` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'only http(s) URLs can be fetched for import' }
  }
  // The env bypass exists solely for e2e fixtures that serve test
  // images from 127.0.0.1; it must suppress the guard on every hop.
  const bypassGuard = process.env['EW_TEST_ALLOW_PRIVATE_FETCH'] === '1'
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), FETCH_URL_TIMEOUT_MS)
  try {
    let current = url
    // Follow redirects by hand so the SSRF guard (AI-IMP-057/124) runs
    // on the initial URL AND every redirect target before any request
    // reaches it: a public URL that 302s to loopback/RFC1918/metadata
    // is refused with the same message as a direct hit. Only the DNS
    // TOCTOU stays accepted (documented in net-guard.ts).
    for (let hopIndex = 0; ; hopIndex++) {
      if (!bypassGuard) {
        const refusal = await assertPublicHost(current)
        if (refusal) return { ok: false, message: refusal }
      }
      const hop = await fetchOneHop(current.toString(), abort.signal)
      if (hop.kind === 'aborted') {
        return { ok: false, message: `fetch timed out after ${FETCH_URL_TIMEOUT_MS / 1000} s` }
      }
      if (hop.kind === 'oversize') {
        return { ok: false, message: 'the response exceeds the 100 MB import limit' }
      }
      if (hop.kind === 'redirect') {
        if (hopIndex >= FETCH_URL_MAX_REDIRECTS) {
          return { ok: false, message: `fetch failed: too many redirects for ${rawUrl}` }
        }
        const target = resolveRedirectTarget(current, hop.location)
        if (!target) {
          return { ok: false, message: `fetch failed: invalid redirect from ${current.toString()}` }
        }
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
          return { ok: false, message: 'only http(s) URLs can be fetched for import' }
        }
        current = target
        continue
      }
      // hop.kind === 'final'
      if (hop.statusCode < 200 || hop.statusCode >= 300) {
        return { ok: false, message: `fetch failed: HTTP ${hop.statusCode} for ${current.toString()}` }
      }
      if (!hop.contentType.toLowerCase().startsWith('image/') && !looksLikeImage(hop.bytes)) {
        return { ok: false, message: `the URL did not return an image: ${current.toString()}` }
      }
      return { ok: true, bytes: hop.bytes, filename: filenameForUrl(current, hop.disposition) }
    }
  } catch (err) {
    if (abort.signal.aborted) {
      return { ok: false, message: `fetch timed out after ${FETCH_URL_TIMEOUT_MS / 1000} s` }
    }
    return {
      ok: false,
      message: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** §4.9 rev 0.13: the type row enumerates installed fonts through
 * Chromium's Local Font Access API; grant it for our own renderer
 * (there is no third-party content in the window). */
function grantLocalFonts(): void {
  // Electron's TS union lags Chromium's permission set; compare as
  // strings.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback((permission as string) === 'local-fonts')
  })
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => (permission as string) === 'local-fonts',
  )
}

// E2E sweeps launch many sequential app instances; visible windows
// steal OS focus on every launch. With this flag the window never
// shows (CDP input and rendering still work) and rAF/timers keep
// running via backgroundThrottling: false.
const hiddenTestWindows = process.env['EW_TEST_HIDDEN_WINDOWS'] === '1'

// RFC §8.2 "the shell eats the window" (rev 0.64, signature-pin pass):
// frameless on every platform so the board paints edge-to-edge and the
// hover-revealed title strip is the only drag handle.
//   - macOS: hide the titlebar but keep the traffic lights, dropped INTO
//     the board over the strip band (trafficLightPosition).
//   - Windows: titleBarStyle:'hidden' + titleBarOverlay gives a frameless
//     look while the OS still draws reachable min/max/close (top-right).
//     The overlay is transparent so the smoky strip shows through; the
//     glyph colour is a light neutral for the near-black band.
//   - Linux: titleBarOverlay is unsupported, so frame:false + the strip's
//     own drawn min/max/close wired over window:* IPC (see below).
// UNTESTED off macOS: only the darwin branch runs on this hardware; the
// Windows/Linux branches follow documented Electron behaviour.
//
// E2E gate: the hidden-window suite (EW_TEST_HIDDEN_WINDOWS=1) launches
// many sequential invisible windows. Frameless options were verified not
// to perturb that suite on macOS, so they stay ON under test — a real
// frameless window is what ships. If a future platform's frameless config
// ever destabilises the suite, disable this for hiddenTestWindows and say
// so loudly in the ticket rather than silently masking it.
function framelessWindowOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    // AI-IMP-196: acceptFirstMouse so a click that activates a not-key
    // window ALSO acts. Without it macOS swallows the first click for
    // activation, so a control clicked in an inactive window (the owner-
    // reported gallery picker on a selected frame) appears dead — the
    // pick never lands. "The window is the board": a click should always
    // do the thing under it, key or not. macOS-only option.
    return { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 13 }, acceptFirstMouse: true }
  }
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#00000000', symbolColor: '#c8ccd2', height: 34 },
    }
  }
  // linux and anything else: bare frameless; controls live in the strip.
  return { frame: false }
}

function setWindowVibrancy(win: BrowserWindow, enabled: boolean): boolean {
  if (!enabled) {
    if (process.platform === 'darwin') win.setVibrancy(null)
    win.setBackgroundColor('#17191d')
    return true
  }
  if (process.platform !== 'darwin') return false
  try {
    win.setBackgroundColor('#00000000')
    win.setVibrancy('under-window')
    return true
  } catch (err) {
    win.setVibrancy(null)
    win.setBackgroundColor('#17191d')
    console.error('[main] failed to enable vibrancy:', err)
    return false
  }
}

// §11.4 involuntary end-session ritual (AI-IMP-096): the OS sleeping
// or locking, or the window losing focus long enough, is a natural
// rest point. Flush the renderer's editor buffers (the same round-trip
// the quit path uses, §10.2) then checkpoint the WAL so the .sqlite is
// complete at rest — a cloud daemon must never sync a live -wal. This
// path NEVER blocks quit (it does not touch the close handler) and
// NEVER throws: callUtility already returns typed dead responses, and
// a checkpoint failure is the utility's to report, not ours to raise.

/** The renderer commits pending editor buffers on app:flush and acks
 * with app:flush-done; bounded so a hung or dead renderer cannot trap
 * the checkpoint. Mirrors the close path's timeout, but its own
 * listener so it never entangles the quit flush. */
function flushRenderers(): Promise<void> {
  const wins = BrowserWindow.getAllWindows().filter((win) => !win.webContents.isDestroyed())
  if (wins.length === 0) return Promise.resolve()
  return new Promise<void>((resolve) => {
    let remaining = wins.length
    const finish = (): void => {
      clearTimeout(timer)
      ipcMain.removeListener('app:flush-done', onDone)
      resolve()
    }
    const onDone = (): void => {
      remaining -= 1
      if (remaining <= 0) finish()
    }
    const timer = setTimeout(finish, 2_000)
    ipcMain.on('app:flush-done', onDone)
    for (const win of wins) win.webContents.send('app:flush')
  })
}

// §11.4 session snapshots (AI-IMP-120): the engine owns git mechanics
// and the idle timer; it delegates every DB touch (WAL checkpoint,
// notes-tree write) back through callUtility so the utility's project
// service stays the single writer. A 'rest' snapshot preserves the
// AI-IMP-096 flush+checkpoint behavior and adds a commit when the
// per-project setting is on.
const snapshots = createSnapshotEngine({
  callUtility,
  flushRenderers,
  projectDir,
  // §11.4/§8.6 remote push (AI-IMP-122): the background push's state
  // reaches the renderers here — the ongoing-push perch and the
  // once-per-episode failure toast live renderer-side (chrome/status).
  onPushState: (state) => broadcastPushState(state),
})
const materializedProjectOpens = new MaterializedProjectOpenRegistry()

// Last push state, retained so a window created after a push began can
// catch up on attach (the same cold-boot race the service event has).
let lastPushState: SnapshotPushState | null = null
function broadcastPushState(state: SnapshotPushState): void {
  lastPushState = state
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('snapshot:push-state', state)
  }
}

// Blur debounce: tabbing to a reference board must not thrash the
// disk. A blur arms a single 30s timer; a focus before it fires
// cancels it (the app never left); a second blur while one is armed
// keeps the existing timer rather than resetting it.
const BLUR_CHECKPOINT_DELAY_MS = 30_000
let blurTimer: ReturnType<typeof setTimeout> | null = null

function scheduleBlurCheckpoint(): void {
  if (blurTimer) return
  blurTimer = setTimeout(() => {
    blurTimer = null
    void snapshots.runSnapshot('rest')
  }, BLUR_CHECKPOINT_DELAY_MS)
}

function cancelBlurCheckpoint(): void {
  if (!blurTimer) return
  clearTimeout(blurTimer)
  blurTimer = null
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Expanding Worlds',
    show: !hiddenTestWindows,
    ...framelessWindowOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      ...(hiddenTestWindows ? { backgroundThrottling: false } : {}),
    },
  })

  // §10.2 quit flush: hold the close until the renderer commits any
  // editor buffer still inside its debounce window, bounded so a hung
  // renderer can never trap the user.
  let flushed = false
  win.on('close', (event) => {
    if (flushed || win.webContents.isDestroyed()) return
    event.preventDefault()
    const ack = new Promise<void>((resolve) => {
      ipcMain.once('app:flush-done', () => resolve())
    })
    win.webContents.send('app:flush')
    void Promise.race([ack, new Promise((resolve) => setTimeout(resolve, 2_000))]).then(() => {
      flushed = true
      win.close()
    })
  })

  // §8.1 gesture-first Back/Forward: the macOS three-finger swipe and
  // Windows mouse X-buttons arrive as window events; the renderer
  // owns the history, so just forward the intent. (Swipe direction is
  // the finger direction: swiping right pulls the previous board
  // back, Safari-style.)
  win.on('swipe', (_event, direction) => {
    if (direction === 'right') win.webContents.send('nav:gesture', 'back')
    else if (direction === 'left') win.webContents.send('nav:gesture', 'forward')
  })
  win.on('app-command', (_event, command) => {
    if (command === 'browser-backward') win.webContents.send('nav:gesture', 'back')
    else if (command === 'browser-forward') win.webContents.send('nav:gesture', 'forward')
  })

  // §11.4 involuntary checkpoint (AI-IMP-096): a sustained blur is a
  // natural rest point. Focus (returning to the app) cancels a pending
  // checkpoint; the 30s debounce lives in the module-level timer.
  win.on('blur', scheduleBlurCheckpoint)
  win.on('focus', cancelBlurCheckpoint)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) await win.loadURL(devUrl)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  if (hiddenTestWindows) app.dock?.hide()
  registerAssetProtocol()
  grantLocalFonts()
  startUtility()
  void callUtility({
    type: 'init-project',
    dir: projectDir(),
    createIfMissing: true,
    title: 'Untitled Project',
  }).then((response) => {
    if ('ok' in response && !response.ok) {
      console.error('[main] project init failed:', response)
      // A cold-boot refusal (EW_SCHEMA_AHEAD, lock held, …) must
      // reach the user, not just the console (AI-IMP-106).
      broadcastService({ status: 'failed', message: response.message })
      return
    }
    projectReady = true
    // §11.4 git-ready projects: seed the ignore file so the directory
    // is commit-safe regardless of the snapshot setting (idempotent —
    // covers create and every subsequent open of a pre-snapshot project).
    snapshots.seedGitignore(projectDir())
    // Windows racing a slow open need the same ready signal the
    // recovery path sends — the renderer's thumbnail drive (076)
    // re-kicks on it, and a window created after this broadcast
    // is covered by its own boot kick.
    broadcastService(
      'recovery' in response
        ? { status: 'ok', recovery: response.recovery }
        : { status: 'ok' },
    )
  })

  ipcMain.handle('project:service-current', () => lastServiceEvent)

  // §11.4 Settings readout (AI-IMP-120): git presence + the backup's
  // disk size, computed lazily when the Settings sheet opens. The mode
  // enum itself rides the ordinary project-setting verbs (getSettings /
  // set-setting), so no bespoke handler is needed for it.
  ipcMain.handle('snapshot:status', () => snapshots.status())
  // §11.4 remote push (AI-IMP-122): the deliberate Test connection
  // action (git ls-remote) and the retained push state for attach-time
  // catch-up. Test connection is the ONLY network call the user
  // triggers by hand; the push itself rides the snapshot ritual.
  ipcMain.handle('snapshot:test-connection', (_event, url: string) =>
    snapshots.testConnection(String(url)),
  )
  ipcMain.handle('snapshot:push-state-current', () => lastPushState)

  // §11.4 restore-from-backup (AI-IMP-121): the dated snapshot list and
  // the materialize-to-sibling action ride the engine's git mechanics.
  // Restore NEVER writes inside the source project (destroy-nothing
  // applies to time travel); it returns the NEW directory's path.
  ipcMain.handle('snapshot:list', () => snapshots.listSnapshots())
  ipcMain.handle('snapshot:restore', async (event, sha: string) => {
    const result = await snapshots.restore(String(sha))
    return result.ok
      ? { ...result, openToken: materializedProjectOpens.issue(event.sender, result.dir) }
      : result
  })
  // Open Restored/Imported Project: consume the one-use authority main
  // issued when it materialized the directory. The renderer can display
  // the path but cannot aim relaunch at an arbitrary writable directory.
  // app.quit runs the clean-close ritual first so the current project's
  // writer lock releases (§11.1) before the reboot lands.
  ipcMain.handle('restore:open', (event, openToken: unknown) => {
    const dir = materializedProjectOpens.consume(event.sender, openToken)
    if (!dir) return false
    const args = process.argv
      .slice(1)
      .filter((a) => !a.startsWith(OPEN_DIR_ARG))
      .concat([`${OPEN_DIR_ARG}${dir}`])
    app.relaunch({ args })
    app.quit()
    return true
  })

  // §16 portable export (AI-IMP-157; hardened AI-IMP-229/CA-004): main
  // owns BOTH the save dialog and the forward to the utility, fused into
  // one call. The renderer never names a path, so a renderer bug or
  // compromise can no longer aim the exporter at the live database or
  // any other user-writable file (the confused-deputy break). The utility
  // knows no windows; the archive streams there.
  ipcMain.handle('export:choose-and-run', async (event, activeOnly: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const title = (await callUtility({ type: 'run-query', name: 'getProject' })) as {
      ok?: boolean
      result?: { title?: string }
    }
    const suggested =
      typeof title?.result?.title === 'string' && title.result.title.length > 0
        ? title.result.title.replaceAll('/', '-')
        : 'project'
    const picked = await dialog.showSaveDialog(win, {
      title: 'Export project',
      defaultPath: `${suggested}.ewproj`,
      filters: [{ name: 'Expanding Worlds project', extensions: ['ewproj'] }],
    })
    if (picked.canceled || !picked.filePath) return null
    const destPath = picked.filePath
    // CA-004: refuse a destination inside the active project directory.
    // Exporting reads the LIVE project; writing the archive back into it
    // (or over a managed file) is the very overwrite this ticket closes,
    // and it also invites the snapshot self-duplication of CA-010.
    const refusal = destInsideProject(destPath)
    if (refusal) {
      return { type: 'export-project', ok: false, code: 'DEST_IN_PROJECT', message: refusal }
    }
    return callUtility({ type: 'export-project', destPath, activeOnly: activeOnly === true })
  })
  ipcMain.handle('export:estimate', () => callUtility({ type: 'export-estimate' }))
  // §16 import (AI-IMP-158): pick the archive, land the project as a
  // collision-safe sibling of the current one, then offer the
  // existing restore:open relaunch to enter it.
  ipcMain.handle('import:choose-archive', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const picked = await dialog.showOpenDialog(win, {
      title: 'Import project',
      properties: ['openFile'],
      filters: [{ name: 'Expanding Worlds project', extensions: ['ewproj'] }],
    })
    return picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]
  })
  ipcMain.handle('import:run', async (event, archivePath: string) => {
    const parent = dirname(projectDir())
    const stem = basename(String(archivePath)).replace(/\.ewproj$/i, '') || 'project'
    const date = new Date().toISOString().slice(0, 10)
    let destDir = join(parent, `${stem}-imported-${date}`)
    for (let n = 2; existsSync(destDir) || existsSync(`${destDir}.partial`); n += 1) {
      destDir = join(parent, `${stem}-imported-${date} (${n})`)
    }
    const result = await callUtility({
      type: 'import-project',
      archivePath: String(archivePath),
      destDir,
    })
    return 'type' in result && result.type === 'import-project' && result.ok
      ? { ...result, openToken: materializedProjectOpens.issue(event.sender, result.dir) }
      : result
  })
  ipcMain.handle('app:get-version', () => app.getVersion())

  ipcMain.handle('window:set-vibrancy', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? setWindowVibrancy(win, Boolean(enabled)) : false
  })

  // §8.2 frameless shell: Linux has no OS-drawn window controls under
  // frame:false, so the title strip draws its own min/max/close and
  // routes the intent here. macOS (traffic lights) and Windows
  // (titleBarOverlay) keep their native controls and never call these.
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('project:ping', () => callUtility({ type: 'ping' }))
  ipcMain.handle('project:execute', (_event, envelope: CommandEnvelope) =>
    callUtility({ type: 'execute-command', envelope }),
  )
  ipcMain.handle('project:query', (_event, name: string, args: unknown) =>
    callUtility({ type: 'run-query', name, args }),
  )
  ipcMain.handle(
    'project:import-asset',
    (_event, input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string }) =>
      callUtility({
        type: 'import-asset',
        bytes: input.bytes,
        originalFilename: input.originalFilename,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      }),
  )
  ipcMain.handle('project:fetch-url', (_event, url: string) => fetchUrlForImport(String(url)))
  ipcMain.handle('project:claim-thumbnail-job', () => callUtility({ type: 'claim-thumbnail-job' }))
  ipcMain.handle(
    'project:submit-thumbnail',
    (_event, input: { jobId: string; bytes: Uint8Array | null }) =>
      callUtility({
        type: 'submit-thumbnail',
        jobId: input.jobId,
        bytes: input.bytes,
      }),
  )
  ipcMain.handle('project:set-setting', async (_event, key: string, value: unknown) => {
    const response = await callUtility({ type: 'set-setting', key: String(key), value })
    if ('ok' in response && response.ok) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('project:setting-changed', { key, value })
      }
    }
    return response
  })
  // §14.4 secondary slots (AI-IMP-088): source (read-only browse)
  // and library (writable mirror target) ride the same utility.
  ipcMain.handle(
    'secondary:open',
    async (
      _event,
      target: 'source' | 'library',
      dir: string,
      options?: { createIfMissing?: boolean; title?: string },
    ) => {
      // §14.4 create-new library (AI-IMP-094): main resolves the
      // bundled seed dir — the utility knows no app paths.
      const creating = options?.createIfMissing === true
      const response = await callUtility({
        type: 'open-secondary',
        target,
        dir: String(dir),
        ...(creating
          ? { createIfMissing: true, seedDir: seedResourcesDir() }
          : {}),
        ...(options?.title !== undefined ? { title: String(options.title) } : {}),
      })
      // Mirror the slot's store root for the ew-asset scope param
      // (AI-IMP-089). A failed open also clears any prior recording:
      // the utility's replace-on-open closed the old slot first.
      if ('ok' in response && response.ok) secondaryDirs.set(target, String(dir))
      else secondaryDirs.delete(target)
      return response
    },
  )
  ipcMain.handle('library:default-dir', () => defaultLibraryDir())
  ipcMain.handle('secondary:clear-library-example', () =>
    callUtility({ type: 'clear-library-example' }),
  )
  ipcMain.handle('secondary:close', async (_event, target: 'source' | 'library') => {
    const response = await callUtility({ type: 'close-secondary', target })
    secondaryDirs.delete(target)
    return response
  })
  ipcMain.handle(
    'secondary:query',
    (_event, target: 'source' | 'library', name: string, args: unknown) =>
      callUtility({ type: 'secondary-query', target, name, args }),
  )
  ipcMain.handle(
    'secondary:import-asset',
    (
      _event,
      target: 'source' | 'library',
      input: { bytes: Uint8Array; originalFilename: string; sourceUrl?: string },
    ) =>
      callUtility({
        type: 'secondary-import',
        target,
        bytes: input.bytes,
        originalFilename: input.originalFilename,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      }),
  )
  ipcMain.handle(
    'secondary:ingest',
    (
      _event,
      target: 'source' | 'library',
      input: { contentHash: string; border: 'none' | 'all' | string[] },
    ) =>
      callUtility({
        type: 'ingest-from-secondary',
        target,
        contentHash: String(input.contentHash),
        border: input.border,
      }),
  )
  // §14.4 inbox mirror (AI-IMP-092): primary → library, the inverse
  // of secondary:ingest. The utility refuses without an open library
  // slot; the renderer owns opening it lazily.
  ipcMain.handle('secondary:mirror', (_event, input: { contentHash: string }) =>
    callUtility({ type: 'mirror-to-library', contentHash: String(input.contentHash) }),
  )
  ipcMain.handle('app-settings:get', () => {
    const settings = loadAppSettings()
    // CA-015: a corrupt-file recovery is consumed exactly once here —
    // the renderer's one boot-time read turns it into a toast; later
    // reads (a second window, a re-fetch) see a normal result.
    const recovered = appSettingsRecovered
    appSettingsRecovered = false
    const result = recovered ? { ...settings, recovered: true } : settings
    // §19 first-run guide (AI-IMP-145): the e2e suite launches ~19 fresh
    // app-config dirs, so without a suppressor the walkthrough takeover
    // would block board interaction in every spec. playwright.config
    // defaults EW_SUPPRESS_FIRST_RUN=1; the first-run spec opts back in
    // with '0'. Injected on READ only — never persisted, so a real
    // dismissal still writes the flag normally.
    if (process.env['EW_SUPPRESS_FIRST_RUN'] === '1') {
      return { ...result, firstRunSeen: true }
    }
    return result
  })
  ipcMain.handle('app-settings:set', (_event, key: string, value: unknown) => {
    return setAppSetting(String(key), value)
  })
  ipcMain.handle('window:set-opacity', (event, value: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    const opacity = Number(value)
    // §11.5 window opacity: the floor keeps the app from vanishing.
    win.setOpacity(Number.isFinite(opacity) ? Math.min(1, Math.max(0.3, opacity)) : 1)
    return true
  })
  // Recovery e2e only (AI-IMP-053): the handler exists solely when
  // the spec opts in, so a production build can never invoke it.
  if (process.env['EW_TEST_HOOKS'] === '1') {
    ipcMain.handle('test:kill-utility', () => {
      utility?.kill()
      return true
    })
    // AI-IMP-096 e2e only: the window→preload→main→utility→service
    // checkpoint verb round-trip (the involuntary ritual's inner call,
    // minus the untestable-in-CI power event). Gated identically.
    ipcMain.handle('test:checkpoint-wal', () => callUtility({ type: 'checkpoint-wal' }))
    // AI-IMP-120 e2e only: drive one snapshot moment directly, so the
    // spec exercises the full flush→notes→checkpoint→commit path
    // without waiting out a power event or the idle threshold. Gated
    // identically — no production renderer surface triggers snapshots.
    ipcMain.handle('test:snapshot', (_event, trigger: 'idle' | 'rest' | 'end-session') =>
      snapshots.runSnapshot(trigger).then(() => true),
    )
  }

  // §11.4 involuntary end-session (AI-IMP-096): the OS suspending or
  // the screen locking is an immediate rest point — flush + checkpoint
  // at once (no debounce; these are already deliberate).
  powerMonitor.on('suspend', () => void snapshots.runSnapshot('rest'))
  powerMonitor.on('lock-screen', () => void snapshots.runSnapshot('rest'))

  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

let closingCleanly = false
app.on('window-all-closed', () => {
  if (closingCleanly) return
  closingCleanly = true
  const finish = (): void => {
    utility?.kill()
    app.quit()
  }
  // close-project closes the secondaries with it (utility side);
  // the store-root mirror follows.
  secondaryDirs.clear()
  snapshots.dispose()
  // §11.4 quit ritual (AI-IMP-120): take the end-session snapshot
  // BEFORE closing the project — the snapshot needs the live utility
  // for the WAL checkpoint and notes-tree write. runSnapshot resolves
  // even on failure and is time-bounded so a backup hiccup never traps
  // quit; then close the project so the writer lock releases promptly
  // (§11.1) and kill the utility.
  void Promise.race([
    snapshots.runSnapshot('end-session'),
    new Promise((resolve) => setTimeout(resolve, 15_000)),
  ])
    .then(() =>
      Promise.race([
        callUtility({ type: 'close-project' }),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]),
    )
    .then(finish)
})
