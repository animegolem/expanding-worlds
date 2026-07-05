---
node_id: AI-IMP-037
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - text
kanban_status: completed
depends_on: [AI-IMP-034]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-037-system-font-picker

## Summary of Issue #1

The type row offers three generic stacks; the owner asked for real
system fonts (RFC rev 0.13, §4.9). Chromium's Local Font Access API
(`queryLocalFonts`) enumerates installed fonts in Electron once the
main process grants the `local-fonts` permission, and Pixi renders
any installed family by CSS name. Done means: the family picker
lists installed fonts (lazily enumerated on first open, deduped by
family), selections store the family WITH a generic fallback so
boards degrade gracefully on machines lacking the font, and the
curated stacks remain when the API is unavailable or denied.

### Out of Scope

Bundling font files; per-project font embedding; font preview
rendering in the dropdown; weight/style axes beyond bold/italic.

### Design/Approach

Main: `session.setPermissionRequestHandler` (and check-handler)
grants `local-fonts` for the app window. Renderer: a lazy
`loadSystemFontFamilies()` in a small module — called on the family
select's first pointerdown (user activation), caching the deduped
family list, falling back to the curated stacks on any error.
DecorationToolbar seeds the select with stacks + system families;
committing stores `"Family", sans-serif` so the fallback rides the
data. measureTextWorld and the entry overlay already accept any CSS
family string. e2e: open the picker, assert enumeration grew the
option count (macOS runners always have fonts), select a family and
assert the committed data carries it plus the fallback.

### Files to Touch

`apps/desktop/src/main/index.ts`: local-fonts permission grant.
`apps/desktop/src/renderer/canvas/system-fonts.ts` (new): lazy
enumeration with fallback.
`apps/desktop/src/renderer/DecorationToolbar.svelte`: picker wiring.
`apps/desktop/e2e/decorations.spec.ts`: picker e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Main-process permission request + check handlers grant
      local-fonts.
- [x] system-fonts.ts: lazy queryLocalFonts enumeration, family
      dedupe, curated-stack fallback on error/absence.
- [x] Type row picker: stacks first, then system families; committed
      fontFamily stores family + generic fallback.
- [x] e2e: picker enumerates (>3 options) after opening; selecting a
      real family commits data.fontFamily containing it and a
      fallback; renderer text restyles.
- [x] Full gates: build, unit suites, desktop e2e, lint.

### Acceptance Criteria

**Scenario:** Artist styles a label with a favorite installed font.
**GIVEN** a selected text decoration
**WHEN** the artist opens the font picker
**THEN** installed system fonts appear alongside the generic stacks.
**WHEN** one is chosen
**THEN** the canvas text renders in it and the stored value carries a
generic fallback for machines without the font.
**GIVEN** the API is unavailable
**THEN** the picker still offers the curated stacks.

### Issues Encountered

<!-- Filled out post-work. -->
Electron 39's TypeScript permission union lags Chromium (no
'local-fonts' member) — handlers compare as strings. queryLocalFonts
enumerated fine under Playwright-driven Electron (the real click
supplies the user activation the API wants). Values already stored
by rev 0.12 (plain stacks) keep matching the picker; a stored family
missing from the enumerated list renders as an extra option so the
select never shows a blank.
