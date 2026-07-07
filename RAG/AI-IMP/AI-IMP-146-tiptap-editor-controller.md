---
node_id: AI-IMP-146
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-146-tiptap-editor-controller

## Summary of Issue #1

EPIC-018 FR-1 (rev 0.56 §7.1; spike: RAG/spike-reports/
tiptap-verdict.md). Replace `NoteEditorController`'s CodeMirror
internals with a TipTap editor while preserving the EXACT commit
lifecycle: §7.1 idle debounce, blur/switch/quit flush,
`flushPending`, `syncExternal` (external PROSE rewrites fold into
editor-local undo exactly as the shipped `input.external`
discipline — the §17-15 e2e pins this; see Issues for why the
literal `addToHistory:false` isolation lives on the load path
instead), and the §7.8 strip/reattach seam. Ships the ONE-TIME
canonicalize-on-load (a note's body normalizes to the frozen
dialect at first open in the new editor, committed through the
ordinary save path). Done means: every existing note e2e passes on
the new engine with SELECTOR-ONLY updates (engine-agnostic hooks;
behavior assertions unchanged — lead ruling, co-landed with
AI-IMP-147 on one branch), the spike's round-trip corpus runs as
domain tests, and a real hidden-Electron smoke opens/types/saves.

### Out of Scope

- Link/embed atoms (147), folding (148), Maple/format bar (149),
  dialect freeze documentation (150).
- Any change to persistence or the §7 save semantics.

### Design/Approach

Per the spike: tiptap-markdown carrier config from the prototype;
prose-only path through the §7.8 strip seam (whole-body is
disqualified — the fence comment would be HTML-escaped). The
controller interface (`open/flushPending/syncExternal/dispose`)
stays byte-compatible so NotePanel/panels.ts don't churn.
Canonicalization: on open, if serialize(parse(body)) ≠ body, treat
as a pending edit and commit once via the ordinary save (no undo
entry beyond the normal save path; note it happens at most once
per note). CodeMirror deps stay until 149 confirms nothing else
uses them (check gallery text posts etc.), then a cleanup ticket
removes them.

### Files to Touch

`apps/desktop/src/renderer/note/note-editor.ts` (the swap).
`apps/desktop/package.json`: tiptap deps (minimal set from the
spike).
`packages/domain/src/` round-trip corpus tests (from spike).
Existing note e2e must pass unchanged; add a canonicalize-once
e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Controller swap with lifecycle byte-compatibility; all
      existing note/undo e2e green with SELECTOR-ONLY updates
      (engine-agnostic hooks; behavior assertions unchanged — lead
      ruling).
- [x] syncExternal semantics proven (unit, real editor): prose-only
      reconcile through the §7.8 strip seam — the metadata block
      never reaches the editing surface — and the external rewrite
      folds into local undo per the shipped `input.external`
      discipline (§17-15 e2e green). Note-load undo isolation:
      open() creates a FRESH EditorState, so history never crosses
      notes and a load is never undoable.
- [x] Canonicalize-on-load: once per note, via ordinary save;
      second open proven a no-op (unit through the real controller
      + editor factory; see Issues for why unit, not a new e2e).
- [x] Spike corpus lands as permanent domain tests (30 cases:
      canonical forms + fixed-point + link-identity invariants).
- [x] Hidden-Electron smoke: the full desktop e2e suite runs the
      TipTap editor in hidden windows (`EW_TEST_HIDDEN_WINDOWS=1`)
      — notes specs open/type/save/undo through it, 150/150 green.
- [x] Gates: `pnpm -r build`, `pnpm -r test` (150/150 e2e hidden),
      `pnpm lint` — all green 2026-07-07.
- [ ] HUMAN-TESTING entry appended at merge by the lead (typing
      feel vs CodeMirror; any dialect churn surprise in Obsidian).

### Acceptance Criteria

**GIVEN** an existing note opened in the new editor
**THEN** it canonicalizes once, edits/saves per §7.1 exactly as
before, and note loads never enter editor undo (external prose
rewrites fold into local undo per shipped §17-15 semantics).
**GIVEN** the full note e2e suite
**THEN** green with selector-only updates to engine-agnostic hooks
(`data-testid="note-editor-content"` / `"note-suggestions"`);
behavior assertions unchanged (lead ruling, co-landed with 147).

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Co-landed with AI-IMP-147 on `agent/imp-146-147-tiptap` per the lead
ruling (Option B, 2026-07-07 brief): the two tickets' seams are
inseparable — the wiki layer had to be re-authored for ProseMirror to
keep the controller's `extensions` hook meaningful.

