---
node_id: AI-IMP-151
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - canvas
  - feel
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.55
date_created: 2026-07-07
date_completed:
---


# AI-IMP-151-interaction-physics-beats

## Summary of Issue #1

Rev 0.56 §8.2 ratifies the interaction-physics ledger; nothing is
built. This ticket implements the POINTER beats on the shipped
gesture code: grab → LIFT (drag shadow on + ~1% scale, ~120ms),
release → SETTLE (one ease-out ~150ms, no bounce), snap engage →
NUDGE (last-px magnetic seat ~40ms), lock → PRESS (−1% at lock
commit) with the locked-grab STRAIN (~2px sideways under the
refusal cursor, never lifts), delete → LIFT AWAY (up + fade
~180ms — never a crumple), import lands → settle (bloom already
ships), and drag-over-frame → members MAKE ROOM (small clearance
shift, the one allowed anticipatory motion — riding 127's hover
machinery). Done means every listed mouse-down plays its beat at
the ledger constants, the no-beat list stays beat-free, nothing
loops, and §12.1 perf holds under a 150-image drag.

### Out of Scope

- Pan-flick GLIDE and double-click DIVE (nav-physics; cut
  separately once camera-feel constants from AI-IMP-098's dial-in
  freeze — they share the camera easing seam).
- The tear family (EPIC-023's 135 owns note beats).
- Any gesture SEMANTIC change: beats decorate the existing commit
  flow; commands, thresholds, and §6.9 rules are untouched.

### Design/Approach

Beats live in the renderer/engine display layer, never in command
flow: lift/settle animate the dragged display objects'
scale/shadow (shared drag-shadow sprite from 140's approach or a
cheap alpha ring if 140 unmerged — coordinate), driven by the
gesture lifecycle hooks in the controller (gesture start/commit/
cancel). Nudge: when snap engagement flips (the existing
hysteresis event), ease the last px instead of teleporting the
guide-snap — display-side only, the committed geometry unchanged.
Press/strain: lock state renders −1% body scale; a drag attempt on
locked plays a 2px sideways strain once per grab. Away: the
Delete/Trash commit path's display objects animate up+fade before
the scene-apply removes them (race-safe: the zombie-refresh epoch
guard pattern — never re-acquire textures). Constants from
`beats.ts` (extend with the 1.1 ledger values: lift 120, settle
150, nudge 40, away 180 + the two scale factors and strain px).
Reduced-motion: respect the platform setting if a convention
exists; else record. Every beat one-shot — the iteration-count
guard idea lands here as a source-scan test.

### Files to Touch

`apps/desktop/src/renderer/chrome/beats.ts`: ledger values.
`packages/canvas-engine/src/` gesture/controller display hooks
(+ units for the state machine transitions).
`apps/desktop/src/renderer/canvas/host.ts`: beat wiring (shadow,
away-on-delete, make-room).
Guard test (one-shot rule).
`apps/desktop/e2e/`: beat presence via debug seams where honest
(e.g. lift scale during drag), perf spec UNMODIFIED and green.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Lift/settle on every item drag (one beat per gesture, ±1%
      cap); no-beat gestures verified beat-free.
- [ ] Nudge on snap engage (display-only; committed geometry
      byte-identical — unit).
- [ ] Press at lock; strain-not-lift on locked grab.
- [ ] Away on delete (never crumple; race-safe vs scene apply).
- [ ] Make-room on frame drag-over.
- [ ] One-shot guard test; perf suite green (numbers recorded).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      desk feel alive or busy; strain read on locked).

### Acceptance Criteria

**GIVEN** an ordinary drag
**THEN** the item lifts (+1%, shadow) and settles (ease-out, no
bounce) at the ledger timings, exactly once per gesture.
**GIVEN** a locked item grabbed
**THEN** it strains ~2px and never lifts.
**GIVEN** a delete
**THEN** the item lifts away (up + fade) — nothing ever crumples.
**GIVEN** the perf suite
**THEN** green, unmodified.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
