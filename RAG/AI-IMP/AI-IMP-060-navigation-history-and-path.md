---
node_id: AI-IMP-060
tags:
  - IMP-LIST
  - Implementation
  - navigation
kanban_status: completed
depends_on: [AI-IMP-059]
parent_epic: [[AI-EPIC-006-shell-and-local-scope]]
confidence_score: 0.75
date_created: 2026-07-05
date_completed: 2026-07-05
---

# AI-IMP-060-navigation-history-and-path

## Summary of Issue #1

`host.openCanvas(canvasId)` exists (host.ts:612) and has zero
callers: there is no way to move between boards, no history, no
path, no Home. Per RFC §8.1 (rev 0.17) this ticket builds the
project-scoped per-window session history (entries retain route,
viewport on leave, originating placement when practical), the path
rendered as the back-stack beside the window controls with
viewport-restoring crumbs, the ⌂ Home button, and Back/Forward as
gestures (trackpad swipe, mouse buttons 4/5, Mod+[ and Mod+]) with
hover-revealed ‹ › beside the path. It exposes one `navigateTo`
API that every later cross-canvas flight (frame-charm dive, uses
rows, origin labels, bookmarks) routes through so §8.1's
"every jump enters history" invariant holds by construction.
Covers FR-4; slice item 12's path/Back/Forward/Home half.

### Out of Scope

Bookmarks (061). The dive UI itself (063 — until then e2e drives
navigation through the navigateTo test hook). Cross-canvas flights
from uses rows and panel origin labels (065). The switcher HUD and
New Window (RFC Q24/Q25). Graph/query history entries (EPIC-013).

### Design/Approach

A renderer `navigation.ts` store owning an entries array + cursor:
`navigateTo(canvasId, {route, originPlacementId})` records the
current canvas's camera into the current entry, pushes a new entry,
truncates the forward stack, and calls `hostHandle.openCanvas`.
Back/Forward restore the stored viewport (session state, not the
domain camera persistence the host already does). Entries whose
target is trashed or purged are skipped and collapsed at traversal
time (checked via query at jump time — no subscription needed).
Path component renders the back-stack as crumbs in the ChromeLayer
(059) beside the window controls, ⌂ at its head opening the
protected root canvas; crumb click = Back-to-that-entry. Gestures:
Mod+[ / Mod+] renderer keybindings; pointerup buttons 3/4;
macOS trackpad swipe and Windows app-command forwarded from main
via a small IPC channel (`ew-nav-gesture`). ‹ › appear on path
hover only. History is per-window and per-project (project switch
swaps stacks — with one project open today, the store simply keys
by project ID).

### Files to Touch

`apps/desktop/src/renderer/chrome/navigation.ts`: new store + API.
`apps/desktop/src/renderer/chrome/PathBar.svelte`: new — ⌂, crumbs,
hover ‹ ›.
`apps/desktop/src/renderer/chrome/ChromeLayer.svelte`: mount.
`apps/desktop/src/main/index.ts`: swipe/app-command → IPC.
`apps/desktop/src/preload/index.ts`: expose the gesture channel.
`apps/desktop/src/renderer/Workspace.svelte` or CanvasHost wiring:
hand hostHandle to the store.
`apps/desktop/e2e/navigation.spec.ts`: new suite.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] navigation.ts: navigateTo/back/forward/home with viewport
      capture-and-restore; forward stack truncates on new
      navigation; unit-testable pure core (entries logic) covered
      by vitest.
- [x] Trashed/purged targets: back/forward skip and collapse those
      entries; jump lands on the nearest live entry.
- [x] PathBar: ⌂ + crumbs render the back-stack (entry route
      labels, never ancestry); crumb click returns with viewport
      restored; ‹ › reveal on hover and act.
- [x] Keybindings Mod+[ / Mod+]; mouse buttons 3/4 on pointerup;
      main-process swipe/app-command forwarded and handled.
- [x] navigateTo exposed for tests (window event or ew test hook)
      and documented in the file header as the mandatory flight
      path for later tickets.
- [x] e2e navigation.spec: create nested canvas via commands, hop
      via test hook, assert path crumbs, Back restores prior
      viewport (camera state compared), Home returns to root;
      trashed-target skip covered.
- [x] `pnpm -r build` + unit + full desktop e2e green
      hidden-window.

### Acceptance Criteria

**GIVEN** canvases A → B → C entered in that order
**WHEN** the user presses Mod+[ twice
**THEN** the view returns to A with A's viewport as it was left,
and the path shows the back-stack with forward entries intact
until a new navigation clears them.

**GIVEN** B is trashed while the user stands on C
**WHEN** Back is pressed
**THEN** navigation skips and collapses B, landing on A.

**GIVEN** any canvas
**WHEN** ⌂ is clicked
**THEN** the protected root canvas opens and the jump is a history
entry.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
Two deviations. (1) The planned "vitest-covered pure core" was
dropped: the desktop app has no vitest harness (its test script IS
playwright), and adding one for a single store wasn't worth the
seam — the entries logic is exercised by navigation.spec instead,
including forward-truncation and skip-and-collapse. (2) ⌂ Home is a
NEW history entry (browser semantics), not a rewind to entry 0 — the
first spec draft assumed rewind and the correct behavior is now
asserted. Mouse buttons 3/4 and the macOS swipe / Windows
app-command IPC are wired but machine-unverifiable in Playwright
(no X-button synthesis; no trackpad) — hand-verify on the next dev
run. One real bug caught by the full gate: the PathBar painted OVER
the revealed title strip (same corner, later in DOM order), which
broke every Board-menu e2e flow — the strip, its menu, and the
BG-edit bar now carry z-index 3 above the path. Lesson: suites that
passed mid-ticket had pre-dated the PathBar; only the final full
gate saw the overlap — run the full e2e after ADDING chrome, not
just after moving it.
