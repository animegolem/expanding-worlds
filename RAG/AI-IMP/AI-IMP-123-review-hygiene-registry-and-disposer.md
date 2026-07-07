---
node_id: AI-IMP-123
tags:
  - IMP-LIST
  - Implementation
  - keymap
  - note-panel
  - hygiene
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-06
date_completed: 2026-07-06
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

- [x] Registry declarations for undo/redo; Settings Keyboard
      section lists them with platform-correct combos (e2e
      updated, platform-aware).
- [x] undo-keys matching derives from (or is asserted consistent
      with) the registry declaration so the printed combo can
      never drift from the handled one.
- [x] panels.ts retains the port dispose in `disposers`; teardown
      unsubscribes (test or targeted assertion).
- [x] `'card'` in AppearanceKind; `pnpm -r build` surfaces and
      resolves any exhaustiveness fallout.
- [x] renderMetadataBlock neutralizes `[[` in filenames and source
      URLs; unit proves a `[[hostile]]` filename mints no link token
      (extractWikiLinks over the rendered block is empty).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`,
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

**Undo/redo — declaration + derivation, not just declaration.** The
ticket's bar was declaration-only, but rather than leave a hand-copied
combo in `undo-keys.ts` beside the new registry entry (the exact drift
the checklist warns of), I made the handler *derive* from the registry:
`undo-keys.ts` now exports `undoActionForEvent(event)` = `matches(event,
KEY.redo) ? 'redo' : matches(event, KEY.undo) ? 'undo' : null`, and the
capture-phase `onKeydown` routes through it. Dispatch, and the
editor/takeover deferral guards, stay in `undo-keys.ts` (§10.2), so this
is not the deferred "move dispatch into the registry dispatcher" —
it is single-source-of-truth combo matching. Scope declared as `board`
per Files-to-Touch; the rows land in the settings "On a board" group.
`undo-keys.test.ts` pins the classification (⌘Z/Ctrl+Z → undo,
⇧⌘Z/Ctrl+Shift+Z → redo, Alt/bare/non-Z → null) against the printed
chip (`formatBinding`) so a declaration change moves both together.

**`[[` neutralization mechanism — break the pair with a single space.**
`neutralizeWikiTokens(text) = text.replace(/\[(?=\[)/g, '[ ')`. The
lookahead matches only a `[` immediately followed by another `[`, so:
(a) a lone bracket (`photo[1].png`) is never touched → render output is
byte-identical for any input without `[[` (round-trip tests unchanged,
verified green); (b) matching *each* `[` in a run means an odd run like
`[[[` collapses to `[ [ [` with no surviving adjacency (a
`[[…` reopener that a naive `replaceAll('[[', …)` would leave behind).
A visible space (over a zero-width char) keeps the exported markdown
honest and human-readable in a plain reader, and makes the neutralized
text obviously inspectable. Applied to `originalFilename` and
`sourceUrl` only (importDate is caller-reduced YYYY-MM-DD). Unit test
renders a block with a `[[hostile]] … [[[triple.png` filename and a
`[[evil]]` URL and asserts `extractWikiLinks(block)` is `[]`.

**`'card'` in `AppearanceKind` — no exhaustiveness fallout.** The type
is consumed only by `NodeRecord.appearanceKind` (no `switch` with a
`never` default anywhere in the tree — canvas-engine and commands carry
their own `'card'`-inclusive unions). Widening the union only admits
more assignments; `pnpm -r build` stayed green.

**panels.ts disposer — async capture with a detach-race guard.**
`createNoteProjectPort()` resolves after `attachPanels` may already have
detached, so a bare "store dispose in `disposers`" would still leak when
the port lands post-teardown. The disposer entry flips a `detached`
flag; the `.then` disposes immediately if it lands after detach, else
records `portDispose` for the disposer to call. `panels-teardown.test.ts`
mocks `./project-port` with a hand-resolved promise and drives both
orders (settle-then-detach, detach-then-settle), asserting `dispose`
fires exactly once each. panels.ts had no prior unit-test home; the new
focused file runs under the existing node-env vitest with a minimal
`window`/handle stub (all `window` access along the import chain is
inside functions, so module load is clean).

**Gates (verbatim).** `pnpm -r build` → exit 0. `pnpm lint` → exit 0.
`pnpm -r test` → all packages green (desktop = vitest + build + full
playwright). Desktop gate standalone: vitest **82 passed (11 files)**,
electron-vite build ok, playwright **132 passed** (3.2m) — the
source-panel known-flake spec did not trip; no retry needed. Domain
`note-metadata.test.ts` **12 passed**; desktop `undo-keys` +
`panels-teardown` **5 passed**.
