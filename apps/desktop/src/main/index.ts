import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import type { ProjectRequest, ProjectResponse, UtilityEnvelope } from '@ew/protocol'

/**
 * Main process: window lifecycle and narrow IPC routing only
 * (RFC-0001 §13.2). All project work lives in the utility process;
 * main forwards requests and correlates responses by envelope id.
 */

let utility: UtilityProcess | null = null
let nextId = 0
const pending = new Map<number, (response: ProjectResponse) => void>()

function startUtility(): void {
  utility = utilityProcess.fork(join(__dirname, 'utility.cjs'), [], {
    serviceName: 'ew-project-service',
  })
  utility.on('message', (message: UtilityEnvelope<ProjectResponse>) => {
    const resolve = pending.get(message.id)
    if (resolve) {
      pending.delete(message.id)
      resolve(message.payload)
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
  ipcMain.handle('project:ping', () => callUtility({ type: 'ping' }))
  void createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  utility?.kill()
  app.quit()
})
