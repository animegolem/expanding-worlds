import { app, BrowserWindow, ipcMain, net, protocol, session, utilityProcess, type UtilityProcess } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandEnvelope } from '@ew/commands'
import { blobRelativePath, thumbnailRelativePath } from '@ew/persistence'
import { assertPublicHost } from './net-guard'
import type {
  ProjectRequest,
  ProjectResponse,
  ServiceStatusEvent,
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

function broadcastService(event: ServiceStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('project:service', event)
  }
}

function onUtilityDied(reason: string): void {
  utility = null
  projectReady = false
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
    broadcastService({ status: 'ok' })
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

function projectDir(): string {
  return process.env['EW_PROJECT_DIR'] ?? join(app.getPath('userData'), 'projects', 'default')
}

// ---- §11.5 app-tier settings (AI-IMP-074) ----
// Preferences that follow the application rather than any project:
// one flat JSON file in the configuration directory, loaded once,
// rewritten whole on every set (a handful of keys). Defaults live in
// the renderer store; a missing or corrupt file is simply empty. The
// env override keeps e2e app instances out of the real user config.

function appConfigDir(): string {
  return process.env['EW_APP_CONFIG_DIR'] ?? app.getPath('userData')
}

const APP_SETTINGS_FILENAME = 'app-settings.json'
let appSettings: Record<string, unknown> | null = null

function loadAppSettings(): Record<string, unknown> {
  if (appSettings) return appSettings
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(appConfigDir(), APP_SETTINGS_FILENAME), 'utf8'),
    )
    appSettings =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
  } catch {
    appSettings = {}
  }
  return appSettings
}

function setAppSetting(key: string, value: unknown): void {
  const settings = loadAppSettings()
  settings[key] = value
  mkdirSync(appConfigDir(), { recursive: true })
  writeFileSync(join(appConfigDir(), APP_SETTINGS_FILENAME), JSON.stringify(settings, null, 2))
  // Cross-window sync: every window (including the writer, which
  // already applied optimistically and dedupes) hears the change.
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app-settings:changed', { key, value })
  }
}

/**
 * ew-asset://<sha256>: managed blobs for the sandboxed renderer
 * (RFC-0001 §11.1 — the renderer never reads project storage
 * directly). Content-addressed, so responses are immutable forever.
 */
let projectReady = false
const ASSET_URL_RE = /^ew-asset:\/\/([0-9a-f]{64})\/?$/
// The trailing query tolerates the renderer's ?v= cache-bust on
// thumbnail-ready repaints (PR #3 review): same file, fresh fetch.
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
    const thumb = THUMB_URL_RE.exec(request.url)
    if (thumb) {
      try {
        const file = await net.fetch(
          pathToFileURL(join(projectDir(), thumbnailRelativePath(thumb[1]!))).toString(),
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
    const path = join(projectDir(), blobRelativePath(match[1]!))
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

function filenameForUrl(url: URL, response: Response): string {
  const disposition = response.headers.get('content-disposition')
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
  // SSRF guard (AI-IMP-057): user-initiated, but a dropped link must
  // not poke loopback/private targets. The env bypass exists solely
  // for e2e fixtures that serve test images from 127.0.0.1.
  if (process.env['EW_TEST_ALLOW_PRIVATE_FETCH'] !== '1') {
    const refusal = await assertPublicHost(url)
    if (refusal) return { ok: false, message: refusal }
  }
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), FETCH_URL_TIMEOUT_MS)
  try {
    const response = await net.fetch(url.toString(), { signal: abort.signal })
    if (!response.ok) {
      return { ok: false, message: `fetch failed: HTTP ${response.status} for ${url.toString()}` }
    }
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > FETCH_URL_MAX_BYTES) {
      return { ok: false, message: 'the response exceeds the 100 MB import limit' }
    }
    const chunks: Uint8Array[] = []
    let total = 0
    if (response.body) {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > FETCH_URL_MAX_BYTES) {
          abort.abort()
          return { ok: false, message: 'the response exceeds the 100 MB import limit' }
        }
        chunks.push(value)
      }
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/') && !looksLikeImage(bytes)) {
      return { ok: false, message: `the URL did not return an image: ${url.toString()}` }
    }
    return { ok: true, bytes, filename: filenameForUrl(url, response) }
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

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Expanding Worlds',
    show: !hiddenTestWindows,
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
      return
    }
    projectReady = true
    // Windows racing a slow open need the same ready signal the
    // recovery path sends — the renderer's thumbnail drive (076)
    // re-kicks on it, and a window created after this broadcast
    // is covered by its own boot kick.
    broadcastService({ status: 'ok' })
  })

  ipcMain.handle('window:set-vibrancy', (event, enabled: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? setWindowVibrancy(win, Boolean(enabled)) : false
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
  ipcMain.handle('secondary:open', (_event, target: 'source' | 'library', dir: string) =>
    callUtility({ type: 'open-secondary', target, dir: String(dir) }),
  )
  ipcMain.handle('secondary:close', (_event, target: 'source' | 'library') =>
    callUtility({ type: 'close-secondary', target }),
  )
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
  ipcMain.handle('app-settings:get', () => loadAppSettings())
  ipcMain.handle('app-settings:set', (_event, key: string, value: unknown) => {
    setAppSetting(String(key), value)
    return true
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
  }
  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

let closingCleanly = false
app.on('window-all-closed', () => {
  if (closingCleanly) return
  closingCleanly = true
  // Close the project first so the writer lock releases promptly
  // rather than waiting out the stale-heartbeat window (§11.1).
  const finish = (): void => {
    utility?.kill()
    app.quit()
  }
  void Promise.race([
    callUtility({ type: 'close-project' }),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]).then(finish)
})
