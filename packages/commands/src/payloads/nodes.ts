/** Node command payloads (§10.1). Grown by AI-IMP-012. */

export interface CreateNodePayload {
  /** Client-supplied UUIDv7 keeps inverses and tests deterministic. */
  nodeId: string
}

/**
 * Internal inverse of CreateNode until AI-IMP-013 lands lifecycle
 * commands: hard-deletes a node that is still a draft (no note, no
 * tags, no canvas, no placements). Refuses anything else.
 */
export interface DeleteDraftNodePayload {
  nodeId: string
}

export const COMMAND_CREATE_NODE = 'CreateNode'
export const COMMAND_DELETE_DRAFT_NODE = 'DeleteDraftNode'
