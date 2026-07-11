---
node_id: AI-IMP-267
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - notes
  - field-report
kanban_status: completed
depends_on: [AI-IMP-266]
parent_epic:
confidence_score: 0.7
date_created: 2026-07-10
date_completed: 2026-07-10
---


# AI-IMP-267-caption-promotion

## Summary of Issue #1

RFC rev 0.68 §4.5: the caption's escape hatch is PROMOTION —
alph's own words, "maybe you can turn it into a note later and
give it a title then." Without it the caption is a dead end and
the register ladder (paint → caption → note) has a missing rung.
This ticket builds **Promote to note**: a routing dialogue asks
whether the caption text becomes the new note's TITLE or its BODY
(the owner's MKVToolNix-style shape), with a save-this-choice
control persisting the answer as an §11.5 app-tier setting (the
dialogue stops appearing once saved; a Settings row can change it
back, including "ask every time"). On commit: CreateNote +
AttachNoteToNode + clear the caption — ONE undo group. When the
placement's node already HAS a note the verb is disabled with its
reason. Done means: a captioned image promotes in two clicks, the
note carries the text where the user routed it, the caption is
gone, the label now shows the note title, and one Mod+Z restores
the pre-promotion world per the shipped CreateNoteAndAttach
inverse (note detached and trashed, caption back).

### Out of Scope

- Append-to-existing-note semantics (RFC: disabled-with-reason;
  no append is invented).
- FTS (deferred with the 266 scope).
- Any change to CreateNote/AttachNoteToNode domain semantics.

### Design/Approach

**Verb surfaces:** rides 266's surfaces — the context menu gains
"Promote to note" on captioned placements (destructive-last rules
unaffected; this is constructive) and the caption editor/charm
popover carries the same verb. Disabled with inline reason ("this
image already has a note") when node.note_id is set.

**Routing dialogue:** a small anchored dialogue (§8.8 placement
helper; §16 grammar — verbs only, no checkbox soup): "Title" /
"Body" buttons + a "remember this choice" toggle. Body-routing
asks for a title... NO — body-routing creates the note UNTITLED?
Notes require titles (title_key reservation). RULING FOR BUILD:
title-routing uses the caption as the title (body empty);
body-routing prompts for a title in the same dialogue (one input
appears, §7.7 conflict handling applies exactly as the phantom
materialization path). Title conflicts route through the existing
TitleConflictDialog machinery — AMENDED at the 266 round-1
review: the promotion variant OMITS "Use Existing" (it would
discard the promotion body when the caption clears), keeping
choose-different/restore-open.

**Disabled reasons render visibly (added at the 266 round-1
review):** ContextMenu currently carries disabled reasons only in
aria-labels; §8.2's disabled-with-reason shape requires the
reason to PRINT. A small ContextMenu change rendering the
existing reason text is in-scope here.

**Setting:** `captionPromotionRouting: 'ask' | 'title' | 'body'`
(app tier, §11.5). CORRECTED at the 266 round-1 review: AI-IMP-251's
codec is PROJECT-tier and explicitly excludes app tier — the
actual home is the AppSettings codec/sanitizer
(renderer/settings/settings.ts) and its Behavior UI group.
Validated in the codec, never a CHECK. Settings view gains its
row there.

**The command (CORRECTED at the 266 round-1 review — Codex's
contradiction findings #1/#2 accepted):** ONE undo group of
`CreateNoteAndAttach → SetPlacementCaption(null)`. The ticket's
original CreateNote → AttachNoteToNode composition cannot undo
cleanly: CreateNote is matrix-EXEMPT and group capture skips
exempt commands, and its inverse (TrashNote) would strand a
trashed loose note. CreateNoteAndAttach is the existing atomic
command with body/title support, conflict handling, and a
matrix-ratified DetachAndTrashNote inverse. Eyes open on the
shipped semantics: undoing a promotion detaches AND TRASHES the
created note (title reservation holds while trashed), so
undo-then-repromote of the same title routes through the
existing conflict machinery — consistency with the ratified
matrix wins over inventing new inverse semantics.

### Files to Touch

- `apps/desktop/src/renderer/menus/inventory.ts`: Promote verb +
  disabled-reason (+ grammar test).
- Caption editor/charm popover (266's component): the same verb.
- New PromoteCaptionDialog component (routing + optional title
  input + remember toggle).
- Settings: the routing enum (schema/codec + Settings view row).
- Undo: group-composition wiring; no matrix change (CreateNote
  stays exempt STANDALONE; the group is the captured unit).
- e2e: extend caption.spec.ts — promote-as-title, promote-as-body
  (title asked), remember-choice (dialogue skipped on the next
  promote; setting visible in Settings), disabled-with-reason on
  noted nodes, single-undo restoration (note detached+trashed
  per the shipped inverse, caption back),
  title-conflict path.
- `RAG/HUMAN-TESTING.md` + `CHANGELOG.md`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Promote verb on captioned placements: context menu + a
      Promote charm beside Edit when a COMMITTED caption exists
      (the dialog never promotes stale editor draft text);
      disabled-with-reason "This item already has a note"
      (captions are not image-only), reason rendered VISIBLY
      with bounded second-line layout and verb+reason in the
      accessible label.
- [x] Routing dialogue: Title / Body (+ title input on body
      routing), remember-choice toggle. Remember persists ONLY
      after both commands commit (never on conflict/cancel);
      remembered BODY skips the routing choice but still opens
      the title entry.
- [x] Setting `captionPromotionRouting` (ask/title/body) through
      the app-tier AppSettings codec/sanitizer
      (renderer/settings/settings.ts) + Behavior UI row; 'ask'
      default.
- [x] Promotion executes as ONE undo group
      (CreateNoteAndAttach → SetPlacementCaption null),
      FAIL-STOP (capture is not a transaction): a refused create
      never clears the caption; a clear failure leaves note
      attached + caption retained as a one-member undo entry
      (the NewBoardPalette clean-partial precedent) — both with
      failure-injection tests. Mod+Z restores caption-back +
      note detached-and-trashed per the shipped inverse. REDO of
      the group refuses HONESTLY (no partial state, no wedged
      stack) — full redo is AI-IMP-270's (the ruled-out
      inherited CreateNoteAndAttach redo defect; a trashed
      title-reserving row makes replay conflict by design).
- [x] Promotion title conflicts (BOTH routes) use the
      no-Use-Existing dialog variant: Open Conflicting / Restore
      Existing / Choose Different — body returns to its title
      input, title returns to the caption surface; the caption
      is NEVER discarded by a conflict.
- [x] e2e: both routings, remembered title + remembered body +
      Settings reset, disabled-reason visible, undo state exact,
      stage-1/stage-2 fail-stop, conflict variant on active and
      trashed holders, honest redo refusal — green.
- [x] Full gates green with pipefail; counts read.
- [x] HUMAN-TESTING (lead-owned; suggest the entry) + CHANGELOG.

### Acceptance Criteria

**GIVEN** an image with the caption "hazy overgrown vines" whose
node has no note
**WHEN** the user chooses Promote to note and routes it to TITLE
**THEN** a note titled "hazy overgrown vines" is created and
attached, the caption clears, and the label shows the title
**AND** routing to BODY instead asks for a title and puts the
caption text in the body
**AND** saving the choice skips the routing on the next promote
(remembered body still collects its title) and surfaces as a
changeable Settings row
**AND** one Mod+Z restores the caption and detaches-and-trashes
the created note (the shipped CreateNoteAndAttach inverse); a
redo after that undo refuses honestly without partial state
(full redo is AI-IMP-270)
**AND** the verb is disabled with a visible reason on a node that
already has a note.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

Built by the Codex wave, round 4 on the round-3 rulings;
lead-merged at the 267 merge commit with one lead fixup (a dead
openSettings e2e helper — the single check-job lint error on
ci/imp-267; removed post-merge, full check:ci green locally).
Validation: Windows oracle + all four e2e shards green on
ci/imp-267; lead re-ran build/packages/desktop/e2e in the
worktree (1,100 / 422+1 / 48) and caption e2e 7/7 plus full
check:ci on the merged tree. The round-3 review's blocking
conviction (CreateNoteAndAttach redo rot, inherited from the
086 era) is fenced as AI-IMP-270; this ticket ships honest redo
refusal with a regression proving no partial state. Codex's
friction notes surfaced and fixed a real focus-steal (Choose
Different reopening the editor during button activation —
deferred until the click completes). Lead procedure note: the
lead's worktree gate had omitted lint/spike-typecheck; full
check:ci is now the standing lead re-run.
