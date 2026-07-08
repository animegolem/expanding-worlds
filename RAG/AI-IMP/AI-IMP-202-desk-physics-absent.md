---
node_id: AI-IMP-202
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
  - bug
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-202-desk-physics-absent

## Summary of Issue #1

Owner review FAIL on AI-IMP-151 (2026-07-08): of the §8.2 physics
ledger — grab LIFT, release SETTLE, snap SEAT, locked STRAIN,
delete LIFT-AWAY, frame MAKE-ROOM — he sees NONE of them; "only
the bookmark button animation" (the 166 pin beat) plays. Either
the beats are broken (a guard eats them — prime suspect:
`prefers-reduced-motion` on his machine disabling the family
wholesale while the pin beat, CSS-driven in chrome, escapes; or
the beats.ts constants/wiring regressed under a later merge), or
they are so subtle they read as nothing. 151's e2e presumably
still passes, so whatever gates the RENDERED effect isn't what the
tests assert — that gap needs naming too. Done means the cause is
diagnosed and stated; the beats render visibly on a default-config
machine (with reduced-motion honored EXPLICITLY as a setting
story, not an accident); and if the answer turns out to be "too
subtle," the constants get an owner-tuned pass with the dial
documented.

### Out of Scope

- New beats or semantic changes (the ledger is ratified rev 0.56).
- The pin beat (works, shipped).

### Design/Approach

Diagnose in order: (1) check for reduced-motion/media-query guards
around the world beats vs the pin beat — and check the OWNER's
macOS Reduce Motion setting (ask him to check System Settings →
Accessibility → Display → Reduce Motion; if ON, that's the whole
story and the decision becomes whether world beats respect it);
(2) instrument the beat triggers in a dev session (do lift/settle
fire at all?); (3) diff beats wiring against the 151 merge for
regressions under later merges (host refactors touched adjacent
code); (4) if firing but invisible, A/B the constants with the
owner live (the zoomTuning dial idiom). Also state why the e2e
stayed green while the effect is absent (what the tests assert vs
what renders) and pin the gap.

### Files to Touch

Diagnosis first (report in Issues Encountered); then whichever of
`canvas/` beats wiring / `beats.ts` / CSS the verdict names. A
render-asserting test where feasible.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Cause diagnosed and documented (incl. the owner's
      Reduce Motion state and the e2e blind-spot explanation).
- [ ] Beats visibly render on default config; reduced-motion
      behavior is a deliberate, documented choice.
- [ ] Constants pass with the owner if subtlety was any part of
      the verdict.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a default machine and a drag-release on a board item
**THEN** the lift and settle visibly play (and the rest of the
ledger on their triggers) — or the RFC records the deliberate
reason they don't on this configuration.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
