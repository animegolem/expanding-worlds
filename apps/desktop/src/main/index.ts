import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { CommandEnvelope } from '@ew/commands'
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
  startUtility()
  void callUtility({
    type: 'init-project',
    dir: projectDir(),
    createIfMissing: true,
    title: 'Untitled Project',
  }).then((response) => {
    if ('ok' in response && !response.ok) {
      console.error('[main] project init failed:', response)
    }
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
