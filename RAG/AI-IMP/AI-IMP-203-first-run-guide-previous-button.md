---
node_id: AI-IMP-203
tags:
  - IMP-LIST
  - Implementation
  - onboarding
  - polish
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.9
date_created: 2026-07-08
---


# AI-IMP-203-first-run-guide-previous-button

## Summary of Issue #1

First alph field report (2026-07-08, Discord): the first-run guide
carousel (AI-IMP-160) offers only "skip" and "next ›" — he wanted
to page BACK to reread an earlier card and couldn't ("previous
button needed 🙏"). He also said the guide content itself landed
("maybe I wouldn't have felt like shit yesterday if I knew I had
this to play with the entire time") — so the guide earns a real
back control. Done means the guide has a previous affordance
symmetric with next, disabled/hidden on the first card, keyboard
arrows page both ways, and the dot indicators reflect position as
they do today.

### Out of Scope

- Guide card content/copy (unchanged).
- Making the dots clickable (nice-to-have; note it if trivial in
  the same seam, otherwise leave).

### Design/Approach

Find the guide component from AI-IMP-160 (first-run guide,
takeoverActive() integration). Add "‹ previous" mirroring the
existing "next ›" styling — same type treatment, leading position
in the footer row (skip stays where it is unless the row demands
rebalancing; keep the change minimal). First card: previous is
absent or visibly inert — pick whichever the existing kit idiom
supports and state the choice. Wire ArrowLeft/ArrowRight while the
guide is up (it already holds takeover focus, so no canvas
collision — verify against the Escape-routing rules from
AI-IMP-183).

### Files to Touch

The first-run guide component (`apps/desktop` renderer, wherever
160 put it) + its spec. E2e: page forward twice, back once, assert
card index and dots; ArrowLeft/ArrowRight equivalents.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Previous control renders, styled to match next, correct
      first-card behavior.
- [ ] Keyboard left/right page the guide both ways.
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the first-run guide open past the first card
**WHEN** the user clicks "‹ previous" or presses ArrowLeft
**THEN** the guide steps back one card and the dot indicator
follows — and on the first card no backward affordance invites a
dead click.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
