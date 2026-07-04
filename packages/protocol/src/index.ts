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

export type ProjectRequest = PingRequest
export type ProjectResponse = PingResponse

/** Envelope used on the main ↔ utility message channel. */
export interface UtilityEnvelope<T> {
  id: number
  payload: T
}
