---
node_id: AI-IMP-250
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - consolidation
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-027-hardening-and-consolidation]]
confidence_score: 0.75
date_created: 2026-07-10
date_completed:
---


# AI-IMP-250-anchored-surface-placement

## Summary of Issue #1

RFC §8.8 mandates ONE shared clamp-and-flip helper for every
anchored surface, including reserved chrome bands
(`RAG/RFC-0001-Core-Note-Node-and-Canvas-Model.md:2399-2407`).
Audit HC-002 (`RAG/CODE-AUDIT-2026-07-10-HELPER-CONSISTENCY.md`)
found eight independent hand-rolled clamps instead — and they
disagree: `format-bar.ts:87-103` handles an oversize surface;
`TagPanel.svelte:82-83`, `LocationChooser.svelte:17-18`, and
`SearchPanel.svelte:98-102` compute
`Math.min(lowerBound, bounds.width - surfaceWidth)`, which goes
NEGATIVE when the host is narrower than the surface and places
chrome off-screen. None accepts §8.8's reserved bands. Done means:
one pure helper (anchor, measured surface, free region/bands,
preferred side(s), gap, margin), every anchored surface migrated,
undersized-host unit cases, and a guard scan that fails on new
surface-local clamp functions.

### Out of Scope

- Panel lifecycle, focus, or domain behavior of any migrated
  surface — geometry only.
- Note-panel spawn layout beyond what its clamp shares (AI-IMP-193
  landed local `Math.min/max` there; migrate only if mechanical).
- Crop's NaN-mapping clamp (different contract, per audit).

### Design/Approach

Pure function in the renderer (no Svelte imports) so it is
unit-testable without a DOM. Signature per the audit's repair
scope: `placeAnchored({ anchor, surface, host, bands?, side?,
gap?, margin? }) → { x, y, flipped }`. Flip when the preferred
side lacks room; clamp into the band-reduced free region; when the
surface exceeds the free region, pin to the margin edge (the
`clampBar` oversize behavior — never a negative coordinate).
Migrate call sites mechanically, preserving each surface's current
preferred side and gap. Guard: a vitest scan (like existing house
scans) failing on new `Math.min(...clientWidth - ...)`-style local
clamps in chrome/menus/tags, with an explicit exemption list.

PRE-IMPLEMENTATION REVIEW (standing process): verify every cited
line against current source before writing code; record
corrections here.

### Files to Touch

- `apps/desktop/src/renderer/chrome/anchored-placement.ts` (new):
  the helper + unit tests beside it.
- `apps/desktop/src/renderer/canvas/format-bar.ts`: replace
  `clampBar` internals with the helper (keep its export if tests
  consume it).
- `apps/desktop/src/renderer/menus/ContextMenu.ts`: drop local
  `clampInto`.
- `apps/desktop/src/renderer/tags/TagPanel.svelte`,
  `chrome/LocationChooser.svelte`, `chrome/SearchPanel.svelte`:
  host-relative migration (fixes the negative-bound bug).
- `apps/desktop/src/renderer/chrome/MirrorAsk.svelte`,
  `RecognitionChip.svelte`, `DropBehaviorAsk.svelte`:
  window-relative migration.
- Guard scan test file (desktop vitest).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Pre-implementation review: audit citations verified against
      current source; corrections recorded in this ticket.
- [ ] `anchored-placement.ts` helper with unit tests: normal fit,
      flip, band-reduced region, oversize surface (pins to margin,
      never negative), zero-size host.
- [ ] All eight audit-cited surfaces migrated; each surface's
      previous preferred side/gap preserved.
- [ ] Undersized-host regression: a host narrower than TagPanel's
      surface yields an on-screen (≥ margin) x.
- [ ] Guard scan fails on a new hand-rolled clamp; exemption list
      documents any deliberate holdouts.
- [ ] `pnpm -r build`, package units, desktop `npx vitest run`
      green. (Electron e2e supplied by the lead at merge.)

### Acceptance Criteria

**Scenario:** anchored chrome on an undersized host.
**GIVEN** a host window narrower than the tag panel surface
**WHEN** the panel is anchored and placed via the shared helper
**THEN** its x/y stay within the host at the margin (never
negative / off-screen)
**AND** every §8.8 surface routes through the one helper
**AND** the guard scan rejects a newly added local clamp.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
