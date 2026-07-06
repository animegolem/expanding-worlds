---
node_id: AI-IMP-109
tags:
  - IMP-LIST
  - Implementation
  - appearance
  - chrome
kanban_status: in-progress
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

- [x] Appearance charm renders in the ratified bar order (crop ·
      flips · divider · appearance · make-canvas · note · # ·
      lock) with tooltip.
- [x] Popover: dot swatches (canonical palette), icon set, image…,
      card; card disabled without a note; only one charm popover
      open at a time.
- [x] Each pick commits SetNodeAppearance and the board re-renders
      without reselection; one undo restores the prior appearance.
- [x] image… imports through the ordinary pipeline and repoints
      appearance; cancel imports nothing.
- [x] e2e: dot→icon switch renders and one undo restores; card
      enabled/disabled by note presence; dot→card renders the card
      chrome.
- [x] Full gates.

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

- **No canonical dot palette existed.** The brief assumed a shared
  palette constant "the pin tool / existing dot creation uses." It
  does not: the pin tool and zero-node note both use the SINGLE token
  `--ew-node-dot-default`; seeds/tests sprinkle raw hex (`#e8c450`,
  `#a0c4ff`) with no shared source. The raw-hex guard (theme.test.ts)
  forbids literals in renderer source, and the ticket permits touching
  theme.css "only if a token is missing" — so I added the eight-swatch
  palette `--ew-node-dot-{blue,teal,green,gold,orange,red,purple,pink}`
  to theme.css as the canonical source (world content, theme-independent
  like the §11.5 canvas-flat swatches). The swatch click resolves the
  token to its stored hex via `themeTokenValue()` — the same move
  `zeroNodeNoteDotColor()` makes — so no hex leaks into charms-ui.ts.
- **No canonical icon set, and the renderer ignores the icon value.**
  `renderers/placement.ts` draws ONE generic diamond glyph for any
  `kind:'icon'` regardless of the stored string. So "same source as
  icon appearances render from" had no source to point at. I defined a
  six-id built-in set (`star, pin, flag, heart, bolt, leaf`) in
  charms-ui.ts — `star`/`pin` match ids already used in seeds/tests —
  as the vocabulary the switcher commits; the picker glyph is its own
  affordance. A future ticket giving per-icon rendering should read
  from this list.
- **Card disable can't use native `disabled`.** A disabled button
  swallows pointer events, so the "why" tooltip would never fire (the
  pre-existing disabled crop charm has the same latent problem). Card
  uses `data-disabled` + reduced opacity + a no-op guarded click + a
  `tooltip.update()` that swaps to "Card needs a note — attach one
  first," keeping it hoverable. e2e asserts both the attribute and the
  aria-label.
- **No interactive undo surface (EPIC-007 pending).** Proved "one undo
  restores" at the data level inside the e2e: the SetNodeAppearance
  handler returns an inverse that restores the exact prior appearance
  (dot color / icon / image / card — confirmed in
  `handlers/nodes.ts`), and the test executes that inverse and watches
  the node return to its previous kind.
- **image… cancel path** is guaranteed by an early `if (!file) return`
  in the change handler (input value cleared first), but is not
  e2e-driven: Playwright's `setInputFiles` cannot simulate a native
  file-dialog cancel. The import success path IS e2e-covered.
