---
node_id: AI-IMP-100
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - notes
  - feel
kanban_status: completed
depends_on: [AI-IMP-098]
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.75
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-100-panel-aware-flyto

## Summary of Issue #1

Owner finding (2026-07-06, screenshots): following a wiki link
flies to the target placement and opens its tethered panel — but
the fit math frames the PLACEMENT alone, and the panel then spawns
over it (The Gang's fourth figure buried under the note). Done =
every navigation that opens (or keeps) a tethered panel computes
its fit against the EFFECTIVE viewport — the window minus the
panel's reserved region (spawn side + size are known: the tether
places beside the node, default 320×300 rev 0.31 + margin) — so
target and panel land side by side, the panel never occluding what
the flight promised to show.

### Out of Scope

- Pinned panels (screen-fixed by user choice; occlusion is theirs).
- Reflowing panels on manual pan/zoom (fit-time only — the §8.5
  tether already tracks; users may freely stack afterwards).
- Changing panel spawn-side logic beyond reading it.

### Design/Approach

The §6.9 fit computation (camera.ts) gains an optional screen
inset (per-edge px the fit must not use); CameraFlight passes it
through unchanged. The wiki-link/Uses/fly-to activation paths that
open a tethered panel (note/open-note.ts + panels anchor logic)
compute the inset from the panel's spawn side and effective size
before requesting the flight. Applies to: wiki-link activation
jumps, tag-panel/Uses fly-to rows, and the §7.3 location-chooser
flights — one shared helper, not three copies. Sequenced AFTER
AI-IMP-098 (both touch the camera surface; 098 owns it first).

### Files to Touch

`packages/canvas-engine/src/camera.ts` (+test: inset fit math),
`camera-flight.ts` (pass-through); `apps/desktop/src/renderer/note/
open-note.ts` / `panels.ts` (inset derivation helper);
e2e: activation flight lands with the placement fully inside the
panel-free region (extend notes/panels spec idioms).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Fit-with-inset in the engine; units (inset reduces the
      effective viewport; zero inset byte-identical to today).
- [x] Activation paths derive the panel inset via one shared
      helper; flight frames placement beside the panel.
- [x] e2e: wiki-link jump → placement bounds ∩ panel bounds = ∅
      and placement fully on screen.
- [x] Full gates; HUMAN-TESTING entry on merge.

### Acceptance Criteria

**GIVEN** a note whose wiki link targets a placed node
**WHEN** the artist activates the link
**THEN** the camera lands with the target placement fully visible
in the region beside the opened panel — nothing the flight framed
sits underneath the note.

### Issues Encountered

Opus-built, lead-transcribed. fitTarget gained the screen inset
(zero-inset byte-identical, unit-proven); the note layer arms a
ONE-SHOT pending inset on Camera because host.flyTo was a closed
surface mid-wave — accepted with its consumed-once/inert-unset unit
proof; EPIC-016's ladder pass may replace it with an explicit
param. Tethered panels always spawn right of the node, so the
reservation is a 368px right inset. Adopted at jumpToPlacement
(wiki links + §7.3 chooser), UsesList both branches, TagPanel
fly-to. Non-vacuity: the e2e fails with the reservation disabled.
Gates: 292 engine / 37 desktop units, lint, 27 e2e on branch + 28
combined post-merge.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
