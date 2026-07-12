---
node_id: AI-IMP-189
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
  - dock
kanban_status: cancelled
depends_on: []
parent_epic:
confidence_score: 0.55
date_created: 2026-07-08
---


# AI-IMP-189-dock-tooling-design-pass

> SUPERSEDED (2026-07-12): the kit push drew the full dock family (Home Canvas kit, DESIGN-LETTER ruling 2) and the rebuild is re-scoped as AI-IMP-289 under AI-EPIC-029. This restyle-only ticket is retired; nothing here remains unowned.

## Summary of Issue #1

Owner testing note (2026-07-08, v0.15.0, screenshots): the bottom
tool dock (select/text/shape/pencil/line/arrow/connector/ellipse/
rect + zoom cluster), the alignment/arrange strip (Forward…Zoom
selection), and the tool style bars (Stroke/Weight/Fill and
Size/Font/B/I/Color) are STILL the original beta UI — square
bordered buttons, pill rows — coexisting with the new kit-grammar
charms. The two visual generations on one screen read as unfinished.
Done means the dock family is restyled into the ratified kit
grammar (Design System 1.2, the "One voice" input ruling, The Two
Materials chrome/paper split): one visual voice with the charm
bar — same button treatment, same focus ring, same popover/cascade
behavior — with NO behavior/semantic changes (tools, shortcuts,
zoom cluster, arrange verbs all keep their exact actions).

### Out of Scope

- Any semantic/behavior change (tools work as today).
- The shape hold-picker (AI-IMP-190 — coordinate; don't collide).
- The text-tool style bar's CONTENT redesign (restyle only; a
  content pass is a design conversation if the owner wants one).
- Retiring/merging controls (owner decision, not this ticket).

### Design/Approach

NORMATIVE VISUALS: RAG/design/Expanding Worlds Design System
1.2.html (input grammar, button voice) and The Two Materials
(chrome material). Inventory every dock-family surface, restyle to
tokens/kit classes (match the charm bar's rendered look —
same radii, heights, spacing, hover/active treatment; menu-cascade
on any popover), keep testids stable so the e2e suite stays green.
Where the kit gives no direct answer for a control, match the
nearest charm-bar sibling and note it in Issues Encountered —
if a control has NO reasonable kit mapping, STOP and flag for the
design conversation rather than inventing.

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte` (+ the style-bar
components it hosts), theme.css only for missing tokens.
E2e: existing dock specs stay green (behavior unchanged); one
computed-style spot-check that dock buttons share the charm
grammar (height/radius tokens).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Full dock-family inventory (list in Issues Encountered) with
      per-surface before/after note.
- [ ] Dock + arrange strip + both style bars on the kit grammar;
      tokens only; testids stable.
- [ ] Zero behavior change (full e2e green without dock-spec
      edits beyond styling asserts).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [ ] HUMAN-TESTING entry appended at merge by the lead (one
      voice? anything now harder to find?).

### Acceptance Criteria

**GIVEN** the board with the dock, arrange strip, and a tool style
bar visible beside a selected item's charm bar
**THEN** every control reads as one design generation — same
button voice, focus ring, and popover grammar — and every tool
behaves exactly as before.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
