/**
 * Migration 0004: placement lock (RFC-0001 §6.9 rev 0.17, AI-IMP-062).
 *
 * Decorations have carried a `locked` flag since 0001; placements gain
 * the same column so the cursor-zone gesture surface can refuse
 * move/resize/rotate on locked placements uniformly. Command surface
 * is SetPlacementLock; the §8.4 charm bar (AI-IMP-063) gives it UI.
 * Conventions follow 0001: 0/1 INTEGER flag with a CHECK, default
 * unlocked so existing rows are untouched semantically.
 */
export const id = 4
export const name = 'placement-lock'
export const sql = /* sql */ `

ALTER TABLE placement ADD COLUMN locked INTEGER NOT NULL DEFAULT 0
  CHECK (locked IN (0, 1));
`
