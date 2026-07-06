---
node_id: AI-IMP-099
tags:
  - IMP-LIST
  - Implementation
  - canvas
  - feel
kanban_status: completed
depends_on:
parent_epic: [[AI-EPIC-010-hands-on-hardening]]
confidence_score: 0.8
date_created: 2026-07-06
date_completed: 2026-07-06
---

# AI-IMP-099-grid-lod-crossfade

## Summary of Issue #1

Owner finding (2026-07-06, screenshot vs PureRef): our grid draws
ONE tier at one weight, so zoom transitions pop; PureRef draws TWO
tiers — the subdividing grid fades in with zoom at markedly lower
opacity than the primary and stays visually subordinate until zoom
promotes it to primary. Done = the grid renders major + minor
tiers with zoom-dependent opacity crossfade: minor tier opacity
ramps from 0 as its on-screen spacing grows, capped well below the
major tier (the owner's key observation — the incoming grid is
ALWAYS significantly fainter), and tier promotion at the threshold
is seamless (what was minor becomes major with no visible switch).

### Out of Scope

- Grid snapping (§6.9, separately deferred).
- Dots mode parity beyond not regressing (apply the same two-tier
  fade if trivial; otherwise note it).
- New settings: subdivision factor and fade band are feel
  constants.

### Design/Approach

In background-grid.ts: spacing levels are powers of a subdivision
factor N (pick to match PureRef's look — their cells subdivide
finer than our current 4; verify visually, likely 4 or 5). At any
zoom, level L = the largest spacing whose on-screen cell ≥ a
min-px threshold; draw L (major, full grid opacity from theme
token) and L/N (minor) with opacity = ramp(cellPx) scaled by a
MINOR_MAX well under 1 (e.g. ≤0.4 of major — tune to the
screenshot). Continuity constraint (the seamlessness proof): at
the promotion threshold, minor's ramp must reach exactly the
opacity major starts at, so the handoff is invisible. Zoom already
flows in via updateView — NO host.ts changes (AI-IMP-098 owns that
file right now).

### Files to Touch

`packages/canvas-engine/src/background-grid.ts` (+test: tier
selection at zooms, opacity continuity at the promotion boundary,
minor ≤ cap × major everywhere); e2e only if an existing canvas
spec asserts grid cheaply — units carry this one.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Two-tier render with zoom-driven minor opacity ramp; minor
      capped well below major at all zooms.
- [x] Continuity at promotion proven by unit (opacity function is
      continuous across the threshold).
- [x] Lines mode done; dots mode handled or honestly noted.
- [x] Full gates.
- [x] HUMAN-TESTING entry for the side-by-side (lead adds on
      merge).

### Acceptance Criteria

**GIVEN** the grid enabled
**WHEN** the artist zooms continuously in or out
**THEN** subdivision lines fade in faintly beneath the primary
grid, never rival it, and the moment a tier is promoted is
imperceptible — no popping, matching the PureRef reference.

### Issues Encountered

Agent-built, lead-transcribed. The ticket was over-constrained:
"minor always well below major" + "no pop" + constant-full major
cannot coexist — at promotion, old-major lines become plain new-
major members, so continuity forces majorAlpha(top) = handoff =
minor's cap. Shipped the unique continuous family: major rises
handoff→full over [48,72]px, plateaus, eases back to handoff over
[160,192]px. N=4 (binary-round vs base-64 spacing), MINOR_MAX=0.4.
Bundled fix: coincident minor lines double-stroked over major —
the visible pop. Units prove boundary equality within 5e-7 per
line class and a 1400-step sweep with no ≥0.01 alpha step. Dots
mode does NOT exist (ticket text corrected here — the settings row
is a placeholder); gridLevels is presentation-agnostic for
whenever it does. OWNER CHOICE flagged in HUMAN-TESTING: the major
"breathes" near promotion; the alternative (minor sprints past its
cap instead) is a 3-line swap if the breathe reads wrong. Gates:
289 engine / 37 desktop units, lint, canvas+settings e2e 8/8 on
the agent branch; lead re-ran units post-merge; CI covers the full
suite on push.

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
