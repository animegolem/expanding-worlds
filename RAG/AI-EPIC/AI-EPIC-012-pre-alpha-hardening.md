---
node_id: AI-EPIC-012
tags:
  - EPIC
  - AI
  - hardening
  - feel
date_created: 2026-07-05
date_completed:
kanban_status: in-progress
AI_IMP_spawned:
  - AI-IMP-053
  - AI-IMP-054
  - AI-IMP-055
  - AI-IMP-056
  - AI-IMP-057
---

# AI-EPIC-012-pre-alpha-hardening

## Problem Statement/Feature Scope

The owner's pre-release testing notes plus two external code reviews
(Gemini 3.1 Pro, Codex 5.5) surfaced a batch of stability defects,
usability gaps, and feel corrections worth clearing before EPIC-006:
a utility-process crash silently hangs every Project API call
(presenting as a mute black canvas); UI refresh rests on 120 ms
timeout heuristics that have caused two real bugs; placed shapes
cannot be restyled; note links are functionally undiscoverable; and
several constants (zoom floor, guide alpha, label ratio) are
mis-tuned.

## Proposed Solution(s)

Five tickets, all lead-built: (1) utility-process crash safety —
exit handling, pending-call rejection, visible error, restart, plus
dead-endpoint and tracked-artifact cleanup; (2) deterministic
scene/UI synchronization replacing the timeout heuristics; (3)
selection-aware restyling for shapes/lines/paths and rect corner
rounding; (4) feel constants, double-click-the-label canvas rename
routed through the §10.2 rename seam, and link-follow
discoverability; (5) an SSRF guard on URL import and e2e envelope
helper consolidation. RFC picks up two §19 open questions (pin
dialog surface, hidden-notes tension) and records live-preview
reading mode as the acknowledged direction for the source-view
tension (deferred with scope).

## Path(s) Not Taken

Curved pen arrows (feel-epic scale, deserves design). Live-preview
mode itself. TextureBudget LRU restructuring (correct analysis,
premature). License file (owner decides MIT later). Removing the
Create Pin dialog (waits for its chrome-era replacement).

## Success Metrics

- Killing the utility process mid-session yields a visible error and
  a recovered (or clearly failed) app — never a silent hang (e2e).
- No `setTimeout(refresh, N)` heuristics remain in renderer UI
  components; toolbar restyle-after-edit races impossible by
  construction.
- A placed shape's stroke, fill, weight, and rounding are editable
  from the toolbar; changes commit one UpdateDecoration each.
- Zoom floor 0.002, guide alpha 0.5, label ratio ≈0.14; label
  double-click renames the note with the dirty-buffer flush ordering
  intact.
- URL import rejects loopback/private-range addresses.

## Requirements

### Functional Requirements

- [x] FR-1: Utility exit/error handling — pending calls reject, error surfaces, one restart attempt; stale request-derivatives endpoint removed; tracked test artifact untracked.
- [x] FR-2: SceneSync/host emits a deterministic applied event; DecorationToolbar and NotePane refresh event-driven with no timers.
- [x] FR-3: Selection restyle for shape/line/path/connector stroke, fill, weight; cornerRadius on rects (validator, renderer, toolbar, RFC).
- [ ] FR-4: MIN_ZOOM 0.002, SNAP_GUIDE_ALPHA 0.5, LABEL_HEIGHT_RATIO 0.14.
- [ ] FR-5: Double-click a placement label → inline rename routed through the pane's rename seam.
- [ ] FR-6: Wiki-link hover affordance names the follow gesture.
- [ ] FR-7: fetchUrlForImport rejects loopback/private/link-local targets, including post-DNS-resolution.
- [ ] FR-8: e2e envelope/query helpers consolidated; notes.spec migrated.

### Non-Functional Requirements

- All existing gates stay green locally and on CI.
- RFC rev 0.16: §19 Q20/Q21, live-preview deferred scope, §20 bullets.

## Implementation Breakdown

- AI-IMP-053 — utility-process crash safety + cleanup. (FR-1)
- AI-IMP-054 — deterministic scene/UI sync. (FR-2)
- AI-IMP-055 — selection restyle + corner rounding. (FR-3)
- AI-IMP-056 — feel constants, label rename, link affordance. (FR-4..6)
- AI-IMP-057 — SSRF guard + e2e helpers. (FR-7..8)
