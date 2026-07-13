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

/** Caption plaque birth: one quiet pop with a whisper of overshoot. */
export const EW_BEAT_CAPTION_POP_MS = 280

/** Lens arrival: one adjacent ring pulse after a fly-to. It never
 * engages the lens or dims outsiders (AI-IMP-298). */
export const EW_BEAT_ARRIVAL_MS = 420

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

/* ---- The menu CASCADE ledger (RFC §8.2 rev 0.64, decision 06,
 * AI-IMP-167). The universal open grammar: every menu and popover fades
 * its rows in staggered top-to-bottom, opacity only, inside the cascade
 * envelope. The applicator (chrome/menu-cascade.ts) stamps each row's
 * --row-index and reads the delay/duration straight from these; the
 * keyframe lives in chrome/menu-cascade.css. Named here so the mechanism
 * and its tests share ONE contract. */

/** Per-row stagger: each row starts this long after the one above. */
export const EW_MENU_STAGGER_MS = 30

/** Cascade envelope: the whole open lands inside this budget. */
export const EW_MENU_CASCADE_MS = 190

/** Stagger cap (rows): the effective delay is min(index, cap) * stagger,
 * so a 20-row menu still finishes in budget. Chosen so cap*stagger plus
 * the per-row fade equals the envelope exactly (4*30 + 70 == 190). */
export const EW_MENU_STAGGER_CAP = 4

/* ---- The SIGNATURE PIN beat (RFC §8.2 rev 0.64, decisions 04/05,
 * AI-IMP-166). The path-tail bookmark pin is the ONE isomorphic object
 * bridging chrome into the world, so it is the SOLE sanctioned exception
 * to chrome's opacity-only rule (§8.2): on open it performs a real desk
 * beat because it literally enters the canvas. One-shot, transform-only,
 * entirely inside the title-strip band. The four phases below sum to the
 * whole beat; the keyframe (chrome/pin-beat.css) expresses each as a
 * percentage of that sum, and PathBar stamps EW_PIN_BEAT_MS as the
 * animation-duration so the numbers live in exactly one place. All `~`
 * provisional feel numbers, NOT settings until EPIC-013. */

/** Phase 1 — WIGGLE: ±8° anticipation about the pin TIP (the dog
 * readying its hop). */
export const EW_PIN_WIGGLE_MS = 220

/** Phase 2 — HOP: up 10px with a stretch (scaleY ~1.06). */
export const EW_PIN_HOP_MS = 150

/** Phase 3 — PRESS: dips 3px into the board with a squash (scaleY ~.93),
 * reseating at its EXACT spot — no drift. */
export const EW_PIN_PRESS_MS = 100

/** Phase 4 — SETTLE: one gentle overshoot back to rest, no bounce loop. */
export const EW_PIN_SETTLE_MS = 230

/** The whole beat: the four phases end to end (~700ms). Stamped as the
 * animation-duration so the keyframe percentages resolve against it. */
export const EW_PIN_BEAT_MS =
  EW_PIN_WIGGLE_MS + EW_PIN_HOP_MS + EW_PIN_PRESS_MS + EW_PIN_SETTLE_MS

/** Unpin on CLOSE: a plain opacity fade — the ceremony is for arrival,
 * so closing is ordinary chrome (opacity only), never a reverse beat. */
export const EW_PIN_MENU_FADE_MS = 120
