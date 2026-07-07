---
node_id: AI-EPIC-023
tags:
  - EPIC
  - AI
  - notes
  - panels
  - design-pass
date_created: 2026-07-07
date_completed: 2026-07-07
kanban_status: completed
AI_IMP_spawned:
  - "[[AI-IMP-134-paper-hardware-and-the-bound-page]]"
  - "[[AI-IMP-135-lifecycle-transitions-and-beats]]"
---

# AI-EPIC-023-paper-note-lifecycle

> Cut 2026-07-07 from RFC rev 0.55 §8.5 (the design pass's largest
> single amendment). Design sources: Note Lifecycle Document,
> Icon Document t6–t11, STYLE-GUIDE §4/§5/§9 (Design System 1.0).

## Problem Statement/Feature Scope

The shipped note surface has two presentations (tethered panel with
a dashed tail; pinned screen-fixed panel) and a one-way
place-on-board materialization. Rev 0.55 supersedes this with the
paper lifecycle: the note is a BOOK PAGE bound beside its image
(rings on the seam, size matching the shared edge), tears out into
a taped STICKY on the glass, and pins down as a LANDMARK placement
— freely reversible, one undoable command per transition, with the
hardware (rings · tape · push pin) telling the state and shadow
reallocated to viewport-floating only. This is the doctrine's
flagship: the skeuomorphic hardware exists to make state changes
obvious in a playful way.

## Proposed Solution(s)

Two IMPs: (1) the paper material primitives (tape, torn edge,
binder rings, push pin, glossy pin) + the bound-page presentation
replacing the tethered look — including the shared-edge sizing
geometry (side-bound = image height; wide ≳1.4:1 binds below at
image width) and binding-side choice at open; (2) the lifecycle
transitions — tear-to-sticky (~300ms one-shot beat), untape-home,
pin-to-landmark keeping the torn edge, pull-pin-to-sticky,
double-click tear-to-center (the big-editor moment, scroll inside
the page), esc tucks home — each one undoable command, plus the
shrink-ladder page degradation (rings→stroke→whole-page fade).

## Path(s) Not Taken

No spiral-binding ornamentation beyond the ring set (parked until
it proves it survives shrink — it did, at ~40%; the DEGRADATION is
the contract). No side-flip verb (deferred until asked). No
book-cover-open beat yet (musing). Org-fold/rich-text stays
EPIC-018.

## Success Metrics

The three states read at a glance without labels; one Mod+Z
reverses any transition; the perf targets (§12.1) hold with bound
pages world-scaling; the artist calls the tear "playful" not
"twee."

## Requirements

### Functional Requirements

- [x] FR-1: Paper primitives + bound page — materials on theme
      tokens, ring seam, shared-edge sizing, binding-side choice,
      flat world-scaling render. (AI-IMP-134)
- [x] FR-2: Reversible transitions with beats — tear/tape/untape/
      pin/pull-pin/tear-to-center, one command + one undo each,
      shadow only while floating. (AI-IMP-135)

### Non-Functional Requirements

- §12.1 perf holds; beats are one-shot, never ambient (§8.2 motion
  budgets); EW_PAGE_FLOOR_PX governs degradation (§8.2 shrink
  ladder).

## Implementation Breakdown

134 (primitives + bound presentation, interface-defining) → 135
(transitions + beats). 134 depends on AI-IMP-130 (tokens).


Shipped in v0.11.0.
