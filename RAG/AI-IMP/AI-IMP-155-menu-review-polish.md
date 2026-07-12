---
node_id: AI-IMP-155
tags:
  - IMP-LIST
  - Implementation
  - menus
  - polish
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-155-menu-review-polish

## Summary of Issue #1

Three low-severity defects from the Codex review of PR #9, each
adversarially verified against the code (none breaks a ratified
invariant): (1) the Help/About "keyboard shortcuts" link opens the
Settings takeover without closing the ☰ menu popover, which stays
painted above the takeover (`z.ts`: popover 500 > takeover 300);
(2) Gather-into-frame ignores a `CaptureInFrame` conflict/validation
failure after the frame create committed, leaving an empty frame
with no error surfaced (recoverable — the undo group collapses to
the lone create); (3) `openFrameMenu` awaits `frameSortOnDrop` and
then renders unconditionally, so a stale resolution can replace a
newer menu opened during the await. Done means: all three paths
behave, with the cheapest honest test each.

## Summary of Issue #4

(Lead scope addition, 2026-07-07.) `electron.vite.config.ts`'s
`rfcRevision()` fell back to `'unknown'` on a missing file, an
unmatched header regex, or an empty capture. PR #9's reviewer
directions promised this "should fail the build loudly": the
About card exists to PROVE spec↔build alignment, so shipping
`'unknown'` silently defeats it. `rfcRevision()` now THROWS during
config evaluation — naming the RFC path and the expected header
shape — on any of those three conditions. Happy path unchanged.

### Out of Scope

- Decoration undo capture and Lock-all breadth (AI-IMP-154).
- Delete-frame undo routing (DESIGN-QUEUE).
- Flyout clamp-to-viewport for submenus (cosmetic; note it if
  touched).

### Design/Approach

(1) Thread the rail-close through the shortcuts path: pass
MenuPopover's `onclose` into HelpAboutDialog and invoke it before
`openTakeover('settings')` — mirror the Settings row's ordering.
(2) Check the `CaptureInFrame` result inside the gather handler; on
non-committed status surface `onError` (the group already leaves
one undoable create — do not auto-delete the frame, an undo does).
(3) Monotonic open-token in ContextMenu: capture before the await,
bail if a newer open/close happened (compare against the current
token after resolution).

### Files to Touch

`apps/desktop/src/renderer/chrome/MenuPopover.svelte`: pass rail
close through.
`apps/desktop/src/renderer/chrome/HelpAboutDialog.svelte`: call it
in `openKeyboardShortcuts`.
`apps/desktop/src/renderer/menus/ContextMenu.ts`: gather result
check; frame-menu open token.
`apps/desktop/e2e/`: Help/About shortcut path asserts the ☰ menu is
gone after the takeover opens; gather-failure and stale-menu races
get vitest-level coverage if e2e cannot drive them honestly (no
sleep-based race tests).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Shortcuts link closes the ☰ popover before the Settings
      takeover opens; e2e asserts the popover is unmounted.
- [x] Gather surfaces `CaptureInFrame` failure via `onError`;
      behavior on success unchanged (existing e2e green).
- [x] Frame-menu open token: stale async resolution never replaces
      a newer menu (unit-test the token logic).
- [x] `rfcRevision()` throws loudly (missing file / unmatched regex /
      empty capture) instead of falling back to `'unknown'`; loud
      failure recorded in Issues, then restored green.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the ☰ menu is open and Help/About is showing
**WHEN** the user clicks the keyboard-shortcuts link
**THEN** the Settings takeover opens
**AND** the ☰ popover is no longer in the DOM.

**GIVEN** a gather whose `CaptureInFrame` fails
**WHEN** the handler resolves
**THEN** the error hook fires and one Mod+Z removes the empty frame.

**GIVEN** a frame menu open awaiting its settings read
**WHEN** the user opens a different context menu before it resolves
**THEN** the newer menu stays.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Fix 1 (unmount ordering).** The Help/About dialog renders INSIDE
`MenuPopover`'s `{#if helpOpen}`, so closing the rail unmounts the
dialog with it. Solved by threading the rail-close as a distinct
prop: `MenuPopover.onclose` (which sets CharmRail's `menuOpen=false`)
is passed to `HelpAboutDialog` as `onCloseRail`. `openKeyboardShortcuts`
calls `onCloseRail()` then `openTakeover('settings')`, mirroring the
Settings row's ordering. No deferral needed: `openTakeover` is
module-level store state, so it runs in the same synchronous call
frame even though the assignment schedules this component's unmount —
the JS stack is not aborted by the unmount, and nothing throws (the
dialog's `$effect` cleanup just removes its keydown listener). The
dialog's own `onclose` (helpOpen=false) is now moot on this path
since the whole subtree unmounts; left in place for the Esc/Close
paths.

**Fix 2.** Swapped the discarded `host.gateway.execute('CaptureInFrame',
…)` for the existing `execute(…)` helper, which routes a non-committed
`CommandResult` through `onError(describeFailure('CaptureInFrame', …))`.
Success path is behaviourally identical (commits, returns true, does
nothing else). No auto-delete — the undo group already collapses to
the lone frame create, so one Mod+Z removes the empty frame.

**Fix 3 (token shape).** Extracted a `createOpenGeneration()` gate
(`menus/open-generation.ts`): a monotonic counter with `bump()`,
`current()`, `isStale(captured)`. `close()` bumps it; since `render()`
calls `close()` first, every menu open bumps too — so ANY newer open
or explicit close advances the generation. `openFrameMenu` captures
`openGen.current()` BEFORE `await tooling.frameSortOnDrop(...)` and
bails on `openGen.isStale(token)` after, so a stale frame resolution
never paints over a newer menu. Unit-tested the gate directly
(`open-generation.test.ts`, 5 cases incl. the modelled race) rather
than the DOM-heavy ContextMenu — the gate carries the exact logic
openFrameMenu uses, and vitest runs in node (no jsdom). e2e was NOT
used for the race (it cannot interleave the real IPC await without a
sleep, which the brief forbids).

**Fix 4 loud-fail proof.** Temporarily repointed `RFC_PATH` at
`RAG/RFC-0001-DOES-NOT-EXIST.md` and ran `pnpm build`: it failed with
exit code 1 and
`Error: rfcRevision: cannot read the RFC at …/RFC-0001-DOES-NOT-EXIST.md
for the Help/About build constant. … Restore the file or fix the path
in electron.vite.config.ts.` Restored the path; `pnpm -r build` green
again. The unmatched-regex / empty-capture branch throws the sibling
message naming the expected header shape
`| Accepted for Phase 1 | <rev> | <date> |`.

**Gates (from worktree root).**
- `pnpm -r build`: green (pre-existing a11y warnings in
  `SourcePanel.svelte`/`RightPanel.svelte`, not touched here).
- `pnpm lint`: clean.
- `pnpm -r test`: desktop chain = vitest (22 files, 194 tests) +
  electron build + Playwright **159 passed** (hidden windows),
  including the new `☰ Help/About shortcuts link …` spec. The
  `fatal: ambiguous argument 'main'` line under snapshot-push is a
  pre-existing benign git probe, not a failure.
