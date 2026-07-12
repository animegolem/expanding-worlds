---
node_id: AI-IMP-208
tags:
  - IMP-LIST
  - Implementation
  - design
  - charms
assignee: owner
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
date_completed: 2026-07-12
---


# AI-IMP-208-make-canvas-charm-design-push

> COMPLETED BY THE KIT PUSH (2026-07-12): the Make-canvas charm landed in the B1 "A Board Is Born" lifecycle + Home Canvas kit (post-click = the dive, ruled rev 0.70 and shipped in AI-IMP-283); the charm-bar drawing exists. Owner design deliverable satisfied.

## Summary of Issue #1

Validation pass (2026-07-08, owner-prompted): the "give any picture
a board of its own" loop — the app's core recursive promise, and
the first-run guide's headline card — IS fully built, but the
Make-canvas charm **never landed in the charm-bar design mockup**
(owner: "we defined the button but then it didn't land in the
design mockup and that's the drift"). The shipped bar carries a
charm the design system doesn't define. Done means the charm-bar
mockup gains the Make-canvas charm — glyph, placement in the bar's
order, disabled treatment — and rules the one open UX question the
code audit surfaced (below), so the built control and the design
system agree.

**What the code audit found (input to the push):**
- Three shipped surfaces, all e2e-covered (charms.spec.ts §8.4):
  1. Charm bar "Make canvas" (`charm-make-canvas`, FRAME_GLYPH):
     creates the child canvas, the button dims/disables, and a
     persistent "Dive into canvas" hint chip appears on the
     placement. It does NOT navigate.
  2. Enter on a single selected placement (§8.4 open-as-board):
     creates on demand AND dives.
  3. Context menu "Open as board": same create-and-dive.
- **The open UX question:** the charm click is nearly silent —
  no navigation, no beat; just the chip fading in and the button
  dimming. A tester can click it and believe nothing happened
  (plausibly why it read as "never created"). Candidate rulings:
  dive immediately (match Enter/menu), play a MAKE-ROOM-family
  beat and stay, or keep the quiet chip and make the chip's
  arrival more legible. The mockup should draw whichever it rules.

### Out of Scope

- Code changes (a follow-on ticket implements whatever the push
  rules; the three surfaces stay as-is until then).
- The hint-chip anatomy (shipped §4.8 furniture).

### Design/Approach

Owner design push in the charm-bar section of the design kit:
add the Make-canvas charm to the bar mockup (order, glyph — the
code uses the frame glyph today; keep or replace), its
already-has-a-board disabled state, and the post-click ruling
above. Lead folds the ruling back as a small implementation
ticket if behavior changes.

### Files to Touch

RAG/design/ charm-bar mockup/kit page (owner's tooling); then a
follow-on lead ticket per ruling.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Charm-bar mockup includes the Make-canvas charm (glyph,
      order, disabled state).
- [ ] Post-click behavior ruled (dive / beat / legible chip).
- [ ] Lead notified; follow-on ticket cut if behavior changes.

### Acceptance Criteria

**GIVEN** the charm-bar design mockup
**THEN** every charm the shipped bar renders — including
Make-canvas — is defined in the design system, and the post-click
behavior has a ruling the code either already matches or has a
ticket to match.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
