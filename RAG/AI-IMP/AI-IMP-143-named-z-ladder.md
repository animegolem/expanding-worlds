---
node_id: AI-IMP-143
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
  - hygiene
kanban_status: planned
depends_on: [AI-IMP-130]
parent_epic:
confidence_score: 0.75
date_created: 2026-07-07
date_completed:
---


# AI-IMP-143-named-z-ladder

## Summary of Issue #1

Rev 0.55 names the §8.8 z-ladder (world 0 → tooltip 800) and the
audit found 7 unordered literals in the renderer (incl. tooltip at
1000 vs the named 800, place-ghost at 480). Done means: every
z-index in the renderer references the named ladder (130's Z
module) — intra-overlay stacking contexts may use small locals but
must document their rung — and a guard fails new literal z-indexes.

### Out of Scope

- Changing stacking BEHAVIOR: each site maps to the rung §8.8
  already assigns it; any observed reorder is a bug to fix, not a
  redesign.
- DOM vs canvas layering (unchanged).

### Design/Approach

Map the 7 sites (charms-ui 1/6, pin-tool 7, open-note 25,
node-menu 30, place-mode 480, tooltip 1000) onto rungs: tooltip →
Z.tooltip; node-menu → Z.popover; place-ghost → Z.chrome-adjacent
(assign per §8.8 order and verify visually via e2e overlap
scenarios — ghost must ride above panels, below modals); locals
inside one absolutely-positioned parent may stay small ints with a
`// rung:` comment. Guard: source scan for `z-index:` literals
outside the module/comment convention (theme-guard style). E2E:
the shipped occlusion tests must stay green; add one
tooltip-over-modal assertion since tooltip's value changes.

### Files to Touch

The 7 sites; `z.ts` consumers; a guard test; occlusion e2e
extension.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] All 7 sites on the ladder (or documented locals); no
      literal z remains unguarded.
- [x] Occlusion e2e green + tooltip-over-modal added; place-ghost
      layering visually verified in an overlap e2e.
- [x] Guard proves on a plant.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the merged branch
**THEN** the renderer's stacking derives from the named ladder,
behavior is unchanged (occlusion suite green), and a new literal
z-index fails the guard.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**Site → rung mapping (all 7 audited sites; re-grep found no new
ones).** All six ported sites live in renderer `.ts` and template the
Z module into their `cssText`; the seventh is a documented local.

| Site | Was | Rung | Why |
|---|---|---|---|
| `canvas/charms-ui.ts:97` charm layer | 6 | `Z.affordance` (100) | Full-inset DOM adornment over the board — the canvas-affordance band §8.8 rung 2. |
| `canvas/charms-ui.ts:150` tag completions | 1 | local (kept `z-index:1`) | Nested inside the tag popover's `position:relative` add-row — an intra-overlay LOCAL stacking context, not a global-ladder decision. Kept with a same-line `// rung: popover — local stacking context` comment (the guard's escape hatch). |
| `canvas/pin-tool.ts:52` provisional dot | 7 | `Z.affordance` (100) | Same band as the charm layer; both are canvas affordances. The audit's 6 vs 7 was arbitrary and collapses into one rung (they never fight — the dot is 12px, the layer is pointer-transparent). |
| `note/open-note.ts:290` label rename input | 25 | `Z.panel` (200) | Inline edit of a note's label belongs to the note-panel band: above canvas affordances, below menus/popovers. Preserves prior order (25 sat below the 30 menu / 480 ghost). |
| `canvas/node-menu.ts:117` context menu | 30 | `Z.popover` (500) | Anchored context menu — §8.8 rung 6 (per the ticket). |
| `canvas/place-mode.ts:153` drag ghost | 480 | `Z.popover` (500) | Judgment call — see below. |
| `chrome/tooltip.ts:22` tooltip chip | 1000 | `Z.tooltip` (800) | Top rung. |

