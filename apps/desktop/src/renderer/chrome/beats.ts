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

/* ---- The interaction-physics ledger (RFC §8.2 rev 0.56, AI-IMP-151).
 *
 * The POINTER beats: one one-shot per canvas mouse-down, decorating the
 * DISPLAY layer only (committed geometry, commands, and thresholds are
 * untouched). Confirmed ledger numbers carry no `~`; the rest are
 * provisional feel constants introduced here for beats the ledger names
 * but does not time (flagged in AI-IMP-151 Issues). The engine's pure
 * beat math (interaction-beats.ts) is time-shape only — these are its
 * one home for the contract numbers. NOT settings until EPIC-013. */

/** grab → LIFT: the body rises with its drag shadow (ease-out). */
export const EW_BEAT_LIFT_MS = 120

/** release → SETTLE: one ease-out back to rest — never a bounce. */
export const EW_BEAT_SETTLE_MS = 150

/** snap engage → NUDGE: the last-px magnetic seat, display-only. */
export const EW_BEAT_NUDGE_MS = 40

/** delete → LIFT AWAY: up + fade (§8.2 forbids any crumple/shatter). */
export const EW_BEAT_AWAY_MS = 180

/** LIFT scale: +1% at the grab. Scale rides ±1% and no further. */
export const EW_BEAT_LIFT_SCALE = 0.01

/** PRESS scale: −1% into the desk on a lock commit; a locked body holds
 * at this −1%. Scale rides ±1% and no further. */
export const EW_BEAT_PRESS_SCALE = 0.01

/** locked-grab STRAIN: ~2px sideways, once per grab, never lifts. */
export const EW_BEAT_STRAIN_PX = 2

/** Untape / tuck-home: the tear REVERSED (§8.5 rev 0.55, AI-IMP-135) —
 * the sticky returns to its book, the centered page tucks home.
 * Provisional (`~200ms` in the spec); deliberately quicker than the
 * tear so putting things back feels lighter than pulling them out. */
export const EW_BEAT_UNTAPE_MS = 200

/* --- provisional (ledger-unspecified) feel numbers, AI-IMP-151. --- */

/** PRESS transition duration into the −1% locked seat. */
export const EW_BEAT_PRESS_MS = 150

/** STRAIN there-and-back duration for the locked-grab refusal. */
export const EW_BEAT_STRAIN_MS = 130

/** LIFT-AWAY rise distance (screen px) as the deleted body departs. */
export const EW_BEAT_AWAY_RISE_PX = 24

/** MAKE ROOM: members ease this far outward while a drag hovers their
 * frame (the one allowed anticipatory motion). */
export const EW_BEAT_MAKE_ROOM_PX = 6

/** MAKE ROOM approach time-constant for the eased clearance in/out. */
export const EW_BEAT_MAKE_ROOM_TAU_MS = 70
