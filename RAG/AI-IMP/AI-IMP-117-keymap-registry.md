---
node_id: AI-IMP-117
tags:
  - IMP-LIST
  - Implementation
  - keyboard
  - settings
kanban_status: in-progress
depends_on:
parent_epic: [[AI-EPIC-016-context-click-menus]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed:
---

# AI-IMP-117-keymap-registry

## Summary of Issue #1

Keybindings are per-module window listeners (navigation.ts Mod+P,
PathBar/bookmarks Mod+1–9 and Mod+D, board keys in host/
board-tooling/gestures, dock tool keys, gallery-keys, undo/
undo-keys Mod+Z) with no single source of truth — the retrofit
cost grows with every binding, and the "very mad if it's missing"
keyboard settings page is impossible without a registry (owner,
2026-07-06; RFC rev 0.48 §8.2). Done = one thin registry every
binding declares through, existing listeners consulting it, the
tooltip chips printing from it, and a view-only Keyboard section
in Settings listing everything. REBINDING IS OUT OF SCOPE.

### Out of Scope

- Rebinding/overrides (deferred until the registry proves itself —
  the §8.2 shaping records the eventual override design).
- CodeMirror's editor-local keymap (its own world, listed in the
  settings page as one non-editable "in the note editor" group at
  most).

### Design/Approach

`apps/desktop/src/renderer/keys/registry.ts`: declare(id, {combo,
name, scope: 'global'|'board'|'gallery'|'menu', when?}) returning
the combo; a `formatCombo` helper renders platform glyphs (⌘Z vs
Ctrl+Z) for tooltips and the settings list. Migration is
mechanical, not behavioral: each existing listener keeps its own
dispatch but reads its combo + match predicate from the registry
(one `matches(event, id)` helper), so behavior is unchanged and
the registry knows every binding. Tooltip chips that print
shortcuts source the string from `formatCombo`. SettingsView gains
a Keyboard section: registered bindings grouped by scope, name +
combo chips, read-only, with a quiet "rebinding coming soon" line at the
section head (owner call 2026-07-06: the page states the plan
instead of looking finished-and-limited). This ticket also ships
**Mod+D bookmark-current-board** (rev 0.48 §8.1, ratified — no
other ticket owns it) as the registry's first new binding,
declared through the registry and dispatched in the bookmarks
module, equivalent to the menu's bottom row. e2e: the section
lists at least the known set; a spot-check that a migrated
binding (Mod+P) still fires; Mod+D bookmarks the board.

### Files to Touch

`apps/desktop/src/renderer/keys/registry.ts` (+ unit test): new.
`chrome/navigation.ts`, `chrome/PathBar.svelte`/`bookmarks.ts`,
`canvas/board-tooling.ts`/`gestures-ui.ts`/`host.ts` (key
constants only), `chrome/Dock.svelte`, `views/gallery-keys.ts`,
`renderer/undo/undo-keys.ts`: consult the registry.
`views/SettingsView.svelte`: the Keyboard section.
`apps/desktop/e2e/` (settings/shell spec home): coverage.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Registry module with unit tests (declare, duplicate-id
      guard, matches, formatCombo per platform).
- [x] Every existing global/board/gallery binding declared and
      consulting the registry; zero behavior change (existing
      key e2e green untouched).
- [x] Tooltip shortcut chips print from formatCombo.
- [x] Settings Keyboard section lists all registered bindings by
      scope, read-only.
- [x] e2e: section renders the known bindings; Mod+P still opens
      quick-open post-migration.
- [x] Full gates.

### Acceptance Criteria

**GIVEN** the settings takeover's Keyboard section
**WHEN** the artist opens it
**THEN** every registered binding appears with its platform-glyph
combo, grouped by scope
**AND** every migrated shortcut still fires exactly as before.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Undo/Redo deferred (lead instruction).** AI-IMP-114 is concurrently
building `renderer/undo/**` in another worktree, so this ticket does
NOT declare or migrate Mod+Z / Shift+Mod+Z and does not touch
`renderer/undo/**`. They join the registry as a follow-up after 114
merges — `keys/bindings.ts` carries a comment recording this, and the
☰ menu's Undo/Redo rows (menu scope) come with them. The Scope type
already includes `'menu'` for that follow-up; no menu-scope bindings
exist yet, so the settings section renders only Global/Board/Gallery.

**Registry shape — tri-state modifiers.** The existing listeners were
NOT uniform: some required a modifier off (`quick-open` rejects Alt and
Shift), others fired regardless of it (`Delete` deletes with or without
Shift; `Mod+A` select-all fires with or without Shift). To guarantee
"zero behavior change," a combo's `mod/shift/alt` are tri-state for
matching — `undefined` = don't-care, `true`/`false` = required on/off —
so `matches(event, id)` is a byte-exact drop-in for each original
predicate. `formatCombo` only prints modifiers that are explicitly
`true`, so a don't-care never shows a phantom key in a chip. Board
`select-all` and reorder combos use `code` (physical key) to mirror the
original `event.code` predicates exactly; the reorder Shift-split is two
combos (send-forward vs send-to-front) checked front-first, preserving
the old `shift ? 'front' : 'forward'` ternary.

**Mod+D reuses the exact ＋-row path.** The menu's bottom row ran an
inline `CreateBookmark` (uuidv7 id, leaf-crumb label, live camera). I
extracted that verbatim into `bookmarks.bookmarkCurrentBoard(handle)`;
`BookmarkMenu.addCurrent` now calls it, and the new Mod+D listener
(added to PathBar's existing bookmark keydown effect, behind the same
INPUT/textarea guard) dispatches the same function — so the shortcut and
the click issue the identical command. e2e proves the captured viewport
rides along, confirming the shared path.

**Deviations from the ticket's file list (honest scope notes):**
- `views/gallery-keys.ts` is pure index arithmetic — no combos, no
  keydown listener (the gallery's actual listener lives in
  `views/GalleryView.svelte`, which is NOT in this ticket's file list
  and whose e2e is outside the assigned validation set). I left both
  untouched to avoid an unvalidated regression, and instead declared
  the gallery bindings (select-all, cursor move, bucket-jump, page,
  open, toggle-select, delete) centrally in `keys/bindings.ts` so the
  settings Keyboard section lists them. The gallery listener therefore
  does not yet consult the registry for dispatch; a future light pass
  can wire GalleryView's two clean combos (Mod+A, Mod+↑/↓) through
  `matches` when that file is in scope. gallery-keyboard.spec.ts stays
  green (declarations are side-effect-only).
- `canvas/host.ts` and `canvas/board-tooling.ts` hold only modal keys
  (Space to pan, Escape to cancel a tool / background edit), not named
  shortcuts, so they were left untouched — declaring "Space" and "Esc"
  as rebindable shortcuts would misrepresent them. `gestures-ui.ts`
  (the real board-shortcut listener) fully consults the registry.

**Worktree gotcha (process note, not a code issue).** The agent
worktree had no `node_modules`; `pnpm install` (reused the shared
store, 2.3s) plus the playwright globalSetup's electron-husk repair
were needed before gates ran. All gates were then run from the
worktree root, not the main checkout.

**Validation (worktree, exact):** `pnpm -r build` OK (989 modules).
`pnpm --filter desktop test:unit` → 7 files, 58 tests passed (registry
suite included). `pnpm lint` clean. Playwright `shell.spec.ts
navigation.spec.ts settings.spec.ts search.spec.ts gestures.spec.ts
board-tooling.spec.ts gallery-keyboard.spec.ts --retries=0` → 32
passed (incl. the 3 new AI-IMP-117 tests; every pre-existing key e2e
green).
