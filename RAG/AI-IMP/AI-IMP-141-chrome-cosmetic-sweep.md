---
node_id: AI-IMP-141
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
kanban_status: completed
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.85
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-141-chrome-cosmetic-sweep

## Summary of Issue #1

The component audit found the shipped DOM chrome nearly identical
to the kit; this ticket closes the small deltas in one pass. Done
means: selection outline reads `--ew-accent` (today a hardcoded
engine color mirroring it), PathBar separator becomes `▸`, the
tooltip chip swaps to the kit's token trio, the charm BAR restyles
to the kit surface (menu surface + shadow, 26px buttons) keeping
its extra appearance button, hint charms trade unicode ¶/⊡ for the
kit's drawn bordered-div shapes, and the toast/action-bar/
recognition-chip confirmations from the audit are asserted (no
change expected).

### Out of Scope

- Frame furniture (138), image bodies (140), paper (134/135).
- Any behavior change — pure presentation; every existing e2e
  stays green with stable testids.

### Design/Approach

Small ordered passes, one commit: (1) engine SELECTION_COLOR reads
the accent token via the resources bridge (both themes; e2e color
assertions updated if any pin exact color). (2) PathBar `/`→`▸`.
(3) tooltip.ts token swap. (4) charms-ui bar restyle per kit
CharmBar (keep appearance button; glyphs stay unicode in the BAR
— the drawn-shape upgrade applies to HINT charms per kit). (5)
hintButton renders the two drawn shapes (page = document with rule
lines; frame = framed box) as bordered divs on tokens, same scrim
chip, same cadence. (6) audit-confirmation asserts only.

### Files to Touch

`packages/canvas-engine/src/` selection color plumbing (+
resources).
`apps/desktop/src/renderer/chrome/PathBar.svelte`,
`chrome/tooltip.ts`.
`apps/desktop/src/renderer/canvas/charms-ui.ts` (bar restyle +
hint shapes).
Touched e2e assertions only where colors/glyphs were pinned.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Selection = accent token on both themes.
- [x] PathBar ▸; tooltip token trio; bar restyle with appearance
      button intact.
- [x] Hint charms drawn shapes, cadence/scrim unchanged.
- [x] Full e2e green; no testid churn.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (hint
      shapes read at a glance vs old glyphs).

### Acceptance Criteria

**GIVEN** the merged sweep
**THEN** every listed surface matches the kit reference on tokens
with zero behavior change and a fully green suite.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **Charm-bar interception regression, diagnosed and fixed.** The
  straight kit geometry (26px buttons + 6px vertical padding + 4px
  gap) grew the bar's outer height 32→40px, and five note/panel
  specs went red deterministically: Playwright's actionability
  hit-test found `charm-bar` covering the panel's first-line
  wiki-link. Proven mine by stash-and-rerun on clean base (24/24
  green without the diff). Two-part fix, no spec weakened:
  (1) the disengaged charms layer is now pointer-transparent
  (`pointer-events:none !important` on the layer and its subtree —
  an opacity-0 bar was still swallowing clicks because its inline
  `pointer-events:auto` survived the fade); (2) the bar keeps the
  full kit visual language (menu surface, `0 8px 22px` shadow, 10px
  radius, borderless 26px/7px-radius buttons) but holds vertical
  padding at 2px so the OUTER height stays the pre-restyle 32px.
- **Latent z-inversion found (for the lead, out of my fence):**
  `note/NotePanel.svelte` and `note/NotePanels.svelte` still carry
  literal `z-index: 8` while the charms layer sits at
  `Z.affordance` (100) — panels render UNDER canvas affordances,
  inverting the §8.8 ladder (panel=200 > affordance=100). That
  inversion is why a taller bar could occlude panel text at all.
  note/ was fenced to the TipTap agent, so it is flagged here, not
  fixed.
- Popover anchors (tag chips / appearance) were a fixed `+44`
  encoding the old 32px bar; they now derive from the live bar
  height (`top + offsetHeight + 2`), same resulting geometry today,
  robust to future bar restyles.
- No theme.css token additions were needed: `--ew-chip-text`,
  `--ew-chip-border`, `--ew-surface-menu`, `--ew-shadow`, and
  `--ew-accent` all pre-exist in both theme blocks. No raw hex
  added anywhere.
- No e2e assertion changes were needed: nothing pinned the old
  selection hex (0x4a9df0 lived only in host.ts; dark
  `--ew-accent` resolves to the same value), the `/` separator, or
  the ¶/⊡ hint glyphs.
- Local `main` advanced twice during the build (153 merge + a
  ContextMenu z-port hotfix that itself fixed a z-guard unit
  failure my first gate run hit); rebased the working set onto
  2cbf4e82 before gating. `RAG/INDEX.md` was NOT regenerated here
  (worktree fence: only this ticket file in RAG/) — lead
  regenerates at merge.
