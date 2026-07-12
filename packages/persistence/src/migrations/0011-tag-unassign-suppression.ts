/**
 * Migration 0011: node-scoped tag-sync suppression (RFC §4.8 rev 0.70,
 * AI-IMP-285). A hand-unassigned image tag is not re-applied by the
 * additive mirror union until a hand assigns it again.
 */
export const id = 11
export const name = 'tag-unassign-suppression'
export const sql = /* sql */ `

CREATE TABLE tag_unassign_suppression (
  project_id TEXT NOT NULL REFERENCES project(id),
  content_hash TEXT NOT NULL,
  name_key TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, content_hash, name_key, node_id)
) STRICT;
`
