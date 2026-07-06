---
node_id: AI-IMP-109
tags:
  - IMP-LIST
  - Implementation
  - appearance
  - chrome
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed:
---

# AI-IMP-109-appearance-switcher

## Summary of Issue #1

A node's appearance is frozen at creation — no surface dispatches
SetNodeAppearance (only the seed and ingest use it), leaving
§6.2's "flow through the ordinary node operations" dangling until
rev 0.45 ratified the fix: an **appearance charm** on the §8.4
charm bar (swatch glyph, between the divider and make-canvas)
opening a popover — dot color-swatch row · built-in icon set ·
image… · card (enabled only while a note is attached). Done = every
appearance kind reachable after creation, one undo restores the
prior appearance.

### Out of Scope

- Replace-file's full semantics (source attribution update, GC
  notes — §6.1); image… here is: picker → ordinary asset import →
  SetNodeAppearance {kind:'image'}.
- Placement-specific overrides (deferred, §4.6).
- Crop editing (the crop charm owns it).

### Design/Approach

charms-ui.ts is imperative DOM: add a `barButton` for the swatch
charm and a popover `<div>` sibling in the existing
`charm-tag-chips` pattern (one open popover at a time — opening
appearance folds tags and vice versa). Contents: the dot color
row (source the SAME palette constant the pin tool / existing dot
creation uses — find it, do not invent colors; raw hex outside
theme.css fails the guard test), the built-in icon set (same
source as icon appearances render from), image… (file picker via
the existing import pipeline → SetNodeAppearance with the new
assetId, crop null), card (disabled with tooltip when the node
has no note — the hint-charm census already knows). Dispatch via
`host.gateway.execute('SetNodeAppearance', { nodeId, appearance })`;
verify the handler's inverse restores the previous appearance
(one undo). Popover obeys §8.8 (anchored, clamped).

### Files to Touch

`apps/desktop/src/renderer/canvas/charms-ui.ts`: charm + popover.
`apps/desktop/src/renderer/theme.css`: only if a token is missing.
`apps/desktop/e2e/` (canvas/board spec home for charm tests): new
coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] Appearance charm renders in the ratified bar order (crop ·
      flips · divider · appearance · make-canvas · note · # ·
      lock) with tooltip.
- [ ] Popover: dot swatches (canonical palette), icon set, image…,
      card; card disabled without a note; only one charm popover
      open at a time.
- [ ] Each pick commits SetNodeAppearance and the board re-renders
      without reselection; one undo restores the prior appearance.
- [ ] image… imports through the ordinary pipeline and repoints
      appearance; cancel imports nothing.
- [ ] e2e: dot→icon switch renders and one undo restores; card
      enabled/disabled by note presence; dot→card renders the card
      chrome.
- [ ] Full gates.

### Acceptance Criteria

**GIVEN** a selected dot node with an attached note
**WHEN** the artist opens the appearance charm and picks card
**THEN** the placement renders the card appearance immediately
**AND** one undo returns it to the dot with its original color.
**GIVEN** a node with no note
**WHEN** the popover is open
**THEN** card is visibly disabled with a tooltip naming why.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
