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
date_completed: 2026-07-07
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

- [x] Primitives encode the ruling (one button geometry, uniform
      focus ring both input variants); token existence verified.
- [x] Stragglers migrated; guard allowlist empty; guard proves on
      a plant.
- [x] Renderer control sweep: no 4px/6px control buttons remain
      (rows/menus exempt as non-controls — judgment recorded).
- [x] Full e2e green; any assertion updates listed with reasons.
- [x] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
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

**Token verification (no theme.css change needed).** All tokens the
ruling names already exist in `renderer/theme.css` across the dark
(`:root`), light, and glass tiers: `--ew-border-control` (dark #4a4f57,
light/glass #aeb6c0), `--ew-surface-control-hover` (dark #3a3f47, light
#d1d7df, glass rgba), `--ew-focus-ring` (dark rgba(74,157,240,.8), light
rgba(43,108,176,.65)), plus `--ew-border-strong`, `--ew-surface-raised`,
`--ew-surface-hover`. Nothing added. Note: the OLD Button default hover
used `--ew-surface-hover`; the ruling/kit reference uses
`--ew-surface-control-hover` ("lightens one step") — Button now uses the
latter, matching the kit `Button.jsx`.

**Primitives.** `ui/Button.svelte`: `size` axis removed; ONE geometry
(5px · 1px `--ew-border-control` · `--ew-surface-raised` · hover →
`--ew-surface-control-hover` · disabled opacity .4 (was .5) · uniform
`:focus-visible` ring 2px `--ew-focus-ring` offset 1px). Added a `ghost`
variant (borderless quiet act) to match the kit reference's variant set;
no current consumer needed it, so it is carried like `danger`.
`ui/TextInput.svelte`: both variants now ring on `:focus` (2px
`--ew-focus-ring`, offset 1px) — the pill previously had NO custom ring
(browser default); offset moved 0 → 1px to match the kit.

**Consumers.** `RestoreDialog.svelte` (7× `size="dialog"` removed → the
one 5px shape) and `SettingsView.svelte` (1× `size="chrome"` removed).
No behavioural assertion touched; see e2e note. RestoreDialog's `.path`
chip was re-pointed off the field token (see guard note).

**Stragglers migrated onto the primitives.**
- `CharmRail.svelte`: project source-prompt `<input>` → `TextInput`
  (standard — "open as source" is configure, not filter). The adjacent
  "open" confirm keeps its menu-row styling (see sweep judgment).
- `GalleryFacets.svelte`: tag `<input>` → `TextInput` (pill —
  filter-in-place). Segmented sort + kind/cleanup chips are the pill
  FILTER grammar, not text-buttons — left as-is (judgment below).
- `GalleryActionBar.svelte`: tag `<input>` → `TextInput` (pill);
  tag/place/trash/pull `<button>`s → `Button` primitive (tag rides
  `variant={tagOpen?'accent':'default'}`; pull = accent + inline
  `font-weight:600`). The `.clear` ✕ stays a bespoke icon button (not a
  text control-button). Pull lost its `filter: brightness(1.05)` accent
  hover — accent does not hover-lighten under the ruling.

**GalleryView added to scope (deviation, forced).** `GalleryView.svelte`
was NOT in the ticket's straggler list but its `.designate-row` field
hand-rolls the input token, so an ABSOLUTE (empty) allowlist required
migrating it: `<input>` → `TextInput` (standard — designate is
configure). While in the file I also collapsed its two bordered control
buttons (`.designate-row`, `.designate-create`) 6px → 5px per the sweep.

**Guard → absolute.** `input-styling-guard.test.ts` ALLOWLIST is now
`new Map([])`. Only `ui/` is exempt. The plant proof (`it` #2) was
updated: it still detects a planted non-exempt field and now asserts
former allowlist members (`chrome/RestoreDialog.svelte`,
`views/GalleryFacets.svelte`) are NO LONGER exempt. To empty it without
a false positive, `RestoreDialog`'s `.path` read-only path chip (which
used `--ew-surface-input` purely as a background, never a field) was
re-pointed to `--ew-surface-raised` — a small cosmetic change to a
success-screen chip, recorded here.

