---
node_id: AI-IMP-152
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - hygiene
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.7
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-152-hand-rules-build-audit

## Summary of Issue #1

The Two Materials restated the hand rules ratified at revs
0.12–0.21, which surfaced that their BUILD status is unaudited.
This ticket audits each against shipped code and implements the
gaps: (1) Option-at-drag-START duplicates (rev 0.17/0.21 — a new
placement of the same node per §6.5); (2) Option MID-drag = snap
bypass (0.21); (3) Shift tidy-constraint precedence silencing
snapping (0.15); (4) rotation magnetizes to cardinals + Shift 15°
quantize + bypass disables both (0.12); (5) locked refusal cursor
drawing nothing else (0.17); (6) esc peels one layer at a time —
selection → lens → takeover → nothing (§8.2 grammar). Done means:
a written audit table (shipped ✓ / gap → built here) in Issues
Encountered, every gap implemented with tests, and the full e2e
suite green.

### Out of Scope

- Beats (151). Any §6.9 semantic CHANGE — these rules are ratified
  text; this is conformance.
- Rebinding/shortcut work.

### Design/Approach

Audit first (read gesture/tool code + existing e2e), then build
gaps. Option-duplicate is the likely big gap: at drag start with
Option, clone via CreatePlacement of the same node at the drag
origin, then the drag moves the CLONE (one compound undo — the
runAsUndoGroup pattern); verify against §6.5 copy semantics.
Rotation quantize/magnetize likely ships (AI-IMP-031) — verify the
15° Shift step and bypass. Esc peel: assert the order with lens +
takeover + selection stacked (e2e). Each verified rule gets a
pinning e2e if none exists, so conformance can't silently regress.

### Files to Touch

Audit: `packages/canvas-engine/src/` gesture/tools + hit-test,
`apps/desktop/src/renderer/canvas/`.
Gaps: same homes (+ units).
`apps/desktop/e2e/` pinning assertions.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Audit table for all six rules with file:line evidence.
- [x] Option-duplicate: built or verified; compound undo; e2e.
- [x] Snap bypass + Shift precedence verified/pinned.
- [x] Rotation magnetize + 15° + bypass verified/pinned.
- [x] Refusal cursor verified/pinned; esc peel order e2e.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (Option-
      duplicate feel if newly built).

### Acceptance Criteria

**GIVEN** the six ratified hand rules
**THEN** each is demonstrably shipped (pinned by a test) or built
by this ticket, with the audit table recording which.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Audit verdict: all six ratified hand rules already SHIP and conform
to the normative text.** Five were already pinned (four by unit tests,
plus e2e for duplicate / locked / lens). The ticket's presumed "big
gap" (Option-duplicate) is fully built AND e2e-pinned. The one genuine
pinning gap — an integration e2e for the rev-0.21 MOVE snap-bypass /
non-collision seam (which is also the FIRST e2e of move snapping) — is
now filled. No conformance code changes were required.

### Audit table (shipped ✓ / gap → built)

