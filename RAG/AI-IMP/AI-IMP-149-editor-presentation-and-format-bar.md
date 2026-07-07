---
node_id: AI-IMP-149
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - typography
kanban_status: planned
depends_on: [AI-IMP-146, AI-IMP-131]
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-149-editor-presentation-and-format-bar

## Summary of Issue #1

EPIC-018 FR-4. The LOUD presentation on the TipTap engine: typed
Markdown styles render live (headings sized AND colored per the
§7.1 tokens, bold/italic/code as they type), and rich-text
controls appear as a FLOATING BAR on selection only — no standing
chrome (rev 0.55 wireframe 1d). The bar offers the Markdown-backed
set (bold · italic · code · heading level · list · link) as
verbs, applies as typed-Markdown edits (carrier stays §7.1
canonical), and follows the §8.8 clamp + one-clock rules. Done
means a naive user can style without knowing Markdown while the
file stays plain Markdown.

### Out of Scope

- Maple font bundling (131 ships it; this consumes).
- New marks beyond CommonMark + the frozen dialect (150).

### Design/Approach

Live styling: TipTap marks/nodes styled from the 130/131 tokens
(headings per --ew-note-h*, editor scale). Format bar: selection-
driven bubble at the popover rung, MenuPopover-kin styling, verbs
dispatch TipTap commands whose serialization is the frozen dialect
(corpus-guarded). Keyboard shortcuts per platform convention
(Mod+B/I) declared in the keymap registry as editor-scope entries
(display; dispatch stays editor-local per §10.2).

### Files to Touch

`apps/desktop/src/renderer/note/` presentation styles + format-bar
component (+ units where logic).
`keys/bindings.ts` editor-scope declarations.
Note e2e: select → bar appears → bold applies → body carries
`**…**`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Live typed-Markdown styling on tokens (headings colored/
      sized; marks live).
- [x] Selection format bar: appears on selection only, clamps,
      applies Markdown-backed edits; e2e round-trip.
- [x] Editor-scope shortcut declarations listed in Settings.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (LOUD
      headings feel; bar timing on selection).

### Acceptance Criteria

**GIVEN** a selection in a note
**THEN** the floating bar appears, bold applies visually AND as
`**…**` in the saved body, and no standing chrome exists when
nothing is selected.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **What 131 already covered vs what this added.** 131's
  editor-face.css already had heading SIZE + COLOR (h1–h3 on the
  `--ew-note-h*` / `--ew-editor-h*` tokens) and the Maple face/scale.
  This ticket added the live inline marks: `strong` pinned to the
  bundled 700 face, `em` to the true-cursive 400i, and inline `code`
  as a tinted chip on two NEW theme tokens (`--ew-note-code-bg`,
  `--ew-note-code-text`; light-paper default + glass override,
  matching the note-h* pattern). `pre code` resets the chip so a
  fenced block is not one giant pill.
- **The "link" verb is a wiki-link, not a URL mark.** The schema has
  no Link mark (StarterKit v2 ships none, and the frozen-dialect
  corpus has no `[text](url)` case). Adding one would grow the §7.1
  dialect — 150's territory, out of scope here. The link verb
  therefore wraps the selection as the project's native `[[Title]]`
  token (literal bytes, source-preserving serializer, corpus-safe);
  `wikiLinkFor` rejects empty/whitespace/multi-line selections. Unit
  test pins the round-trip (`go to [[Harbor]] now`).
- **Bar placement is a ProseMirror plugin view, not a Svelte
  component.** One `position:fixed` element on `document.body` at
  `Z.popover`, positioned from `coordsAtPos` in viewport coordinates
  — so the same bar follows the ONE reparented buffer into the §8.5
  big editor with zero per-surface wiring. MenuPopover-kin styling
  (surface-menu/border/menu-shadow tokens); §8.8 clamp-and-flip is a
  pure `clampBar` helper with unit coverage (flip below on top-edge
  clip, clamp all four edges).
- **Focus/blur dispatch no PM transaction**, so the plugin view's
  `update` never fires for them — a blurred panel would strand a
  stale bar. Fixed with direct focus/blur listeners on `view.dom`
  (deferred one tick so `hasFocus()` reads settled state).
- **FormatBar rides `baseNoteExtensions()`**, so the headless
  round-trip editors (corpus test, `roundTripMarkdown`) also mount a
  bar element on `document.body` briefly — harmless (removed on
  destroy, never displayed without focus+selection) and it keeps the
  guarantee that the corpus exercises exactly the shipped extension
  set.
- **Shortcut declarations** added a new `editor` scope to the keymap
  registry (`Scope` union) and the Settings Keyboard section ("In a
  note"); Mod+B/Mod+I are display-only declarations — dispatch stays
  TipTap's editor-local mark keymaps per §10.2, mirroring the
  Undo/Redo declaration-only precedent (AI-IMP-123).
- Validation: targeted vitest 6 files / 84 tests green (corpus
  included); full gates `pnpm -r build`, `pnpm -r test` (vitest +
  full desktop e2e hidden, 176 passed), `pnpm lint` clean. The
  `fatal: ambiguous argument 'main'` lines in the e2e log are
  snapshot-push.spec polling its bare remote before the first push
  lands — pre-existing noise, that test passes.
