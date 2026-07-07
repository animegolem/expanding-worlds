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

- [ ] Canonical pin at the path tail, cap-height, the one colored
      chrome element.
- [ ] The four-phase beat, one-shot, named constants, reseats
      exactly; close is a plain fade.
- [ ] Menu rows wear globes.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
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