**Judgment call — place-mode ghost → `Z.popover` (500).** §8.8 says
the ghost must ride ABOVE panels and chrome yet UNDER modals. The only
named rung in that band (chrome 400 < X < modal 600) is popover 500, so
that is the §8.8-correct rung. The in-code comment at
`place-mode.ts:16` calls the ghost "chrome" — that means
pointer-transparent / never-occludes-board, NOT the chrome z-band; its
old 480 was already above the chrome band. This ties `node-menu`
(also popover 500) and the not-yet-migrated modal overlay-host
(CanvasHost.svelte's ad-hoc `z-index:500`, explicitly deferred to
EPIC-016), but a drag-ghost never coexists with an open context menu or
a fullscreen modal; once EPIC-016 lifts the modal to `Z.modal` (600)
the ordering is strictly `ghost 500 < modal 600`.

**Visual verification (new `e2e/z-ladder.spec.ts`, both green).** Both
surfaces are `pointer-events:none`, so `elementFromPoint` would skip
them; each test flips the surface to `auto` as a measurement probe,
samples the topmost element at the point, then restores — a real
paint-order check.
- *Tooltip over modal:* open the big editor, force a tooltip via a real
  `pointerenter` on `tool-select` (still in the DOM under the
  backdrop); the chip is the topmost element at its own centre →
  tooltip 800 still tops the modal (was 1000; nothing lives in
  800–1000, so lowering it is safe).
- *Ghost over chrome:* dispatch `ew-place-mode` seating the ghost over
  the dock; without the probe the dock owns the hit (ghost is
  pointer-transparent → overlap confirmed), with the probe the ghost is
  topmost → ghost 500 paints above chrome.

**Guard (`renderer/z-guard.test.ts`).** Vitest source-scan (theme-guard
style): fails any `z-index:<digit>` literal in renderer `.ts` sources
unless the line carries a `rung:` comment. Ladder references read
`z-index:${Z.popover}` — the char after the colon is `$`, never a
digit — so they pass. **Proved on a real plant:** a bare
`z-index:999;` planted in `place-mode.ts` made the guard fail at
`place-mode.ts:56`; removing it returned it to green. A second in-memory
`it()` is the permanent proof (planted literal fails; a `Z.`-reference
and a `rung:`-commented local both pass).

**Deviation — guard scans renderer `.ts` only, not `.svelte`.** All 7
audited sites are `.ts`. Scanning `.svelte` would fail ~34 pre-existing
literals (overlay-host, dock, chrome-layer, source panel, note
dialogs) in files this ticket must not touch. That band is §8.8's
"eleven collision pairs (AI-EPIC-016)"; CanvasHost.svelte's
overlay-host carries its own in-code note deferring its ad-hoc 500 to
"EPIC-016's named z-ladder … the 'modal' rung". The guard's scope
comment records this. The primary regression surface — imperative DOM
z-index in renderer `.ts` — is fully guarded.

**Gates (all green, in order).**
- `pnpm -r build` — Done (only a pre-existing Svelte a11y warning in
  SettingsView, not from this change).
- `pnpm -r test` — desktop 116 vitest unit + 150 playwright e2e all
  passed (incl. the 2 new z-ladder specs; occlusion/modal-escape suite
  green). Other packages green.
- `pnpm lint` — clean.
- `cd apps/desktop && pnpm test` — 116 unit passed; e2e 149 passed / 1
  failed on `navigation.spec.ts:269` (bookmark/trash/restore — an
  async-navigation flake unrelated to z-index; it passed in the earlier
  `-r test` run). Retried `navigation.spec.ts` alone → 7/7 green.

**Not done (reserved for the lead per the delegation model):** ticket
close (`kanban_status`, `date_completed`) and
`./RAG/scripts/generate-index.sh` — the latter edits `RAG/INDEX.md`,
outside this brief's "only your ticket file in RAG/" fence.
