---
node_id: AI-IMP-304
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - reservation-frame
  - settings
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-030-the-ratified-law-wave]]
confidence_score: 0.8
date_created: 2026-07-16
date_completed:
---

# AI-IMP-304-frame-law-minwidth-density

## Summary of Issue #1

Two rev 0.73 frame rulings need enforcement. (1) §8.8.3: the
minimum supported window width is 960 CSS px (owner-ruled, kit-1.6
ruling 41) — the shipped BrowserWindow declares no minWidth
(verified, `apps/desktop/src/main/index.ts`), so the app can be
squeezed below every geometry promise. (2) §8.8.3/§11.5: density
is a TRIAD — compact (dense cursor default) · comfortable
(cursor-friendly spacious, ~36px controls, reservations UNCHANGED)
· touch (44px targets, strip 0, bands grow; the ONLY tier that
changes the reservation frame). Shipped comfortable correctly
retains 64/112 reservations but lacks its ~36px control rule.
Done means: the window cannot shrink below 960 wide; comfortable
delivers ~36px controls via the token system; the density plumbing
accepts `touch` as a value; the settings row's exposure of touch
follows the no-quiet-lie rule below.

### Out of Scope

Building actual touch support (no touch build exists); any
reservation value changes for compact/comfortable; kit redraws.

### Design/Approach

minWidth: declare `minWidth: 960` on the BrowserWindow (review
picks a minHeight only if one is already implied elsewhere — the
ruling covers width; do NOT invent a height floor). Density:
extend the density token plumbing (theme/chrome tokens, the
`data-density` seam AI-IMP-300 shipped) to three values; wire the
~36px control size for comfortable through the token tier so kit
components inherit it (no per-component constants). Settings row:
per the owner's "auto refused as a quiet lie" precedent, do NOT
expose a touch segment that lies on a cursor desktop — the row
stays compact·comfortable visually and `touch` remains a plumbed,
testable value awaiting a touch build (record this scoping in the
row's code comment via constraint, not narration). Round-1 review
verifies the token seam and where control sizes derive today.

### Files to Touch

`apps/desktop/src/main/index.ts`: minWidth 960.
`apps/desktop/src/renderer/**/tokens or theme seam` (review
locates): density triad + comfortable ~36px control tier.
`apps/desktop/src/renderer/chrome/reservation.ts`: accept `touch`
(strip 0, grown bands) as a value; assert unchanged
compact/comfortable outputs.
Settings sheet component (AI-IMP-300's): row stays two segments;
plumbing accepts three.
`apps/desktop/test/**`: reservation triple-state unit; e2e resize
floor.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Round-1 review: verify the density seam, control-size
      derivation, and settings row shape; record corrections here
      first.
- [ ] BrowserWindow declares minWidth 960; e2e (or main unit)
      proves a smaller resize request clamps.
- [ ] Density plumbing accepts compact | comfortable | touch;
      compact/comfortable reservation outputs BYTE-UNCHANGED
      (regression-pinned in unit tests).
- [ ] Comfortable delivers ~36px interactive control sizing via
      the token tier; dock/rail/menus inherit without
      per-component edits.
- [ ] Touch value produces strip 0 + grown bands in reservation
      outputs (unit only — no UI exposure).
- [ ] Settings row unchanged visually (two segments); a code-level
      constraint documents why touch is unexposed.
- [ ] Evidence bundle: comfortable-density screenshots keyed to
      DOCK-HIT-01's companion (~36px controls).

### Acceptance Criteria

**Scenario:** Squeezing the window.
**GIVEN** the app at 1280×800.
**WHEN** the user drags the window edge to 700px wide.
**THEN** the window clamps at 960 and every reservation-frame
surface remains per its 960 edges specimen.

**Scenario:** Comfortable density.
**WHEN** density is set to comfortable.
**THEN** interactive dock/rail/menu controls measure ~36px while
strip/rail/dock reservations remain 46/56/64–112.
**AND** compact output is byte-identical to v0.25.0.

### Issues Encountered

<!--
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
