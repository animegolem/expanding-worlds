---
node_id: AI-IMP-280
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - lifecycle-push
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-11
---

# AI-IMP-280-the-missing-exits

## Summary of Issue #1

GR-2 (ratified 10 Jul, lifecycles-1.1 → "GR-2 The Exit Rule" — THE
NORMATIVE SPEC): every transient has three exits (Escape via the
8-rung ladder · one visible pointer exit · click-away), a timer may
shorten a life but never be the only way out, and dismissal may
decide only what the surface printed. Four shipped families sit
outside the law: (1) the FIRST-RUN GUIDE is the one overlay with no
Escape at all (FirstRunGuide.svelte ~:75-77) — it joins rung 8;
(2) the RECOGNITION CHIP is timer-only (feel.ts
MIRROR_CHIP_LIFETIME_MS) — every transient chip gains a ✕
(rest-muted, lights on hover) and click-anywhere-outside dismissal;
Escape does NOT touch chips (notices, not the ladder's business);
(3) MirrorAsk lacks the Escape its sibling DropBehaviorAsk has;
(4) the drop ask auto-answers `separate` on fade AND Escape
silently (drop-behavior.ts ~:68-77, :147) — the contract gets
PRINTED on the ask ("esc or walking away lands them separate");
the decision toast itself is AI-IMP-281's row. Sticky-tool exits
(rung 7) are AI-IMP-282's arc — this ticket is the other three
families plus the printed default. Line numbers drift; round 1
verifies.

### Out of Scope

- Sticky tools / rung 7 (AI-IMP-282 owns the whole family).
- The GR-3 voice assignments (AI-IMP-281) — this ticket adds
  exits and printed contracts, not toasts.
- End Session's disabled row (AI-IMP-224, selector-gated).
- Panels (workspaces, not transients — close by ✕/Escape only,
  ratified as the exception).

### Design/Approach

First-run guide: Escape closes at rung 8 through the existing
layered-Escape capture order (AI-IMP-183's law — verify insertion
point against host.ts ~:1862-1882 so an open menu still peels
first). Chips: one shared dismiss affordance on the recognition/
mirror chip family — ✕ inside the chip + a document-level
pointerdown-outside listener scoped to chip lifetime; the 8s clock
stays. MirrorAsk: adopt DropBehaviorAsk's Escape handling verbatim
(M-13 ordering: context menu wins over panels). The drop ask
prints its default as a footer line on the ask itself — copy
exactly as drawn in GR-2's A1 specimen.

### Files to Touch

- `apps/desktop/src/renderer/chrome/FirstRunGuide.svelte`
- the recognition/mirror chip component(s) (round 1 locates; the
  bundle grounds them via feel.ts)
- `apps/desktop/src/renderer/chrome/drop-behavior.ts` + its ask
  component (printed default)
- MirrorAsk component (Escape)
- e2e: first-run Escape pin; chip ✕ + click-away + Escape-does-
  NOT-dismiss-chip pin; MirrorAsk Escape pin; the printed default
  visible on the ask.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] First-run guide closes on Escape as rung 8; ladder order
      preserved (inner surfaces still peel first).
- [ ] Every transient chip carries a ✕ and dismisses on outside
      click; the timer stays; Escape deliberately does not touch
      chips (pinned by test).
- [ ] MirrorAsk gains Escape with the sibling's semantics.
- [ ] The drop ask prints its dismissal contract on itself,
      copy per the GR-2 specimen.
- [ ] e2e pins for all four; full `CI=true pnpm check` green
      (pipefail, counts read); CHANGELOG [Unreleased];
      HUMAN-TESTING entry.

### Acceptance Criteria

**GIVEN** the first-run guide open above any surface
**WHEN** Escape is pressed repeatedly
**THEN** inner surfaces peel first and the guide closes last,
one rung per press

**GIVEN** a recognition chip on screen
**WHEN** the user clicks its ✕ or anywhere outside it
**THEN** it dismisses immediately (and Escape alone never
dismisses it)

**GIVEN** the multi-drop ask
**WHEN** it renders
**THEN** its default-on-dismissal is printed on the surface, and
Escape/fade behave exactly as printed.

### Issues Encountered

- Round-1 verification corrected the scope: the universal three-exit rule also
  requires click-away on FirstRunGuide, MirrorAsk, RecognitionChip, and
  DropBehaviorAsk. First-run Escape/scrim use the existing `skipFirstRun`
  dismissal; an unanswered MirrorAsk dissolves without persisting “No”. Drop
  idle intentionally resolves every queued batch while explicit dismissal
  resolves only the visible head.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
