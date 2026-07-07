---
node_id: AI-IMP-165
tags:
  - IMP-LIST
  - Implementation
  - shell
  - design-pass
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.65
date_created: 2026-07-07
date_completed:
---


# AI-IMP-165-frameless-shell

## Summary of Issue #1

Signature Pin pass decision 01, ratified rev 0.64 §8.2: "the shell
eats the window." Frameless on every platform — the board paints
edge-to-edge, traffic lights draw INTO the board (macOS
trafficLightPosition on a hidden titlebar), and the hover-revealed
title strip (a smoky near-black gradient, never a bar) IS the drag
handle. Windows/Linux keep their system menus reachable through the
strip per the existing §8.2 line. Done means: no OS frame on any
platform, dragging the strip moves the window, traffic lights sit
in-board and functional, e2e still drives the hidden-window suite
unchanged, and fullscreen/maximize still work.

### Out of Scope

- The held move/resize chord (macOS binding is an open
  DESIGN-QUEUE call — ships separately when decided).
- The signature pin / bookmark beat (AI-IMP-166).
- Any strip CONTENT change (same functions, new dress).

### Design/Approach

Electron BrowserWindow: `titleBarStyle: 'hidden'` +
`trafficLightPosition` on macOS; `frame: false` on Windows/Linux
with a window-controls overlay or drawn min/max/close in the strip
(check titleBarOverlay support). Drag: `-webkit-app-region: drag`
on the strip root with `no-drag` carve-outs for every interactive
child (buttons, menus). Strip restyle to the smoky gradient on
theme tokens. Mind e2e: hidden windows + window managers — the
suite must stay green without per-test changes; if `frame:false`
perturbs `EW_TEST_HIDDEN_WINDOWS`, gate framelessness off under the
test env and say so loudly in the report. Screenshot-worthy states
into HUMAN-TESTING at merge.

### Files to Touch

`apps/desktop/src/main/index.ts` (window creation only).
`apps/desktop/src/renderer/chrome/TitleStrip.svelte` + theme
tokens.
E2E: existing suite green; one new assertion that the strip drag
region exists (CSS presence) if practical.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Frameless on macOS (hidden titlebar + in-board traffic
      lights) and Windows/Linux (frame:false + reachable window
      controls).
- [ ] Strip = drag handle; interactive children carved out.
- [ ] Smoky-gradient strip on tokens (guards green).
- [ ] Full suite green unchanged; fullscreen/maximize verified.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the app on macOS
**THEN** no OS frame exists, traffic lights sit in-board, and
dragging the hover-revealed strip moves the window
**GIVEN** Windows/Linux
**THEN** the frame is gone and window controls remain reachable.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
