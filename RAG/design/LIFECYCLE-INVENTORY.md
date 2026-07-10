# User-Action Lifecycle Inventory — the "document of actions" input

*Addendum to DESIGN-GAPS.md (owner request, 2026-07-09): every
user-intention arc in the app, found by code sweep, graded for
completeness. This is the worklist the document of actions draws
down. Grades: **COMPLETE** (all states + exits exist) ·
**FUNCTIONAL** (works, states missing/undesigned) · **BROKEN-ARC**
(a state is unreachable or a dead end) · **UNDESIGNED** (in code,
no design record). Paths under `apps/desktop/src/renderer/` unless
noted. Compiled 2026-07-09 at main ~dbaadd87; line numbers drift.*

**Tally: 40 lifecycles — 6 COMPLETE · 24 FUNCTIONAL · 8 BROKEN-ARC
· 2 UNDESIGNED.** Two are the flagship design lifecycles already in
progress (N1 notes, B1 boards-being-born) — listed with pointers.

## Summary table

| # | Lifecycle | Domain | Grade |
|---|---|---|---|
| A1 | An image arrives (drop/paste/URL/note) | Images | FUNCTIONAL |
| A2 | A drop is mirrored / duplicate recognized | Images | FUNCTIONAL |
| A3 | An image's appearance is set (+crop) | Images | FUNCTIONAL |
| A4 | The board background is set / edited | Images | COMPLETE |
| N1 | A note is read / opened / written | Notes | UNDESIGNED (flagship) |
| N2 | A note is created & attached | Notes | FUNCTIONAL |
| N3 | A note is pinned / torn / placed | Notes | FUNCTIONAL |
| N4 | A wiki link is activated (bound/phantom/broken) | Notes | BROKEN-ARC |
| N5 | A note is renamed / title collides | Notes | FUNCTIONAL |
| N6 | The command palette is used | Notes | COMPLETE |
| B1 | A board is born (New board / Make-canvas) | Boards | UNDESIGNED (flagship) |
| B2 | A board is entered & navigated | Boards | FUNCTIONAL |
| B3 | A place is bookmarked & followed | Boards | FUNCTIONAL |
| T1 | A tag is assigned | Tags | FUNCTIONAL |
| T2 | A tag is removed | Tags | BROKEN-ARC |
| T3 | The tag panel is opened/renamed/lensed | Tags | COMPLETE |
| G1 | Collection browsed/filtered/quick-looked | Gallery | FUNCTIONAL |
| G2 | Works acted on in bulk (place/tag/trash/pull) | Gallery | BROKEN-ARC |
| G3 | Library opened as "Everything" | Gallery | FUNCTIONAL |
| G4 | Library opened beside project (source panel) | Gallery | FUNCTIONAL |
| G5 | Trash browsed / restored / emptied | Gallery | FUNCTIONAL |
| G6 | Node library (outline) browsed/placed-from | Gallery | FUNCTIONAL |
| G7 | An item is found by search / quick-open | Gallery | FUNCTIONAL |
| S1 | A tool is chosen (dock) | Selection | FUNCTIONAL |
| S2 | A shape/line/path/text/connector is drawn | Selection | FUNCTIONAL |
| S3 | A pin is placed | Selection | BROKEN-ARC |
| S4 | A node is pulled into place (place mode) | Selection | COMPLETE |
| S5 | A selection is transformed | Selection | FUNCTIONAL |
| S6 | A selection is arranged | Selection | FUNCTIONAL |
| S7 | Content is reframed (frame + sort-on-drop) | Selection | FUNCTIONAL |
| S8 | A lens is toggled on the rail | Selection | FUNCTIONAL |
| P1 | The app is quit safely | Session | FUNCTIONAL |
| P2 | A session is ended (End Session) | Session | BROKEN-ARC |
| P3 | A snapshot is restored | Session | COMPLETE |
| P4 | Project exported / .ewproj imported | Session | COMPLETE |
| P5 | Cleanup & retention (retention + GC) | Session | BROKEN-ARC |
| C1 | A setting is changed | Chrome | FUNCTIONAL |
| C2 | The first-run guide is walked | Chrome | FUNCTIONAL |
| C3 | A recovery condition / integrity warning | Chrome | FUNCTIONAL |
| C4 | The main menu / Help-About is opened | Chrome | COMPLETE |

## Top-10 most-severe holes, ranked

1. **G2 — Bulk gallery verbs (and trash-restore, gallery-tag)
   bypass structural undo.** Raw envelopes, no runAsUndoGroup
   (GalleryActionBar.svelte:78-92, 173-196; TrashView.svelte:80-94);
   CA-005 shows uncaptured commits also strand redo project-wide.
   Release-gate trust work (AI-IMP-221 + AI-IMP-230).
2. **P2 — End Session is a disabled-forever control with no
   post-state.** The ritual exists in main but is unreachable
   without quitting (MenuPopover.svelte:172-181; AI-IMP-224,
   owner decision Q4 pending).
