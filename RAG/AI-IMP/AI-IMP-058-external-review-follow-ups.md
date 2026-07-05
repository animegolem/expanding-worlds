---
node_id: AI-IMP-058
tags:
  - IMP-LIST
  - Implementation
  - hardening
  - correctness
kanban_status: in-progress
depends_on:
parent_epic: [[AI-EPIC-012-pre-alpha-hardening]]
confidence_score: 0.85
date_created: 2026-07-05
date_completed:
---

# AI-IMP-058-external-review-follow-ups

## Summary of Issue #1 — UUIDv7 invariant sweep

Core invariant #1 (§5: application-generated persisted identities
are RFC 9562 UUIDv7) is violated by every renderer surface and the
command gateway — 11 files use crypto.randomUUID() (v4) for note/
node/placement/tag/decoration ids and command ids, silently accepted
by the syntax-only envelope validator. Two read models assume v7
creation ordering (phantom would-be-title spelling, node library
order). Done when production paths emit v7, the envelope validator
rejects non-v7 command ids, and unit coverage pins both.

### Out of Scope

Migrating historical v4 rows (harmless; ordering only matters among
new records). Record-id version validation inside individual
handlers. Test-data record ids in old specs (command ids migrate;
payload ids opportunistically).

### Design/Approach

Renderer files import uuidv7 from @ew/domain (a desktop dep since
AI-IMP-045; the generator is browser-safe). CommandGateway takes an
id-generator constructor argument (keeps canvas-engine free of a
domain dep); host.ts and note/project-port.ts pass uuidv7. Preload
exposes `util.newId()` so e2e evaluate blocks (which cannot import
workspace packages) can mint v7 command ids; each spec's local
envelope builder switches to it. envelope.ts gains a v7 version check
for commandId with a unit test.

## Summary of Issue #2 — lock reclaim verify-after-write

ProjectLock.acquire's stale-reclaim path renames its payload over the
lock and returns success without checking who won; two processes
racing a reclaim (common now that AI-IMP-053 reclaims dead-pid locks
on every post-crash relaunch) can BOTH return live locks with open
DB handles, breaking single-writer. Done when acquire re-reads the
lock after the rename and throws PROJECT_LOCKED unless its own token
owns the file, with a unit test simulating the losing interleave.

## Summary of Issue #3 — phantom Create and Place drops the draft

Two coupled defects: the phantom textarea's blur-materialize fires
before the Create and Place button's click (blur creates a
note-with-body but NO placement and the click then no-ops), and when
the click does win, the typed draft is discarded because
CreatePin's note-create carries no body. Done when Create and Place
commits one CreatePin whose created note carries the draft body, and
the blur-materialize path is removed (the idle-debounce burst
remains §7.2's first-committed-edit; blur was the race's source).

### Design/Approach (issues 2–3)

Lock: read-back after renameSync; unit test mocks node:fs renameSync
to land a foreign winner after ours. Phantom: CreatePinPayload
note.create gains optional `body` (validated string), handler inserts
it and keeps the trash-created-note inverse; ew-create-and-place
carries the draft; NotePane drops onDraftBlur. e2e: type a draft,
click Create and Place, assert the placed note's body and a single
command.

### Files to Touch

`packages/domain` (none) / `packages/canvas-engine/src/command-gateway.ts`:
id-generator injection.
11 renderer files: uuidv7 sweep.
`packages/commands/src/envelope.ts` (+test): v7 commandId check.
`apps/desktop/src/preload/index.ts`: util.newId.
`apps/desktop/e2e/*.spec.ts`: envelope builders → util.newId.
`packages/persistence/src/lock.ts` (+test): verify-after-reclaim.
`packages/commands/src/payloads/pin.ts`,
`packages/persistence/src/handlers/pin.ts` (+test): create body.
`apps/desktop/src/renderer/NotePane.svelte`, `note/open-note.ts`,
`Workspace.svelte`: draft threading, blur removal.
`apps/desktop/e2e/notes.spec.ts`: draft round-trip e2e.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] All renderer id mints are uuidv7; gateway injected; grep shows
      zero crypto.randomUUID under src/renderer and canvas-engine.
- [ ] Envelope validator rejects v4 command ids (unit test); preload
      util.newId; every spec's envelope builder migrated; suite
      green.
- [ ] Lock verify-after-reclaim throws PROJECT_LOCKED for the losing
      racer; unit test with mocked rename interleave; recovery e2e
      still green.
- [ ] CreatePin note.create.body persists (handler unit test);
      Create and Place threads the draft; blur-materialize removed;
      e2e proves draft → placed note body in one command.
- [ ] Full gates green locally and on CI.

### Acceptance Criteria

**GIVEN** any UI-created record after this change
**WHEN** its id is inspected
**THEN** the version nibble is 7, and a v4 command id is rejected at
the envelope.

**GIVEN** two processes racing a stale-lock reclaim
**WHEN** both rename their payload over the lock
**THEN** exactly one returns a lock; the other throws PROJECT_LOCKED.

**GIVEN** a phantom view with "born of marsh light" typed in the draft
**WHEN** the user clicks Create and Place on Current Canvas
**THEN** one CreatePin commits a placed note whose body is the draft
**AND** no separate unplaced note is created by the blur.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
