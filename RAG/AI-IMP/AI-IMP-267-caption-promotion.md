---
node_id: AI-IMP-267
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - notes
  - field-report
kanban_status: planned
depends_on: [AI-IMP-266]
parent_epic:
confidence_score: 0.7
date_created: 2026-07-10
date_completed:
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
the pre-promotion world (note gone, caption back).

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
TitleConflictDialog machinery.

**Setting:** `captionPromotionRouting: 'ask' | 'title' | 'body'`
(app tier, §11.5 — the settings codec from AI-IMP-251 makes this
one enum field; validated in the handler/codec, never a CHECK).
Settings view gains its row under the notes/board group.

**The command:** composition of EXISTING commands inside ONE undo
group (runAsUndoGroup — the AI-IMP-182/233 pattern): CreateNote
(+title per routing) → AttachNoteToNode → SetPlacementCaption
null. No new domain command; the §7.2 CreateNote residue-hazard
exemption does NOT apply because the group's inverse removes the
note it created (the AI-IMP-233 relink precedent: created-and-
untouched notes are removed by undo).

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
  noted nodes, single-undo restoration (note gone, caption back),
  title-conflict path.
- `RAG/HUMAN-TESTING.md` + `CHANGELOG.md`.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Promote verb on captioned placements (menu + caption
      surface); disabled-with-reason when the node has a note.
- [ ] Routing dialogue: Title / Body (+ title input on body
      routing), remember-choice toggle; §7.7 title conflicts
      route through the existing conflict machinery.
- [ ] Setting `captionPromotionRouting` (ask/title/body) through
      the 251 settings codec; Settings row present and live;
      'ask' default.
- [ ] Promotion executes as ONE undo group of existing commands;
      Mod+Z restores note-gone + caption-back; redo replays.
- [ ] e2e: both routings, remember-choice, disabled-reason,
      undo round-trip, conflict path — green.
- [ ] Full gates green with pipefail; counts read.
- [ ] HUMAN-TESTING + CHANGELOG entries.

### Acceptance Criteria

**GIVEN** an image with the caption "hazy overgrown vines" whose
node has no note
**WHEN** the user chooses Promote to note and routes it to TITLE
**THEN** a note titled "hazy overgrown vines" is created and
attached, the caption clears, and the label shows the title
**AND** routing to BODY instead asks for a title and puts the
caption text in the body
**AND** saving the choice skips the dialogue on the next promote
and surfaces as a changeable Settings row
**AND** one Mod+Z restores the caption and removes the created
note
**AND** the verb is disabled with a visible reason on a node that
already has a note.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
