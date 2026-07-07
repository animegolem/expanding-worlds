---
node_id: AI-IMP-142
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - chrome
  - hygiene
kanban_status: completed
depends_on:
parent_epic:
confidence_score: 0.8
date_created: 2026-07-07
date_completed: 2026-07-07
---


# AI-IMP-142-input-primitive-registry

## Summary of Issue #1

Four surfaces hand-roll the same text-input/small-button look from
the same tokens (TagPanel, SearchPanel, RestoreDialog,
SettingsView — the registry lead recorded in Design-letter-3 and
STYLE-GUIDE §9). Done means: shared `TextInput` and `Button`
Svelte primitives (kit-reference anatomy: standard + pill
variants, focus ring, danger/accent button variants) exist in a
`ui/` home, the four surfaces consume them, and a lint-style guard
discourages new hand-rolled lookalikes.

### Out of Scope

- A full Panel-shell extraction (audit says optional; not now).
- Any visual CHANGE — the primitives encode the existing look;
  consuming surfaces must render pixel-equivalent (their e2e
  green unchanged).
- `<datalist>` remains banned (the primitive enforces it by
  construction).

### Design/Approach

`apps/desktop/src/renderer/ui/TextInput.svelte` + `Button.svelte`
per the kit reference props (variant, size, danger) — but SVELTE
conventions, not JSX ports. Migrate the four call sites
mechanically; diff rendered CSS before/after (computed-style spot
checks in vitest or e2e) to prove equivalence. Guard: extend the
theme guard family with a soft check — new `.svelte` files
declaring input styling from raw tokens get flagged (pattern
allowlist for the primitives themselves); pragmatic, not perfect.

### Files to Touch

`apps/desktop/src/renderer/ui/` (new): two primitives (+ vitest).
`tags/TagPanel.svelte`, `chrome/SearchPanel.svelte`,
`chrome/RestoreDialog.svelte`, `views/SettingsView.svelte`:
consume.
Guard test sibling.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Primitives land, token-only, datalist-free by construction.
- [x] Four surfaces migrated pixel-equivalent (their existing e2e
      untouched and green).
- [x] Guard flags a planted hand-rolled input (prove, remove).
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.

### Acceptance Criteria

**GIVEN** the four migrated surfaces
**THEN** rendered look is unchanged, all their specs pass, and the
input/button styling lives in exactly one place.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- **No single shipped button/input grammar.** The four surfaces had
  genuinely divergent geometry, so the primitives are parameterised
  rather than one-shape: `TextInput` variant `pill` (999px, TagPanel /
  SearchPanel) vs `standard` (5px + accent focus ring, SettingsView);
  `Button` orthogonal `variant` (default | accent | secondary |
  danger) × `size` (`chrome` 5px/0.75rem = Settings text-button,
  `dialog` 4px/0.8rem = RestoreDialog actions). Every consuming value
  matches its pre-migration CSS exactly. Layout (width / flex:none /
  max-width) stays a caller concern via `style=` — the primitives own
  only the skin.
- **Kit reference vs shipped look.** The kit's `TextInput.jsx` /
  `Button.jsx` reference `var(--ew-font-ui)`, which is NOT defined in
  theme.css (would fail the theme guard and fall back silently). The
  shipped surfaces all use `font: inherit`; I followed the shipped
  look, not the kit token, per "consolidation, not redesign".
- **Deliberate non-uniformity preserved.** Pill inputs shipped with
  NO custom focus ring (browser default); only the standard variant
  has the accent outline. Kept as-is for pixel-equivalence rather than
  unifying — a redesign call, out of scope.
- **`danger` Button variant** is carried for grammar completeness
  (tokens exist) but has no current consumer.
- **Computed-style spot check is a Playwright spec, not vitest.**
  Desktop vitest runs in the node env with no DOM / CSS cascade, so
  `getComputedStyle` cannot resolve class styling there. Per the
  ticket's "(vitest or a tiny e2e assertion)" allowance, the check is
  `e2e/input-primitives.spec.ts`: it reads the computed radius + fill +
  border of a migrated pill field (search) and standard field
  (settings remote) and compares fill/border against a same-document
  probe painted with `var(--ew-surface-input)` / `--ew-border-strong`
  (no hardcoded hex). Minor fence note: this adds one e2e spec beyond
  "four surfaces + ui/ + guard test" — it is the equivalence proof the
  ticket itself mandates.
- **Guard allowlist.** `input-styling-guard.test.ts` flags any renderer
  `.svelte` outside `ui/` using `--ew-surface-input`. Pre-existing
  surfaces not in this ticket's scope are allowlisted with reasons
  (CharmRail, GalleryActionBar/View/Facets, and RestoreDialog's `.path`
  code-display background). TagPanel / SearchPanel / SettingsView are
  NOT allowlisted — they no longer reference the token, which is the
  proof the duplication was removed. Plant proof: a throwaway
  `note/_plant.svelte` was flagged, then deleted.