| # | Rule (RFC rev) | Verdict | Shipped-code evidence | Test evidence |
|---|----------------|---------|-----------------------|---------------|
| 1 | Option at drag START duplicates — a new placement of the same node (§6.9 rev 0.17/0.21, §6.5) | ✓ shipped | `apps/desktop/src/renderer/canvas/gestures-ui.ts:365-376` arms `dupDrag` only when `altKey` is held at pointerdown on a single-placement move zone; `commitDuplicate` `:184-211` fires ONE `CreatePlacement` of the SAME `nodeId` at the release offset (§6.5). One command = one undo (the shipped ghost+single-command design is simpler than the ticket's clone-at-start/`runAsUndoGroup` sketch and needs no undo group). Esc mid-drag cancels `:454-458`. | e2e `gestures.spec.ts:381` (one CreatePlacement, single undo removes it, Esc cancels) |
| 2 | Option MID-drag = snap bypass (§6.9 rev 0.21) | ✓ shipped (+ e2e added) | `packages/canvas-engine/src/gestures/move.ts:52` `disabled: (alt) || (shift)`; resize mirrors it. Start-vs-mid non-collision is structural: the duplicate arms ONLY at pointerdown-with-alt (`gestures-ui.ts:365`); a plain move reads `modifiers.alt` live each `update` (`move.ts:29,52`). | unit `move.test.ts:101`; resize e2e `resize-snap.spec.ts:108`. **GAP FILLED:** `gestures.spec.ts:488` — Alt mid-move bypasses snap AND spawns no duplicate; plain move snaps exactly on the neighbor edge |
| 3 | Shift tidy-constraint precedence silences snapping (§6.9 rev 0.15) | ✓ shipped | `move.ts:34` applies `constrainDeltaToAxes` under shift; `move.ts:50-52` disables the snap query under shift so nothing pulls the result off the enforced axis. | unit `move.test.ts:145-146` ("shift silences snapping"); resize `resize.test.ts:254,268,373` |
| 4 | Rotation magnetizes to cardinals + Shift 15° quantize + bypass disables both (§6.9 rev 0.12) | ✓ shipped | `packages/canvas-engine/src/gestures/rotate.ts:16-18` constants (15° step, ±5° cardinal window); `:46-60` — alt = raw; else single item resolves target ORIENTATION, magnetized to nearest cardinal within ±5° OR Shift-quantized to 15° absolute, delta derived back. | unit `rotate.test.ts:155-198` (magnetize `:155`, outside-window raw `:164`, shift 15° absolute `:172`, alt bypass `:189`); e2e wiring `gestures.spec.ts:282` |
| 5 | Locked object shows refusal cursor and draws nothing else (§6.9 rev 0.17) | ✓ shipped | `gestures-ui.ts:335-359` — a press on a locked item selects it (so it stays unlockable), sets `not-allowed`, `preventDefault`+`stopImmediatePropagation`, starts no drag and commits nothing, plus the §8.2 strain beat; hover shows `not-allowed` `:421,436`. | e2e `gestures.spec.ts:435` (refuses move AND resize; unlock restores the move) |
| 6 | Esc peels one layer at a time — gesture/marquee → lens → selection; takeover scoped separately (§8.2, §4.8) | ✓ shipped | `packages/canvas-engine/src/controller.ts:278-291` peels in-flight gesture/marquee → lens → selection; §4.8: the lens drops WITHOUT touching selection. Takeover scoping: board key handlers return early while `takeoverActive()` (`gestures-ui.ts:452`, `host.ts:1737`), so a takeover owns its own Esc; `GalleryView.svelte:919`, `TagPanel.svelte:171` run their layered Esc. | unit `lens.test.ts:118,133`; e2e `lens.spec.ts:38`, `tags.spec.ts:116` |

### Deviations / notes

- **Rule 6 order reconciliation.** The ticket's inline enumeration
  ("selection → lens → takeover → nothing") inverts lens vs selection.
  The NORMATIVE order (RFC §4.8 + `controller.escape()` + the pinning
  tests) is **lens BEFORE selection**, so exiting a view state never
  disturbs what the user has selected. Deferred to the RFC as
  normative; no code change. Flagging for the lead.
- **Option-duplicate is single-placement only.** `gestures-ui.ts:365`
  arms the duplicate only for `items.length === 1 && placements.length
  === 1`; for a multi-selection, Alt-at-start acts as the snap bypass,
  not a duplicate. The RFC's cursor-zone rule says "a copy" (singular)
  and does not ratify multi-select duplicate, so I treated the
  single-placement duplicate as the ratified surface and did NOT build
  multi-duplicate (that would be a semantic decision, out of this
  conformance ticket's scope). Flagging for the lead.
- **Overlap with the AI-IMP-173 stability audit (untouched, per
  brief).** While reading the gesture code I noticed the wheel handler
  (`host.ts:1719-1732`) runs with no mid-gesture guard and the keyboard
  modifier tracking has no `pointercancel` path — exactly the
  stability audit's territory (wheel-zoom mid-gesture, keyboard-mid-drag
  races, missing pointercancel). Left untouched; noted here only.

### What was built

- One integration e2e: `apps/desktop/e2e/gestures.spec.ts:488` — "rev
  0.21 Option split: Alt MID-move bypasses snapping and never
  duplicates; plain move snaps". Phase 1 pins the non-collision (a
  plain move + Alt held mid-drag lands unsnapped and commits exactly
  one moved placement, never a copy); phase 2 pins move snapping (the
  dragged right edge lands EXACTLY on the neighbor's west edge via
  hysteresis). This is the first e2e exercise of MOVE snapping.

### Validation (all green)

- `pnpm -r build` — clean (all packages; desktop bundle built).
- `pnpm -r test` — exit 0: all package vitest suites + the desktop
  Playwright e2e suite (196 passed, hidden windows via
  `EW_TEST_HIDDEN_WINDOWS=1` config default; ~5.2m).
- `pnpm lint` — clean (`eslint .`, no findings).
- `apps/desktop` `playwright test e2e/gestures.spec.ts` — 6 passed,
  including the new rev-0.21 test (`:488`).