3. **P5 — Retention records a dead value; GC has no surface.**
   The 30/60/90-day setting runs no purge; eligibility is computed,
   nothing sweeps (handlers/lifecycle.ts:755-783, gc.ts:6-28;
   AI-IMP-219/220, owner decisions Q2/Q3 pending).
4. **N4 — Broken/phantom wiki-link resolution: dead end + defective
   inverse.** Trashed-match offers guidance text but no action
   (NotePanel.svelte:1357-1358); relink-create's inverse always
   BreakNoteLinks, orphaning the created note (CA-008/AI-IMP-233).
5. **T2 — Tag removal has no trigger surface at all.**
   UnassignTagFromNode exists, tested, never emitted by any gesture
   (DESIGN-GAPS item; one drawn gesture settles it).
6. **S3 — Pin placement has no Escape and orphans phantoms.**
   Provisional dot has no independent exit; rapid clicks strand a
   dot-less phantom (pin-tool.ts:48-85).
7. **S5 — A selection zoomed below the furniture floor clears
   permanently mid-interaction** — no recovery on zoom-back
   (charms-ui.ts:151-159, 998-1019; the 192 dismissal ruling's
   sharp edge — flag for the feel pass).
8. **Loading/error-state absence is systemic on finding surfaces.**
   Failed queries render as EMPTY gallery/trash/search — error is
   indistinguishable from nothing-here (GalleryView.svelte:258-266,
   TrashView.svelte:150-155, SearchPanel.svelte:108-158, which also
   has an unhandled rejection + a type hole at :32/:194). SourcePanel
   is the reference three-state pattern the rest omit.
9. **S7 — Frame sort-on-drop disagrees across surfaces + a live
   stale-toggle bug.** Dock vs charm bar: two vocabularies, one flag;
   "Add from library" only in the Dock; Dock doesn't subscribe to the
   settings broadcast so its toggle goes stale (Dock.svelte:146-177
   vs charms-ui.ts:786-792).
10. **P4/C4 — The ☰ Export row lies.** Permanently disabled,
    captioned "arrives with the export epic," while Settings ships
    export live (MenuPopover.svelte:207-216 vs
    SettingsView.svelte:497-521).

**The silent-failure family (cross-cutting):** tag assign discards
its real error (TagAddField.svelte:54); attach-restore no-ops
silently (AttachNotePicker.svelte:136); bookmark-restore no-ops
silently (BookmarkMenu.svelte:87); drop-behavior ask auto-answers
"separate" on idle fade AND Escape with no beat
(drop-behavior.ts:70-77); the quit ritual's 15s snapshot timeout
proceeds with a possibly-incomplete backup, silently
(main/index.ts:1161-1164); the promised integrity-error perch has NO
producer in shipped code (status.ts:158-161).

## Per-lifecycle notes (drawing-session input)

### Images / Assets
- **A1 An image arrives** — FUNCTIONAL. Multi-drop ask + progress +
  cancel are solid. Holes: ask auto-answers `separate` silently on
  fade/Escape; image dropped ONTO a note silently redirects to the
  board (no embed, NotePanel.svelte:949-953); a committed asset with
  no pin reports failure and sits GC-eligible; renderer buffers
  files (AI-IMP-222).
- **A2 Mirror/recognition** — FUNCTIONAL. Buttonless chips have no
  manual exit (timer only, post-213); MirrorAsk has no Escape while
  its sibling DropBehaviorAsk does; mirror failures collapse to one
  quiet notice per session.
- **A3 Appearance + crop** — FUNCTIONAL. Crop overlay anatomy is
  undrawn anywhere in the kit; commit is silent/beat-free.
- **A4 Background** — COMPLETE. The model citizen: edit-mode
  suspends input, floating bar, zero-command cancel.

### Notes
- **N1 Read/open/write** — UNDESIGNED, flagship. No reading state
  distinct from editing; no caption tier. Owner's Note Lifecycle
  Document owns it; do not patch piecemeal.
- **N2 Create & attach** — FUNCTIONAL. Conflict dialog's
  onOpenExisting is wired but never rendered (dead);
  restore-on-conflict silently no-ops on failure; attach verbs not
  undo-captured (233 fixes).
- **N3 Pin/tear/place** — FUNCTIONAL. Place-on-board absent for
  tethered panels; zero-node notes route through Uses-list instead
  (two gestures, one intention); pull-pin deleting a LAST placement
  silently trashes the sticky, not undoable.
