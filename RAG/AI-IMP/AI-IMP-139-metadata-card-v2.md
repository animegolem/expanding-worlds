---
node_id: AI-IMP-139
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - notes
  - note-panel
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
---


# AI-IMP-139-metadata-card-v2

## Summary of Issue #1

Design-letter-3 item 16 got its design (kit NoteMetaCard): the
shipped placeholder card becomes the visibly-SYSTEM block — a
labeled mono "SYSTEM" seam separating it from prose, mono
micro-type on the info-panel surface, the placements tree as
FOLDABLE rows (▾/▸ per board with nested boards folding) each
carrying a `⌖ fly` chip, provenance including the importing
connector line, and a dashed "metadata off for this note" disabled
state. Done means the card matches the kit reference on tokens,
folding works per the outliner grammar, and all §7.8 behavior
(live compute, fly-to, toggles) is unchanged.

### Out of Scope

- Any persistence/§7.8 semantic change (presentation only).
- Editor-side outliner folding (EPIC-018).

### Design/Approach

Restyle `MetadataCard.svelte` to the kit anatomy (reference JSX +
panels.card.html; tokens only — `--ew-paper-info-panel` etc. from
130 if new, else existing paper tokens). Fold state is ephemeral
UI state (not persisted). Rows keep existing depth data; nested
groups collapse under their board row. Fly chips reuse the
existing fly-to action. Keep testids stable for the shipped
note-metadata e2e; extend it for fold + disabled state.

### Files to Touch

`apps/desktop/src/renderer/note/MetadataCard.svelte` (+ existing
e2e extended).
`apps/desktop/src/renderer/theme.css` only if a needed surface
token is missing (coordinate with 130).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] SYSTEM seam + mono micro-type + info surface per reference;
      tokens only.
- [ ] Foldable tree rows with ⌖ fly chips; behavior unchanged
      (fly e2e still green).
- [ ] Off state renders the dashed explainer.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does
      SYSTEM read as system; 40-board scannability with folds).

### Acceptance Criteria

**GIVEN** a note on a node placed across nested boards
**THEN** the card renders below a SYSTEM seam with foldable board
rows and fly chips that navigate
**AND** toggling the note off shows the dashed disabled state.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
