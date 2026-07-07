---
node_id: AI-IMP-166
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
kanban_status: planned
depends_on: [AI-IMP-165]
parent_epic:
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-166-signature-pin-and-beat

## Summary of Issue #1

Signature Pin pass decisions 03/04/05/07, ratified rev 0.64 §8.2.
The path-tail bookmark control becomes the SIGNATURE SPOT: the
canonical pin (silhouette iv — sweeping concave sides, soft rounded
tip, carved-red meridian head; SVG asset from the design kit) sits
bare at cap-height beside the board name as the ONE colored element
in the mono chrome. Clicking it plays the bookmark beat — the one
sanctioned chrome→world crossover: wiggle ~220ms (±8° about the
tip) → hop ~150ms (up 10px, stretch scaleY ~1.06) → press ~100ms
(dips 3px, squash ~.93, reseats EXACTLY — no drift) → settle ~230ms
one gentle overshoot; the bookmarks menu sweeps in +190ms from the
anchor; close is a plain ~120ms fade (ceremony is for arrival).
Whole beat inside the title-strip band. Bookmark menu rows wear
small GLOBES in place of dots. Done means the pin lives at the path
tail, the beat plays one-shot on open, rows wear globes, and every
timing is a named constant.

### Out of Scope

- The app icon masters (owner/kit deliverable, not renderer code).
- The frameless shell itself (165, this depends on it).
- Cascade adoption inside MenuPopover generally (167) — but the
  BOOKMARKS menu open may compose with 167's grammar if merged
  first; coordinate constants, duplicate nothing.

### Design/Approach

Pin: an inline SVG component (silhouette iv from the kit; the ONE
raw-color exception — register it with the theme guard's allowlist
the way the kit assets are). Home: PathBar's tail bookmark control
(chrome/PathBar.svelte + bookmarks.ts/BookmarkMenu.svelte). Beat:
CSS keyframes, iteration-count 1, transform-only, constants in
chrome/beats.ts (EW_PIN_WIGGLE_MS 220 · EW_PIN_HOP_MS 150 ·
EW_PIN_PRESS_MS 100 · EW_PIN_SETTLE_MS 230, all ~provisional);
transform-origin at the pin TIP for the wiggle. This is the
sanctioned exception to chrome's opacity-only rule — comment it as
such at the seam. Globes: small SVG in BookmarkMenu rows replacing
the dot glyph. E2E: open → beat classes fire once and end; reopen
replays; menu opens; rows carry the globe testid.

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`,
`BookmarkMenu.svelte`, `bookmarks.ts`, `beats.ts`, pin/globe SVG
component(s), theme guard allowlist if needed.
E2E: bookmarks/navigation spec extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Canonical pin at the path tail, cap-height, the one colored
      chrome element.
- [x] The four-phase beat, one-shot, named constants, reseats
      exactly; close is a plain fade.
- [x] Menu rows wear globes.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the path tail
**THEN** the red pin sits beside the board name and clicking it
wiggles, hops, presses, and settles exactly once before the menu
sweeps in — and closing fades plainly.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Silhouette iv is drawn straight from the kit master** (design
  `Pin & Menu Motion Prototype.dc.html`): viewBox `100 20 312 440`, a
  top-lit red gradient body (`M138 178 A118 …`), two meridian ellipses +
  the equator carved into the head under a clip, one gloss. New component
  `chrome/PinGlyph.svelte`; sized `height:1.25em; width:auto` so it tracks
  the board name at cap-height.
- **The red was already in the palette.** `--ew-obj-red-hi/-lo/-stroke`
  and `--ew-obj-gloss` are byte-for-byte the design's pin colours (the pin
  IS a red paper object). Per the ticket/RFC's "dedicated theme token", a
  `--ew-pin-red-*` / `--ew-pin-gloss` family was added in theme.css
  *aliasing* those — the doctrine ("the ONE colored element") reads where
  it paints, single-sourced, NOT re-themed. Globes reuse the object palette
  directly (`--ew-obj-blue-*` ocean, `--ew-obj-green-lo` land) — they are
  little world-icons. No raw hex leaves theme.css; the raw-color guard and
  the undefined-token guard both stay green.
- **Beat = one keyframe + named constants.** `chrome/beats.ts` gains
  `EW_PIN_WIGGLE_MS 220 · HOP 150 · PRESS 100 · SETTLE 230`, their sum
  `EW_PIN_BEAT_MS`, and `EW_PIN_MENU_FADE_MS 120`. The keyframe
  (`chrome/pin-beat.css`, imported in main.ts beside menu-cascade.css)
  expresses each phase as a % of the ~700ms whole (wiggle→31.4%, hop→52.9%,
  press→67.1%, settle→100%); PathBar stamps `EW_PIN_BEAT_MS` as the
  animation-duration so the number lives once. `transform-origin:50% 100%`
  is the pin TIP (bottom-centre), matching the ratified prototype; the
  final identity frame reseats the glyph at its exact pre-beat box
  (e2e polls `getBoundingClientRect` equality). `iteration-count:1` and a
  seam comment mark it the SOLE sanctioned exception to chrome's
  opacity-only rule.
- **Cascade composition.** PathBar runs a phase machine
  rest→beat→open→closing→rest. The menu mounts only at `open` (after the
  pin's `animationend`), so it settles once *before* the menu sweeps in;
  the sweep IS 167's cascade — `use:applyMenuCascade` on the row `<ul>`
  (no open animation duplicated). A safety timeout (`EW_PIN_BEAT_MS+200`)
  guards a missed animationend so the menu can never strand closed.
- **Close is a plain 120ms opacity fade** (`.bookmark-menu.closing`, a
  non-`--ew-` custom prop `--menu-fade` carries the constant past the
  token guard). This is the only real friction: the fade keeps the menu
  in the DOM at opacity 0 for ~120ms, and Playwright's `isVisible()`
  ignores opacity, so the `openBookmarkMenu` idempotency check could catch
  the "closing ghost" and skip a real re-open — this raced two existing
  bookmark specs red on the first full run. Fixed deterministically:
  BookmarkMenu exposes `data-closing`, and the helper waits a closing menu
  out (`toBeHidden`) before reopening. All 8 navigation specs + the new
  signature-pin spec pass.
- **Gates:** `pnpm -r build` ✓ · `pnpm lint` ✓ · `pnpm -r test` ✓
  (vitest guards incl. theme raw-color/undefined-token; **191 e2e passed**,
  hidden windows). The two specs that raced on the first run pass green
  after the `data-closing` fix.
