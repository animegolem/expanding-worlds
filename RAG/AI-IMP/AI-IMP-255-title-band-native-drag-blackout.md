---
node_id: AI-IMP-255
tags:
  - IMP-LIST
  - Implementation
  - renderer
  - shell
  - hotfix
kanban_status: in-progress
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-10
date_completed:
---


# AI-IMP-255-title-band-native-drag-blackout

## Summary of Issue #1

Owner field report on the v0.19.0 build: hovering the invisible
top bar (1) never reveals the title strip — "the dark bar renders
nothing" — and (2) hides ALL chrome, "treated as not in the app
window." VERIFIED CAUSE: on macOS (`titleBarStyle:'hidden'`,
main/index.ts:644) and Windows (`titleBarOverlay height:34`,
main/index.ts:648-649) the OS owns a native drag band at the top
of the frameless window. Chromium delivers NO pointer events over
that band, so the AI-IMP-214 cursor-Y reveal
(`TitleStrip.svelte:102-105`) never fires there, and entering the
band synthesizes a document `pointerleave`, which `engagement.ts:54`
treats as leaving the window → `.chrome-layer.faded { opacity: 0 }`
(ChromeLayer.svelte:106-108) blanks everything. E2E is
structurally blind: CDP-synthetic pointer events and
`ew-test-set-engagement` never traverse the OS layer. Done means:
moving the cursor into the top band reveals the strip and chrome
stays engaged while it sits there, on all three platforms; ships
as hotfix v0.19.1.

### Out of Scope

- Replacing the native band with `frame:false` + DOM-drawn window
  controls on mac/win (loses native traffic lights / snap layouts;
  a design conversation, not a hotfix).
- Any engagement-cadence retiming or §8.2 semantics change.
- The Linux `frame:false` path (its drag region IS the DOM strip;
  verify no regression only).

### Design/Approach

Make the engagement clock and the reveal aware that the top band
is event-dead but cursor-occupied:

1. `engagement.ts`: `leave()` learns the leave coordinates — a
   `pointerleave` whose `clientY` is within the title band
   (native band + reveal margin) is treated as "entered the
   drag band": keep engagement (poke) instead of fading. A real
   exit through the top keeps chrome up while the cursor is gone —
   accepted cosmetic tradeoff, strictly better than blackout.
   `window` blur still fades unconditionally (covers focus-away).
2. `TitleStrip.svelte`: reveal on the same band-leave signal (the
   cursor can cross 46px→band in one frame, so the Y≤46 pointermove
   is not guaranteed to fire before events stop); lower on the
   first pointermove below the band (events resume there) and on
   blur. The strip stays mounted while the cursor sits in the
   OS band.
3. Wire 1→2 through a small exported hook on engagement (e.g.
   `onTitleBandEnter`) rather than a second document listener, so
   the one-fade-clock invariant stands.
4. Unit tests for the new engagement branch (leave-in-band pokes,
   leave-out-of-band fades, blur always fades). E2E can only pin
   the DOM wiring, not the OS behavior — state that in the spec
   comment; owner validation via HUMAN-TESTING.md is the real
   proof, on mac AND alph's Windows build.

### Files to Touch

- `apps/desktop/src/renderer/chrome/engagement.ts`: band-aware
  leave; `onTitleBandEnter` hook.
- `apps/desktop/src/renderer/chrome/TitleStrip.svelte`: reveal on
  band-enter, lower on below-band move/blur.
- `apps/desktop/src/renderer/chrome/feel.ts`: the band constant if
  a native-band height needs recording beside TITLE_STRIP_REVEAL_PX.
- `apps/desktop/src/renderer/chrome/engagement.test.ts` (new or
  extended).
- `RAG/HUMAN-TESTING.md`: owner validation entry.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] engagement: pointerleave with clientY in the band pokes
      instead of fading; out-of-band leave and blur fade (units).
- [ ] TitleStrip reveals on band-enter signal and on Y≤46
      pointermove; lowers on below-band move and blur.
- [ ] Shell e2e still green (reveal contract via synthetic events
      unchanged); full desktop vitest green.
- [ ] Packaged-build hand check on macOS: hover top band → strip
      appears, chrome stays; HUMAN-TESTING.md entry for the owner
      (mac) and alph (Windows).
- [ ] v0.19.1 tagged with the changelog entry once owner-confirmed.

### Acceptance Criteria

**Scenario:** the packaged frameless build, cursor to the top.
**GIVEN** a v0.19.1 build on macOS or Windows
**WHEN** the cursor moves into the OS-owned title band and rests
**THEN** the title strip is revealed and remains visible
**AND** the chrome layer stays engaged (no blackout)
**WHEN** the cursor moves back below the band
**THEN** the strip lowers and the normal fade cadence resumes.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
