---
node_id: AI-IMP-191
tags:
  - IMP-LIST
  - Implementation
  - chrome
  - design-pass
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.75
date_created: 2026-07-08
date_completed: 2026-07-08
---


# AI-IMP-191-title-strip-fidelity

## Summary of Issue #1

Owner testing notes (2026-07-08, v0.15.0, screenshots): the shipped
path/title area diverges from the ratified design (Signature Pin
Changes decision 01 + the Pin & Menu Motion Prototype): (1) the
board name wears a PILL BOX the design doesn't have — the path
renders as bare text in the strip; (2) spacing next to the traffic
lights is cramped/wrong vs the prototype's layout; (3) decision
01's hover reveal — "a smoky near-black gradient, not a bar" —
is not rendered at all: hovering the top band should raise a soft
dark gradient that IS the drag handle, and it currently shows
nothing. Done means the top band matches the prototype: bare
path text properly spaced from the traffic lights, pin at
cap-height beside the name (already shipped), and the smoky
gradient fading in on hover across the strip.

### Out of Scope

- The pin/beat/menu (shipped, AI-IMP-166).
- The move/resize chord (AI-IMP-174).
- Crumb label refresh on rename (master-list P3, separate).

### Design/Approach

NORMATIVE VISUALS: RAG/design/Pin & Menu Motion Prototype.dc.html
(open it, measure the strip: text treatment, spacing, gradient
stops) and Signature Pin Changes decision 01. Remove the pill
background from the path/board-name element (bare text on the
gradient); set the traffic-light inset spacing per the prototype;
add the hover-revealed gradient band (opacity-only transition —
chrome animates ONE property; tokens only, no raw hex outside
theme.css). The gradient layer must not intercept canvas events
except as the drag region it already is.

### Files to Touch

`apps/desktop/src/renderer/chrome/PathBar.svelte`,
`TitleStrip.svelte`, theme.css (gradient tokens if new), e2e:
hover → strip band opacity rises; path text has no pill
background (computed style assert).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Pill removed; bare path text; prototype spacing at the
      traffic lights.
- [x] Smoky hover gradient, opacity-only, tokenized.
- [x] Drag-handle behavior unchanged; pin/beat untouched.
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e.
- [x] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** the pointer hovers the top band
**THEN** a smoky near-black gradient fades in (no bar, no pill),
the path reads as bare text spaced per the prototype beside the
traffic lights, and dragging the band still moves the window.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Prototype measurements used** (Pin & Menu Motion Prototype
.dc.html, §t1 stripzone): strip gradient
`linear-gradient(180deg, rgba(12,13,16,.82) 0%, rgba(12,13,16,.55)
55%, rgba(12,13,16,.28) 100%)`; reveal `opacity 0→1, 220ms
ease-out` (`[data-strip]`, opacity is the ONLY animated property);
signature-spot content starts at `left:78px` in the prototype's
46px band with lights at x:18 — mapped to the shipped 5rem (80px)
clearance TitleStrip already validated against
`trafficLightPosition x:14`. Shipped tokens updated to the
prototype's exact stops: `--ew-strip-scrim` .88→.82 on rgb 9,10,13
→ 12,13,16, `--ew-strip-scrim-fade` 0→.28, new
`--ew-strip-scrim-mid` .55 (the middle stop could NOT reuse
`--ew-scrim` — same dark value but re-themed light in the light
theme, which would have broken the chrome-mono strip; all three
stops are now :root-only strip tokens). The prototype's
`border-bottom: 1px rgba(255,255,255,.04)` was deliberately
omitted: a hairline edge reads as "a bar", which decision-01
explicitly rejects, and the shipped strip has never had one.

**Board button/menu relocation (consequence fix).** The pill
removal puts bare path text exactly where the strip's Board button
lived (both at the traffic-light corner); PathBar must also paint
ABOVE the strip gradient (z-index 4 over the strip's 3) or the
hover reveal covers the very text it frames. That stacked the
Board button's hit target under the path bar, so Board moved to
the strip's right edge (`margin-left:auto`) and the board-menu
dropdown re-anchored `right:0.5rem` under its opener. On Linux the
same auto margin carries the drawn window controls; verified
mac-only (per AI-IMP-165's precedent, off-mac untested).

**Svelte outro deadlock (found and fixed during validation).**
First cut used `transition:fade`; the 220ms OUTRO keeps the
detached strip in the DOM after hide, `revealTitleStrip`'s
`isVisible()` idempotence guard reads that ghost as "up", skips
the reveal move, and the click races the unmount — a
deterministic `openBoardMenu` timeout in board-tooling e2e
(background lifecycle). Reproduced minimally (open → close →
reopen within 220ms), then fixed by fading IN only (`in:fade`);
hide stays the instant unmount it has always been, which is all
decision-01 requires ("fades in across the top band on hover").
e2e helpers were out of this ticket's file fence, so the fix had
to live in the component — the right place anyway.

**Validation:** `pnpm -r build` clean; unit tests 380+538+58+1+18
+1 (packages) + 329 (desktop vitest) all green; `pnpm lint` clean;
hidden-window e2e full suite 213/213 across four alphabetical
shards (41 + 58 + 65 + 49) on the final source. New assertions in
shell.spec: strip opacity SAMPLED mid-fade rises then settles at 1
(a real fade, not a pop), and `path-bar` has computed
`background-color: rgba(0,0,0,0)` (no pill).