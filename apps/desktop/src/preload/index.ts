import { contextBridge, ipcRenderer } from 'electron'
import type { PingResponse } from '@ew/protocol'

/**
 * The only capability surface the sandboxed renderer receives
 * (RFC-0001 §13.2). Grows with the Project API of §11.3; nothing else
 * crosses the bridge.
 */
const api = {
  project: {
    ping: (): Promise<PingResponse> => ipcRenderer.invoke('project:ping') as Promise<PingResponse>,
  },
}

export type EwApi = typeof api

contextBridge.exposeInMainWorld('ew', api)
