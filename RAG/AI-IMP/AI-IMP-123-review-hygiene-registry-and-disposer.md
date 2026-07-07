---
node_id: AI-IMP-123
tags:
  - IMP-LIST
  - Implementation
  - keymap
  - note-panel
  - hygiene
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-06
date_completed:
---


# AI-IMP-123-review-hygiene-registry-and-disposer

## Summary of Issue #1

Four confirmed findings from the 2026-07-06 Codex reviews (rounds 1
and 2). (1) Undo/Redo shipped (AI-IMP-114) with capture-phase key
handling in `undo/undo-keys.ts` and printed shortcuts on the ☰ rows,
but the bindings never joined the keymap registry
(`keys/bindings.ts`) — this was a recorded debt, and Codex sharpened
it: the Settings Keyboard section claims to list every shortcut, so
the UI currently overclaims. (2) `attachPanels()`
(`note/panels.ts:503`) discards the `dispose` returned by
`createNoteProjectPort()`, so the project-changed subscription leaks
past panel-system teardown. (3) `AppearanceKind` in
`packages/domain/src/records.ts` is `'dot' | 'icon' | 'image'` while
migration 0006, command payloads, and canvas-engine types all carry
`'card'` — consumers typing persisted card nodes through domain
records are wrong. (4) `renderMetadataBlock`
(`packages/domain/src/note-metadata.ts`) interpolates original
filenames and source URLs verbatim; a filename containing `[[...]]`
would inject wiki-link tokens into the generated block, which the
lexical link extractor then indexes (and rename-time refresh
ordering assumes the block never changes prose ranges). Done means:
registry + Settings list undo/redo, the panels disposer is retained,
`'card'` joins `AppearanceKind` (and any switch over it compiles
exhaustively), and metadata rendering neutralizes `[[` so generated
blocks can never mint link tokens.

### Out of Scope

- Rebinding support (still deferred, §8.2).
- Moving undo dispatch INTO the registry's dispatcher (EPIC-007
  refactor territory; declaration-only is the ticket's bar).
- Widening the undo capture set (deliberate v1 narrowing per
  AI-IMP-114 — a DESIGN-QUEUE conversation, not hygiene).
- Any other Codex finding (triaged separately: the stale-dist P0/P1
  claims were environmental both rounds; SSRF redirects are
  AI-IMP-124; trashed-owner boards are AI-IMP-125).

### Files to Touch

`apps/desktop/src/renderer/keys/bindings.ts`: declare undo/redo
(scope: board; formatCombo prints Mod+Z / Shift+Mod+Z).
`apps/desktop/src/renderer/undo/undo-keys.ts`: reference the
registry declaration for combo matching or note the seam.
`apps/desktop/e2e/settings.spec.ts`: Keyboard section asserts the
undo/redo rows (platform-aware combo strings).
`apps/desktop/src/renderer/note/panels.ts`: capture and register
the port disposer.
`packages/domain/src/records.ts`: add `'card'` to AppearanceKind;
chase any newly-failing exhaustiveness.
`packages/domain/src/note-metadata.ts` (+ test): neutralize `[[`
in rendered filenames/URLs.
Unit test if the panels store has one covering teardown.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Registry declarations for undo/redo; Settings Keyboard
      section lists them with platform-correct combos (e2e
      updated, platform-aware).
- [ ] undo-keys matching derives from (or is asserted consistent
      with) the registry declaration so the printed combo can
      never drift from the handled one.
- [ ] panels.ts retains the port dispose in `disposers`; teardown
      unsubscribes (test or targeted assertion).
- [ ] `'card'` in AppearanceKind; `pnpm -r build` surfaces and
      resolves any exhaustiveness fallout.
- [ ] renderMetadataBlock neutralizes `[[` in filenames and source
      URLs; unit proves a `[[hostile]]` filename mints no link token
      (extractWikiLinks over the rendered block is empty).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`,
      desktop e2e hidden.

### Acceptance Criteria

**GIVEN** the Settings Keyboard section
**THEN** Undo and Redo are listed with their platform-correct
combos, and the "every shortcut" claim is accurate.
**GIVEN** the panel system attaches and detaches
**THEN** the project-changed subscription from the note project
port is disposed at teardown.
**GIVEN** a persisted card-appearance node typed through domain
records
**THEN** `AppearanceKind` admits `'card'`.
**GIVEN** an asset whose original filename contains `[[...]]`
**WHEN** its note's metadata block regenerates
**THEN** the rendered block contains no extractable wiki-link token.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