- **N4 Wiki links** — BROKEN-ARC (see top-10 #4). Also: phantom
  draft text silently discarded on close; bound-token miss is a
  silent no-op.
- **N5 Rename/collision** — FUNCTIONAL. The no-open-panel rename
  path degrades the §7.7 conflict dialog to a bare toast
  (panels.ts:807).
- **N6 Palette** — COMPLETE (the 211 build). Pin-wizard unification
  pending in queue.

### Boards / Navigation
- **B1 Boards born** — UNDESIGNED, flagship (239 shipped the
  functional verb; the drawn family is DESIGN-GAPS' New-board +
  Make-canvas items). Make-canvas is still nearly silent + native
  disabled with no tooltip.
- **B2 Enter & navigate** — FUNCTIONAL, near complete. Pin-beat
  phase is a brief silent dead-input window (intended, undrawn).
- **B3 Bookmarks** — FUNCTIONAL, the good undo citizen. Silent
  restore failure (vs TrashView which toasts — surfaces disagree).

### Tags
- **T1 Assign** — FUNCTIONAL. Silent failure (top-10 family).
- **T2 Remove** — BROKEN-ARC (top-10 #5).
- **T3 Panel/rename/lens** — COMPLETE.

### Gallery / Library
- **G1 Browse** — FUNCTIONAL. No loading state this-world; error
  renders as empty; quick-look on board/note cursor silently
  no-ops; inspector/reflow is AI-IMP-204.
- **G2 Bulk verbs** — BROKEN-ARC (top-10 #1).
- **G3 Everything scope** — FUNCTIONAL. Raw "superseded by a newer
  source-slot request" string leaks into the UI as libraryError
  (GalleryView.svelte:383-387).
- **G4 Source panel** — FUNCTIONAL and the STATE-COVERAGE REFERENCE
  (loading+error+empty all present). Non-image cells silently
  refuse drag with no affordance.
- **G5 Trash** — FUNCTIONAL. Restore bypasses undo; no error state;
  fly-to on a bare node dead-ends silently; empty-trash-with-nothing
  is a silent no-op.
- **G6 Outline** — FUNCTIONAL. Empty message doubles as loading;
  tag filter makes every loose note unreachable (notes carry no
  tags, OutlineView.svelte:466); bare-node rows disabled.
- **G7 Search/quick-open** — FUNCTIONAL. Type hole: results read
  asset.usingCanvases which the type omits (SearchPanel.svelte:32 vs
  194-217 — typecheck/runtime risk); no error state, unhandled
  rejection leaves stale results; tag mode with zero hits shows
  nothing; inert loose-asset row.

### Selection / Board tooling
- **S1 Tool choice** — FUNCTIONAL. Sticky tools with no
  Escape-to-select and no exit affordance; text tool shows three
  dead controls (stroke/weight/fill it never consumes).
- **S2 Drawing** — FUNCTIONAL. Two none-fill buttons disagree
  (one disabled, one clickable no-op); empty text commits nothing
  silently; dbl-click-to-edit only under select tool.
- **S3 Pin** — BROKEN-ARC (top-10 #6). Tool-switch doesn't clear a
  live dot/phantom.
- **S4 Place mode** — COMPLETE. Success is the one silent outcome
  (exit and failure both toast).
- **S5 Transform** — FUNCTIONAL. The floor-clamp permanent-clear
  edge (top-10 #7); sub-threshold duplicate silently no-ops.
- **S6 Arrange** — FUNCTIONAL. Undiscoverable + align-center
  collapses spreads (AI-IMP-198); make-canvas native-disabled
  without tooltip.
- **S7 Frames** — FUNCTIONAL with a live defect (top-10 #9).
- **S8 Rail** — FUNCTIONAL. Graph + Switch-project rows
  disabled-forever; membership model is 207-half-2.

### Session / Project
- **P1 Quit** — FUNCTIONAL. Wholly silent ritual; 15s snapshot
  timeout proceeds without notice.
- **P2 End Session** — BROKEN-ARC (top-10 #2).
- **P3 Restore** — COMPLETE. Initial-load error phase dead-ends to
  Close (no retry), unlike the failed phase.
- **P4 Export/import** — COMPLETE in Settings; the ☰ row lies
  (top-10 #10); importedDir never resets (lingering Open button).
- **P5 Retention/GC** — BROKEN-ARC (top-10 #3).

### Chrome / Settings
- **C1 Settings** — FUNCTIONAL. menuPlacement records a value
  nothing reads; placeholder rows (Grid, Snap, Border, Rounded)
  present no live control.
- **C2 First-run guide** — FUNCTIONAL. No Escape-to-dismiss
  (every sibling overlay has one); page-7 workflow picks stored
  with no consumer; seed failure silently swallowed → empty gallery
  unexplained.
- **C3 Conditions/integrity** — FUNCTIONAL. The integrity-error
  perch is documented but has no producer; recovery machinery has
  no user contract (lead-review §3).
- **C4 Menu/About** — COMPLETE (carries the two disabled-forever
  rows itemized under P2/P4).

## How to work this document

Each drawing session picks a lifecycle (BROKEN-ARC first, then the
FUNCTIONAL ones whose holes cluster), draws the full arc per the
document-of-actions format ruling, and the lead cuts the closure
tickets from the drawn answer. Cross-refs already in flight: CA-###
items are Sol's audit (tickets 226-238), AI-IMP-### are cut tickets,
DESIGN-QUEUE holds the conversation-level rulings. Fold, don't
duplicate.
