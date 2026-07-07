/**
 * World-content motion beats (Style Guide §6, RFC §8.2 motion corollary).
 *
 * Two motion budgets exist. Chrome fades and single pulses live in
 * feel.ts (one shared fade clock). These are the OTHER budget: small
 * one-shot PHYSICAL beats on world content — the tear, the first-placement
 * bloom, the stage-edge growth ease. One beat per user act; never ambient,
 * never looping (§8.8 guard idea: an iteration-count ≠ 1 outside the
 * interaction layer fails review).
 *
 * These are hand-tuned feel numbers consumed by imperative canvas code,
 * NOT CSS custom properties and NOT model state (expressly not settings
 * until EPIC-013). Landed dormant by AI-IMP-130; the visual tickets that
 * animate the tear (note lifecycle), the bloom (first placement), and the
 * stage edge (stage-extent) consume them.
 *
 * `~` in the guide marks provisional numbers; only the tear is confirmed
 * (t9). The book-cover-open beat stays a musing and is deliberately not
 * exported here.
 */

/** Pin tear-off: the note detaches from its binding, ease-out. */
export const EW_BEAT_TEAR_MS = 300

/** First-placement bloom: a freshly placed item settles onto the board. */
export const EW_BEAT_BLOOM_MS = 240

/** Stage-edge growth: the content-defined stage glides as an edge grows
 * (the eased approach in stage-extent.ts), never snaps. */
export const EW_BEAT_STAGE_EDGE_MS = 180