**syncExternal vs the ticket's `addToHistory:false` wording.** The
ticket (and the lead ruling) specified `addToHistory:false` for
external updates. Implementing it literally FAILED the existing
§17-15 e2e (`rename flushes dirty buffers … folds into local undo`),
which asserts one undo steps BACK through a rename rewrite and redo
reapplies it — the shipped CodeMirror `userEvent:'input.external'`
semantics. The brief's own tiebreaker is "existing e2e pass; behavior
assertions unchanged", so shipped semantics won: syncExternal's prose
swap is an ordinary history-entering transaction. What the spike's
`addToHistory:false` finding actually protects — a note LOAD never
being undoable, undo never crossing notes — is preserved structurally:
`open()` swaps in a fresh `EditorState` (empty history). Both halves
are unit-proven in `note-editor.test.ts`. First implementation used
TipTap `setContent` for loads; that entered history and made undo
empty the whole document (caught by the same e2e, root-caused via a
temporary DOM dump, fixed with the fresh-state load).

**Canonicalize-once proof is unit-level, not a new e2e.** Proven in
`note-editor.test.ts` through the REAL controller + editor factory:
a `* star` body commits exactly one canonicalizing UpdateNote, and a
second `open()` produces zero further commits; an already-canonical
body commits nothing. A dedicated e2e was skipped: the session was
resumed under a no-new-e2e-runs constraint after the full suite
passed, and the 150/150 run already exercises open→type→save on
seeded bodies with zero canonicalization churn.

**Canonical corpus regenerated empirically.** Two draft canonicals
from the prior salvage were WRONG (`__bold__` → `**bold**`, not
`*bold*`; `[[   ]]` whitespace collapses to `[[ ]]` before escaping).
Every canonical in `packages/domain/src/markdown-dialect.ts` was
generated by running the real editor factory and verified to be a
fixed point (`serialize(parse(canonical)) === canonical`).

**Selector migration (engine-internal → stable hooks).** The editable
carries `data-testid="note-editor-content"`; the suggestion popup
carries `data-testid="note-suggestions"`. Every change:

| Spec | Lines (pre-migration) | Old selector | New selector |
|---|---|---|---|
| notes.spec.ts | 32, 45, 104, 121, 133, 141, 143, 167, 185, 214, 228, 246, 250, 256, 274, 278, 292, 298, 300, 377, 396, 429, 446, 496, 500, 505, 513, 525, 529, 533, 538, 541, 692 | `.cm-content` (incl. `.cm-content [data-link-title=…]` scopes and the contenteditable true/false assertions) | `[data-testid="note-editor-content"]` (same scopes/assertions) |
| notes.spec.ts | 125 | `.cm-tooltip-autocomplete` | `[data-testid="note-suggestions"]` |
| panels.spec.ts | 156, 198, 254, 340 | `.note-panel .cm-content` / `[data-testid="big-editor"] .cm-content` / `.cm-content [data-link-title="Far"]` | same scopes over `[data-testid="note-editor-content"]` |
| panels.spec.ts | 199 | `.note-panel .cm-editor` count 0 | `.note-panel [data-testid="note-editor-content"]` count 0 |
| panel-flyto.spec.ts | 28 | `.cm-content [data-link-title="Alpha"]` | `[data-testid="note-editor-content"] [data-link-title="Alpha"]` |
| search.spec.ts | 286 | `.cm-content` | `[data-testid="note-editor-content"]` |
| undo.spec.ts | 168 | `el.closest('.cm-editor')` | `el.closest('[data-testid="note-editor-content"]')` |
| undo.spec.ts | 203 | `.cm-content` | `[data-testid="note-editor-content"]` |

One behavior-adjacent spec change (not selector): §17-15 gained one
`await win.keyboard.press(undo)` restoration after debug
instrumentation removal — net identical to the original. Stale
"CodeMirror/CM" comment mentions in the five specs were updated to
engine-neutral wording (comments only). `data-link-title` /
`data-link-state` attributes and all behavior assertions are
untouched.

**CodeMirror leftovers.** Zero `@codemirror/*` imports remain
anywhere in `apps/desktop/src` or `packages/*/src`. The six
`@codemirror/*` deps stay in `apps/desktop/package.json` per the
ticket (removal deferred until 149 confirms nothing else needs them;
`@codemirror/autocomplete` is now also unused). Remaining mentions
are prose comments in panels.ts / NotePanels.svelte / NotePanel.svelte
/ undo-keys.ts / undo-store.ts / navigation.ts / keys/bindings.ts —
a cleanup ticket's business, not behavior.

**Deps added** (devDependencies, apps/desktop): `@tiptap/core`,
`@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-text`
(needed to replace the stock text node with the source-preserving
serializer), `tiptap-markdown`, `jsdom` (editor unit tests).
`undo-keys.ts` needed NO change (`isContentEditable` covers
ProseMirror).