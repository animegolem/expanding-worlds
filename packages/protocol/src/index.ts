import type { CommandEnvelope, CommandResult, ProjectChangedEvent } from '@ew/commands'

/**
 * Shared request/response types for the Project API seam
 * (RFC-0001 §11.3). The renderer, preload, main router, and project
 * utility process all speak these shapes; no other contract exists
 * across the process boundary.
 */

export const PACKAGE_NAME = '@ew/protocol' as const

export interface PingRequest {
  type: 'ping'
}

export interface PingResponse {
  pong: true
  from: 'utility'
}

export interface InitProjectRequest {
  type: 'init-project'
  dir: string
  createIfMissing: boolean
  title?: string
}

export interface ProjectInfo {
  projectId: string
  rootNodeId: string
  rootCanvasId: string
  revision: number
}

/** §11.4 startup-recovery outcome surfaced with a successful open. */
export interface RecoverySummary {
  repairs: string[]
  integrityErrors: string[]
}

export type InitProjectResponse =
  | { type: 'init-project'; ok: true; project: ProjectInfo; recovery: RecoverySummary }
  | { type: 'init-project'; ok: false; code: string; message: string }

export interface CloseProjectRequest {
  type: 'close-project'
}

export interface CloseProjectResponse {
  type: 'close-project'
  ok: true
}

export interface ExecuteCommandRequest {
  type: 'execute-command'
  envelope: CommandEnvelope
}

export interface ExecuteCommandResponse {
  type: 'execute-command'
  result: CommandResult
}

export interface RunQueryRequest {
  type: 'run-query'
  name: string
  args?: unknown
}

export type RunQueryResponse =
  | { type: 'run-query'; ok: true; result: unknown }
  | { type: 'run-query'; ok: false; code: string; message: string }

/** §11.2/§11.3 import endpoints; implemented by AI-IMP-014. */
export interface ImportAssetRequest {
  type: 'import-asset'
  originalFilename: string
  bytes: Uint8Array
  sourceUrl?: string
}

export type ImportAssetResponse =
  | { type: 'import-asset'; ok: true; assetId: string; deduplicated: boolean }
  | { type: 'import-asset'; ok: false; code: string; message: string }

export type ProjectRequest =
  | PingRequest
  | InitProjectRequest
  | CloseProjectRequest
  | ExecuteCommandRequest
  | RunQueryRequest
  | ImportAssetRequest

export type ProjectResponse =
  | PingResponse
  | InitProjectResponse
  | CloseProjectResponse
  | ExecuteCommandResponse
  | RunQueryResponse
  | ImportAssetResponse

/** Main → renderer service health (AI-IMP-053): broadcast when the
 * utility process dies, restarts, or fails to come back. */
export interface ServiceStatusEvent {
  status: 'restarting' | 'ok' | 'failed'
  message?: string
}

/** Envelope used on the main → utility request channel. */
export interface UtilityEnvelope<T> {
  id: number
  payload: T
}

/** Messages the utility sends to main: correlated responses or pushed events. */
export type UtilityMessage =
  | { kind: 'response'; id: number; payload: ProjectResponse }
  | { kind: 'event'; event: ProjectChangedEvent }

export type { CommandEnvelope, CommandResult, ProjectChangedEvent }
