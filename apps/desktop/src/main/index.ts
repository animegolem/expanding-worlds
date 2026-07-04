import { app, BrowserWindow, ipcMain, net, protocol, utilityProcess, type UtilityProcess } from 'electron'
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

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) await win.loadURL(devUrl)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

void app.whenReady().then(() => {
  registerAssetProtocol()
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
