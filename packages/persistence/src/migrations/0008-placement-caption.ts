/**
 * Migration 0008: per-placement captions (RFC-0001 §4.5 rev 0.68,
 * AI-IMP-266). Captions are an identity-free, nullable text property;
 * handler validation owns normalization and the growable length rule.
 */
export const id = 8
export const name = 'placement-caption'
export const sql = /* sql */ `

ALTER TABLE placement ADD COLUMN caption TEXT;
`
