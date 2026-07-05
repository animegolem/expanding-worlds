import { app, BrowserWindow, ipcMain, net, protocol, session, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CommandEnvelope } from '@ew/commands'
import { blobRelativePath } from '@ew/persistence'
import type { ProjectRequest, ProjectResponse, UtilityEnvelope, UtilityMessage } from '@ew/protocol'

/**
 * Main process: window lifecycle and narrow IPC routing only
 * (RFC-0001 §13.2). All project work lives in the utility process;
 * main forwards requests, correlates responses by envelope id, and
 * fans project-changed events out to every window.
 */

let utility: UtilityProcess | null = null
let nextId = 0
const pending = new Map<number, (response: ProjectResponse) => void>()

function startUtility(): void {
  utility = utilityProcess.fork(join(__dirname, 'utility.cjs'), [], {
    serviceName: 'ew-project-service',
  })
  utility.on('message', (message: UtilityMessage) => {
    if (message.kind === 'response') {
      const resolve = pending.get(message.id)
      if (resolve) {
        pending.delete(message.id)
        resolve(message.payload)
      }
      return
    }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('project:event', message.event)
    }
  })
}

function callUtility(payload: ProjectRequest): Promise<ProjectResponse> {
  return new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    utility?.postMessage({ id, payload } satisfies UtilityEnvelope<ProjectRequest>)
  })
}

function projectDir(): string {
  return process.env['EW_PROJECT_DIR'] ?? join(app.getPath('userData'), 'projects', 'default')
}

/**
 * ew-asset://<sha256>: managed blobs for the sandboxed renderer
 * (RFC-0001 §11.1 — the renderer never reads project storage
 * directly). Content-addressed, so responses are immutable forever.
 */
let projectReady = false
const ASSET_URL_RE = /^ew-asset:\/\/([0-9a-f]{64})\/?$/

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ew-asset',
    privileges: { secure: true, stream: true, supportFetchAPI: true, corsEnabled: true },
  },
])

function registerAssetProtocol(): void {
  protocol.handle('ew-asset', async (request) => {
    if (!projectReady) return new Response('no project open', { status: 503 })
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

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Expanding Worlds',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
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

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) await win.loadURL(devUrl)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
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
