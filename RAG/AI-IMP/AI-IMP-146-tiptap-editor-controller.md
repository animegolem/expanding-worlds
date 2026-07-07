---
node_id: AI-IMP-146
tags:
  - IMP-LIST
  - Implementation
  - rich-text
  - notes
kanban_status: planned
depends_on:
parent_epic: [[AI-EPIC-018-rich-text-notes]]
confidence_score: 0.6
date_created: 2026-07-07
date_completed:
---


# AI-IMP-146-tiptap-editor-controller

## Summary of Issue #1

EPIC-018 FR-1 (rev 0.56 §7.1; spike: RAG/spike-reports/
tiptap-verdict.md). Replace `NoteEditorController`'s CodeMirror
internals with a TipTap editor while preserving the EXACT commit
lifecycle: §7.1 idle debounce, blur/switch/quit flush,
`flushPending`, `syncExternal` (with `addToHistory:false` so
external body updates never enter the editor's undo), and the §7.8
strip/reattach seam. Ships the ONE-TIME canonicalize-on-load (a
note's body normalizes to the frozen dialect at first open in the
new editor, committed through the ordinary save path). Done means:
every existing note e2e passes on the new engine, the spike's
round-trip corpus runs as domain tests, and a real hidden-Electron
smoke opens/types/saves.

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

- [ ] Controller swap with lifecycle byte-compatibility; all
      existing note/undo e2e green unchanged.
- [ ] syncExternal isolation proven (unit: external update never
      undoable in-editor).
- [ ] Canonicalize-on-load: once per note, via ordinary save; e2e
      proves second open is a no-op.
- [ ] Spike corpus lands as permanent domain tests.
- [ ] Hidden-Electron smoke (the spike's deferred check).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (typing
      feel vs CodeMirror; any dialect churn surprise in Obsidian).

### Acceptance Criteria

**GIVEN** an existing note opened in the new editor
**THEN** it canonicalizes once, edits/saves per §7.1 exactly as
before, and external updates never pollute editor undo.
**GIVEN** the full note e2e suite
**THEN** green with no spec changes beyond the canonicalize test.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
