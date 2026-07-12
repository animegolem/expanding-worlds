---
node_id: AI-IMP-207
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - rail
  - bug
  - design-first
kanban_status: cancelled
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-08
---


# AI-IMP-207-rail-surface-exclusivity

> SUPERSEDED (2026-07-12): half 1 (exclusivity) shipped earlier; half 2 (membership) was ruled by the rail table (DESIGN-QUEUE, 2026-07-11) and drawn in the kit push — re-scoped as AI-IMP-293 under AI-EPIC-029.

## Summary of Issue #1

Alph field report (2026-07-08, Discord, screenshot): "dunno how to
explain but this area breaks so easily" — the right-rail charms.
His screenshot shows the project-switcher overlay, the system
metadata card, AND the hamburger menu all standing open at once,
stacked over each other. The owner's diagnosis: the rail's states
are NON-EXCLUSIVE, and the surfaces aren't even the same kind of
thing — "some of them are overlays, some paint the entire screen,
some open windows that require close." Two halves, per the owner's
ruling:

**Half 1 (ruled, buildable): mutual exclusivity.** "Definitely we
shouldn't be able to create the state where multiple are open at
once." Opening any rail surface dismisses whatever rail surface is
currently open — one at a time, always, with the toggle states on
the rail buttons tracking truthfully.

**Half 2 (design conversation, part of this ticket): rail
membership.** Owner: "probably only toggles that fully change the
lens should be on that right-hand side, and the ones that are
opening menus, we should think about what they mean." The
conversation classifies every current rail item (lens-changing
takeover vs menu/popover vs card) and decides what stays on the
rail, what moves, and what grammar each class follows. Runs
through DESIGN-QUEUE; half 2 does not build until it's ruled.

Done for this ticket: half 1 implemented and e2e-pinned (no click
sequence can stack two rail surfaces); half 2's classification
table drafted as the design conversation's input and the
conversation held; whatever it rules is either folded in here (if
small) or cut as follow-on tickets.

### Out of Scope

- Building any rail relocation/regrammar before the conversation
  rules (half 2 is capture + conversation, not construction).
- The hamburger menu's contents (Menus Document owns that).
- Escape routing (AI-IMP-183, shipped — but exclusivity must
  compose with it: Escape still closes the top surface).

### Design/Approach

Half 1: find the rail surfaces' open/close state owners (project
switcher, search, mirror/gallery lens, system card, hamburger —
enumerate from the rail component). Introduce (or reuse, if the
takeover machinery from AI-IMP-160/183 already offers it) a single
"active rail surface" registry: opening one closes the incumbent
through its own close path (not by unmounting over it), so
close-side effects stay honest. E2e: for each ordered pair of rail
surfaces, open A then open B → only B stands; rail toggle states
match; Escape closes B and only B.

Half 2 inputs for the conversation: the classification table
(surface → kind: full-screen lens / overlay / anchored menu /
card / OS window), alph's screenshot as the failure exhibit, the
owner's lens-toggles-only hypothesis for rail membership.

### Files to Touch

Rail/chrome component owning the charm buttons + each surface's
open/close seam (enumerate at build); e2e spec for the pairwise
exclusivity sweep. Half 2: DESIGN-QUEUE entry (exists), then
per-ruling.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Rail surface inventory + classification table written into
      this ticket.
- [ ] Single active-rail-surface enforcement; incumbent closes via
      its own close path; toggle states truthful.
- [ ] Pairwise open-A-then-B e2e sweep; Escape composition
      verified.
- [ ] Design conversation on rail membership held; ruling recorded
      (here or as cut follow-ons); DESIGN-QUEUE pruned.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (alph
      first pass — his find).

### Acceptance Criteria

**GIVEN** any rail surface open
**WHEN** the user opens any other rail surface
**THEN** the first closes through its own close path and only the
second stands — no click sequence stacks two rail surfaces.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