**Renderer control sweep — judgment list (control vs. not).** The FENCE
("touch only ui/ + the three stragglers + theme + e2e") bounds the
EDITS; every other file's 4/6px radius was judged, not touched:
- COLLAPSED (in-fence controls): `Button.svelte` old 4px dialog geometry
  (deleted); `GalleryActionBar` `.action` 6px (→ Button 5px);
  `GalleryView` `.designate-row`/`.designate-create` 6px → 5px.
- NOT CONTROLS — kept (menus / rows / containers / popups):
  `GalleryActionBar`/`GalleryFacets` `.completions` popups (6px);
  `CharmRail` `.project-menu .row` + `.source-prompt .row` (4px menu
  rows); `RestoreDialog` `.dialog` container (6px), `.row` list rows +
  `.path` chip (4px); `GalleryView` `.period` borderless header trigger
  + `.period-list` menu (6/8px); `GalleryView` `.example-bar button`
  (999px pill action button — outside the 4/6px sweep; low-traffic
  empty-state bar, left for a later pass).
- OUT OF FENCE (owned by other agents / not listed — recorded, NOT
  touched): `chrome/Dock`, `chrome/PathBar`, `chrome/TitleStrip`,
  `chrome/SourcePanel`, `chrome/BookmarkMenu`, `chrome/TakeoverLayer`,
  `chrome/MirrorAsk`, `chrome/DropBehaviorAsk`, `chrome/MenuPopover`,
  `chrome/SearchPanel`, `CanvasHost`, `views/OutlineView`,
  `tags/TagPanel`, `tags/TagAddField`, `views/SettingsView` (beyond the
  primitive), and the stay-out `note/` + `menus/` + TrashView/HelpAbout.
  Most are menu rows / panel containers / completion popups (non-control
  by the same rule); any genuine control buttons there are a follow-up
  the lead can fan out, since the fence forbids editing them here.

**e2e assertion changes.** No existing assertion pinned an old
radius/focus, so none needed relaxing. `e2e/input-primitives.spec.ts`
EXTENDED (the 142 computed-style spec): the standard-field test now also
asserts the uniform focus ring (2px / solid / offset 1px / colour ==
`--ew-focus-ring` probe) and the `settings-snapshot-remote-test`
button's 5px radius; a NEW test asserts the same ring on the pill
`search-input` field. Button radius (not ring) is asserted because
programmatic `focus()` does not reliably trigger `:focus-visible`;
fields ring on plain `:focus`, so their ring is assertable.

**Gates (verbatim).**
- `pnpm -r build`: green (desktop `tsc --noEmit` + electron-vite build;
  only pre-existing NotePanel svelte a11y/state warnings, untouched).
- `pnpm -r test`: `151 passed (3.8m)` for apps/desktop (its `test` =
  `vitest run && electron-vite build && playwright test`, so this ALSO
  ran gate 4). All workspace package vitest suites green.
- `pnpm lint`: clean (`eslint .`, no output).
- desktop e2e (hidden): covered by `pnpm -r test` above; re-ran the
  touched surfaces standalone as confirmation —
  `input-primitives` 3 passed; `gallery gallery-selection panels
  source-panel` 28 passed; guard vitest 2 passed. No flakes; no retries
  needed.

**Not done / for the lead.** HUMAN-TESTING entry is the lead's at merge
(checklist item left unchecked, per its wording). `RAG/INDEX.md` NOT
regenerated (fence: only this ticket file in RAG/) — the lead re-runs
`generate-index.sh` on merge. The `example-bar` 999px pill buttons and
all out-of-fence control buttons remain a possible one-voice follow-up.
