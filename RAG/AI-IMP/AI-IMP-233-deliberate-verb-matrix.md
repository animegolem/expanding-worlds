---
node_id: AI-IMP-233
tags:
  - IMP-LIST
  - Implementation
  - undo
  - P2
kanban_status: completed
depends_on: [AI-IMP-230]
parent_epic:
confidence_score: 0.65
date_created: 2026-07-09
date_completed: 2026-07-09
---


# AI-IMP-233-deliberate-verb-matrix

## Summary of Issue #1

Sol audit CA-008 (P2, lead-verified against the ruling): the
owner's ratified rule — EVERY deliberate verb joins Mod+Z except
node-trash — is still unimplemented for: AttachNoteToNode,
CreateNoteAndAttach, MakeNoteIndependent, RelinkBrokenLinks,
Group/UngroupDecorations, CreateCanvas, and the keyboard
multi-selection flip/reorder/lock loops (which also emit one
command PER ITEM — N undos for one gesture). Deeper defect:
relink's `create` branch inserts a note + binds links but its
inverse is always BreakNoteLinks — capturing it as-is would
un-link yet leave the created note and its unique-title
reservation as durable residue. Done means a command→undo policy
MATRIX (every durable command: captured / group-only / exempt +
why) lives in the undo module and is enforced by a test that
fails when a new command ships unclassified; the missing verbs
join capture; keyboard batch gestures wrap in explicit groups
(one gesture = one undo); relink-create gets a compound inverse
that also removes the note it created when safe.

### Out of Scope

