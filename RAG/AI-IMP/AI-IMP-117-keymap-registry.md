---
node_id: AI-IMP-117
tags:
  - IMP-LIST
  - Implementation
  - keyboard
  - settings
kanban_status: backlog
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
combo chips, read-only. e2e: the section lists at least the known
set; a spot-check that a migrated binding (Mod+P) still fires.

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

- [ ] Registry module with unit tests (declare, duplicate-id
      guard, matches, formatCombo per platform).
- [ ] Every existing global/board/gallery binding declared and
      consulting the registry; zero behavior change (existing
      key e2e green untouched).
- [ ] Tooltip shortcut chips print from formatCombo.
- [ ] Settings Keyboard section lists all registered bindings by
      scope, read-only.
- [ ] e2e: section renders the known bindings; Mod+P still opens
      quick-open post-migration.
- [ ] Full gates.

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
