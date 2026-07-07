---
node_id: AI-IMP-153
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
  - hygiene
kanban_status: planned
depends_on: [AI-IMP-142]
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed:
---


# AI-IMP-153-one-voice-sweep

## Summary of Issue #1

Kit 1.2's "One voice" ruling (KIT-CHANGELOG 1.2; answers the 142
finding): inputs keep exactly two variants as GRAMMAR (pill =
filter-in-place, standard = configure); buttons collapse to ONE
geometry — 5px radius · 1px `--ew-border-control` · raised ·
hover one step · disabled .4 — with color variants riding it (the
4px dialog and 6px variants retire); focus is UNIFORM — 2px
`--ew-focus-ring` outline offset 1px on every field and control,
never the browser default. Done means: the 142 primitives encode
the ruled shapes (the `size` axis dies), every consumer follows,
the stragglers (CharmRail source prompt, gallery facets/action
bar) migrate onto the primitives, and the guard allowlist shrinks
to zero.

### Out of Scope

- Paper habitats (keep `--ew-paper-border-focus` — their quiet
  focus is ruled separate).
- Any new tokens beyond what the ruling names (verify
  `--ew-border-control`/`--ew-surface-control-hover`/
  `--ew-focus-ring` exist in theme.css; add minimally if the kit
  assumed one that is missing — record it).
- Layout/behavior changes anywhere.

### Design/Approach

Reverse of 142's fence: this ticket IS the redesign the ruling
authorizes. Update `ui/Button.svelte` (drop `size`, 5px, uniform
focus-visible ring, disabled .4) and `ui/TextInput.svelte` (both
variants get the focus ring); consumers re-render at the ruled
geometry — their e2e should still pass (assertions are mostly
behavioral; fix any that pinned old radii/focus, listing each in
Issues). Migrate CharmRail's source-prompt input and the gallery
facet/action-bar fields+buttons onto the primitives (pill variant
per the grammar), then empty the guard allowlist so it becomes
absolute. Sweep for 4px/6px button radii in renderer chrome and
collapse them (menus/rows keep their own 4–5 radii tier — rows are
not buttons; the ruling is about CONTROLS).

### Files to Touch

`apps/desktop/src/renderer/ui/` (both primitives + guard test
allowlist → zero).
`chrome/CharmRail.svelte`, `views/GalleryFacets.svelte`,
`views/GalleryActionBar.svelte` (+ any 4px/6px control found in
the sweep).
`theme.css` only if a ruled token is missing.
E2E: existing suites green (update pinned-geometry assertions
only); the 142 computed-style spec extends to assert the uniform
focus ring.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Primitives encode the ruling (one button geometry, uniform
      focus ring both input variants); token existence verified.
- [ ] Stragglers migrated; guard allowlist empty; guard proves on
      a plant.
- [ ] Renderer control sweep: no 4px/6px control buttons remain
      (rows/menus exempt as non-controls — judgment recorded).
- [ ] Full e2e green; any assertion updates listed with reasons.
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (does the
      one voice read; focus ring weight over art).

### Acceptance Criteria

**GIVEN** any text field or control button in chrome
**THEN** it renders the ruled geometry and the uniform focus ring,
sourced from the shared primitives, with zero guard exemptions.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