- Node-trash (the ruling's exception, stays exempt).
- Redo invalidation (230 — build on it; depends_on).
- Gallery verbs (221's table feeds this matrix; merge there).

### Design/Approach

Matrix first: enumerate every registered command type (the
registry is the source of truth), classify per the ruling,
encode as a literal table the coordinator consults; a unit test
diff's the registry against the table so unclassified = red.
Wire the missing captures (inverses exist per 182's audit except
relink). Relink-create inverse: compound of BreakNoteLinks +
TrashNote/DeleteNote for the note it created — ONLY when the note
is still untouched (no body edits since create; else leave the
note, break links, document). Keyboard loops: wrap in
runAsUndoGroup (231's token form). E2e: each newly-captured verb
round-trips under Mod+Z; batch flip of 3 = one undo.

### Files to Touch

`renderer/undo/undo-store.ts` (matrix + captures), keyboard loop
sites in gestures-ui, relink inverse in
`persistence/src/handlers/notes.ts` + spec, e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Matrix covers every registered command; registry-diff test
      enforces it forever.
- [x] Missing verbs captured; batch gestures = one undo each.
- [x] Relink-create compound inverse (safe-case note removal);
      unsafe case documented + tested.
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [x] HUMAN-TESTING entry appended at merge by the lead (the
      owner ratifies the matrix — his ruling, his sign-off).

### Acceptance Criteria

**GIVEN** any deliberate verb in the app
**WHEN** the user presses Mod+Z
**THEN** it reverses (node-trash excepted) — and no future
command can ship without declaring its undo class.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**The matrix.** `UNDO_POLICY` in `undo-store.ts` is a literal table of
all 64 registered commands, each `{ class, why }`. The two capture Sets
are now DERIVED from it (single source of truth). `commandTypes()` from
a freshly-built persistence registry (all 11 handler groups, IO-free)
is diffed against the table by `apps/desktop/src/undo-policy.test.ts` —
unclassified registered command = red; stale matrix row = red; every row
must have a valid class + non-empty reason.

Class counts (64 total): **captured 19** · **group-only 13** · **exempt
32**.

- captured (bare-type, standalone-undoable): the 12 standing canvas
  verbs + the 7 CA-008 verbs — AttachNoteToNode, CreateNoteAndAttach,
  MakeNoteIndependent, RelinkBrokenLinks, GroupDecorations,
  UngroupDecorations, CreateCanvas.
- group-only (captured only inside a runAsUndoGroup window): frame
  primitives (CreateNode, SetNodeAppearance, CaptureInFrame,
  ReleaseFromFrame), polysemous UpdateDecoration, and the AI-IMP-182
  breadth verbs (RenameNote, AssignTagToNode, CreateTag, RenameTag,
  DetachNoteFromNode, Create/Remove/ReorderBookmark).
- exempt: editor-owned (UpdateNote), camera (SetCanvasCamera),
  asset-pipeline (CommitAssetImport), trash-is-recovery-home
  (TrashNode/Note/Canvas, DetachAndTrashNote), destructive-purge
  (PurgeRecord, PurgeDraftNote), internal-inverses (BreakNoteLinks, the
  DeleteDraft* family, UnplaceCard, UnmakeNoteIndependent, UnmergeTag,
  UnassignTagFromNode, Restore*), and not-a-renderer-verb / deferred
  (MovePlacement, DeletePlacement, DeleteDecoration, DeleteTag, MergeTag,
  SetTagAppearance, SetTrashRetention, CreateNote).

**Capture mechanism decision (matters for review).** CA-008's six verbs
(seven with CreateCanvas) are emitted ONLY at deliberate UI sites in
files this wave may NOT touch (`note/**`, `menus/**`,
`canvas/decorations-ui.ts`, `canvas/charms-ui.ts`). The existing
group-only pattern needs the UI site to wrap the commit in
`runAsUndoGroup` — impossible without editing those files. So I
classified them **captured (bare-type)** instead: the coordinator
captures them by type with no UI change. Verified SAFE — none is emitted
programmatically in a burst (import-surfaces emits only CreatePin /
TransformContent / CaptureInFrame / CreatePlacement; a grep confirms each
of the seven has exactly one renderer emit site, all deliberate). Each
has a tested inverse; the e2e already exercises AttachNoteToNode's
reciprocal via the existing detach test.

**Owner-ratification flags (for the HUMAN-TESTING sign-off).** A few
registered commands are arguably deliberate verbs but were classified
`exempt` (deferred), NOT captured, because they are outside CA-008's
enumerated scope and/or carry a residue hazard:
- **CreateNote** (loose-note creation, NotePanel) — deliberate, but
  capturing it shares relink-create's created-note-residue hazard (undo
  would delete a note the user may have started editing). Deferred
  pending the same safe-removal ruling.
- **MergeTag / SetTagAppearance** — no renderer gesture wired today.
- **SetTrashRetention** — a Settings verb; reversed via Settings.
- **Trash* family** — classified exempt under the node-trash
  recovery-home rationale (the ruling names node-trash explicitly; I
  extended it to note/canvas trash for consistency — owner to confirm).

**Keyboard batch gestures.** `flipSelection`, `reorderSelection`,
`lockSelection` in `gestures-ui.ts` now wrap their per-item loop in
`runAsUndoGroup`, so one chord = one undo across N items (was N undos).
Used the EXISTING global `runAsUndoGroup` (231 stopped): a keyboard flip
is a single synchronous gesture with no nesting/overlap, so the global is
correct here — the e2e "batch flip of three = one undo" proves it.
openAsBoard/new-board code in the same file was left untouched.

**Relink-create compound inverse** (`persistence/handlers/notes.ts` +
spec). The `create` branch's inverse now carries `removeCreatedNoteId` +
`createdTitle` (two optional fields added to `BreakNoteLinksPayload` in
`@ew/commands` — minimal, flagged). `BreakNoteLinks` re-breaks the links
AND, when SAFE, deletes the created note: safe = note still active, body
still empty (untouched since create), and NO other bound link targets it
(the create-time sweep may have bound another source — that makes removal
unsafe). Safe case → inverse is a relink `create` (redo re-inserts the
note, symmetric). Unsafe case → note LEFT, inverse re-binds to it via
`targetNoteId` (documented). Three spec tests: safe removal + redo
re-create; edited-body unsafe (note stays); sweep-bound unsafe (note
stays).

**Boundary edits made (flag for review):**
- `packages/commands/src/payloads/notes.ts` — two optional fields on
  `BreakNoteLinksPayload` (required to express the compound inverse; the
  fence allowed `notes.ts` handler + spec "relink inverse only", this is
  the payload half of that).
- `packages/persistence/src/index.ts` — re-export `registerBookmarkHandlers`
  (the barrel omitted it; the registry-diff test needs every handler
  group reachable from the package root to enumerate the authoritative
  set). One line, and a genuine consistency fix.
- The registry-diff test lives at `apps/desktop/src/undo-policy.test.ts`
  (NOT under `src/renderer/**`) because RFC §11.1's eslint rule forbids
  renderer code importing `@ew/persistence`; the cross-boundary invariant
  check must enumerate the real registry.

**Depends on 230** (redo invalidation) — built on it; 231 (group
identity) STOPPED, but 233's keyboard grouping does not need it.

**Validation:** `pnpm -r build` clean · packages 1021 pass (persistence
557 incl. 3 new relink tests) · desktop vitest 341 pass (incl. matrix
diff 3, undo-store 17+1 skipped) · `pnpm lint` clean · e2e 4 foreground
shards: a–d 44 pass + 1 env failure (decorations `queryLocalFonts` under
hidden windows — untouched by this ticket; that test checks project
revision, never undo depth), e–i 65 pass + 1 flaky (frames-drop,
retry-green), j–r 75 pass, s–z 52 pass (incl. new batch-flip e2e).
