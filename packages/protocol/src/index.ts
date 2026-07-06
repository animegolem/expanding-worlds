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

/** §11.5 project-tier setting write (AI-IMP-074): deliberately a
 * separate verb from execute-command — settings are preferences, not
 * content edits, and never enter command history. Reads go through
 * the ordinary run-query verb (getSettings). */
export interface SetSettingRequest {
  type: 'set-setting'
  key: string
  value: unknown
}

export type SetSettingResponse =
  | { type: 'set-setting'; ok: true }
  | { type: 'set-setting'; ok: false; code: string; message: string }

/** §11.2 renderer-driven thumbnail pipeline (AI-IMP-076): the
 * renderer claims the oldest queued job, decodes/resizes/encodes
 * with Chromium codecs, and submits WebP bytes back; the utility
 * owns the queue and the derivative files. Claiming does not lock —
 * a dead renderer leaves the job queued and the pipeline heals. */
export interface ClaimThumbnailJobRequest {
  type: 'claim-thumbnail-job'
}

export interface ThumbnailJobInfo {
  jobId: string
  assetId: string
  contentHash: string
  mimeType: string
}

export type ClaimThumbnailJobResponse =
  | { type: 'claim-thumbnail-job'; ok: true; job: ThumbnailJobInfo | null }
  | { type: 'claim-thumbnail-job'; ok: false; code: string; message: string }

export interface SubmitThumbnailRequest {
  type: 'submit-thumbnail'
  jobId: string
  assetId: string
  contentHash: string
  /** WebP bytes; null marks the job failed (undecodable source). */
  bytes: Uint8Array | null
}

export type SubmitThumbnailResponse =
  | { type: 'submit-thumbnail'; ok: true }
  | { type: 'submit-thumbnail'; ok: false; code: string; message: string }

export type ProjectRequest =
  | PingRequest
  | InitProjectRequest
  | CloseProjectRequest
  | ExecuteCommandRequest
  | RunQueryRequest
  | ImportAssetRequest
  | SetSettingRequest
  | ClaimThumbnailJobRequest
  | SubmitThumbnailRequest

export type ProjectResponse =
  | PingResponse
  | InitProjectResponse
  | CloseProjectResponse
  | ExecuteCommandResponse
  | RunQueryResponse
  | ImportAssetResponse
  | SetSettingResponse
  | ClaimThumbnailJobResponse
  | SubmitThumbnailResponse

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
  | { kind: 'thumbnail-ready'; assetId: string; contentHash: string }

/** Main → renderer broadcast when a thumbnail derivative lands. */
export interface ThumbnailReadyEvent {
  assetId: string
  contentHash: string
}

export type { CommandEnvelope, CommandResult, ProjectChangedEvent }
