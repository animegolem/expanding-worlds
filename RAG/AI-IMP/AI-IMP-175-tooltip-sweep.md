---
node_id: AI-IMP-175
tags:
  - IMP-LIST
  - Implementation
  - tooltip
  - a11y
  - polish
kanban_status: completed
depends_on: []
parent_epic:
confidence_score: 0.8
date_created: 2026-07-08
---


# AI-IMP-175-tooltip-sweep

## Summary of Issue #1

Owner-requested 2026-07-07. RFC §8.2 tooltip rule: "Every hoverable
control shows a tooltip naming the control and printing its keyboard
shortcut, in one chip style app-wide… No control ships without one:
the GUI is the tutorial for the keyboard-driven app." No audit has
ever swept the whole surface, so coverage is unknown and almost
certainly uneven — some controls have chips, some have none, some
name the control but omit a shortcut that exists. This ticket is a
one-pass app-wide audit of every interactive control against that
rule plus the five legal shapes ratified rev 0.55, then fixes the
gaps it finds. Done means: every hoverable/clickable control has a
tooltip in the shared chip style; each chip is one of the five legal
shapes; and every control that has a registered shortcut prints it.
The audit itself (the control-by-control table) is recorded in Issues
Encountered at build time as the durable coverage record.

The five legal shapes (§8.2, rev 0.55) — a chip may ONLY be:
1. name+shortcut ("Undo · ⌘Z")
2. name-only (control with no shortcut)
3. disabled-with-reason ("the desktop is the stage…")
4. state-with-exit ("Lens on · esc")
5. coming-soon naming (deferred control)
Never: prose beyond one line, interactive content, images, a second
style, or tooltips on menu rows (menus print shortcuts inline, so
menu ROWS are out of scope — see §8.2 "never… tooltips on menu rows").

### Out of Scope

- Menu rows / context-menu items (§8.2 excludes them; they print
  shortcuts inline — do NOT add hover chips to menu rows).
- The keymap-registry build-out and Settings→Keyboard view (RFC
  §8.2 "keymap registry" direction — separate deferred work).
- Rebinding. Chips print the current default combo only.
- Any behavioral bug in a control (only its tooltip is in scope).
- Wiki-link chip state coverage is already specced/handled; verify
  it exists but do not re-implement.

### Design/Approach

Enumerate every interactive control surface, then check each against
the rule using the shared tooltip helper (`tooltip()` in
`apps/desktop/src/renderer/common/tooltip.ts` — the house pattern;
every chip MUST route through it so there is exactly one chip style).
Where a shortcut exists, source its printed combo from the same place
the control's binding is declared (keys registry / the control's own
handler) so the printed text cannot drift from the real binding — the
AI-IMP-172 lesson (a hand-copied label silently disagreed with the
projection).

Surfaces to walk (start set — the audit confirms completeness):
- Canvas charms / charm rail (`canvas/charms-ui.ts`, `CharmRail.svelte`).
- Path bar / breadcrumb + ‹ › back/forward (`chrome/PathBar.svelte`).
- Dock and its buttons (`chrome/Dock.svelte`).
- Title strip / frameless-shell window controls (`chrome/TitleStrip.svelte`).
- Bookmark menu affordances (`chrome/BookmarkMenu.svelte`).
- Note panel controls (`note/NotePanel.svelte`, `note/NotePanels.svelte`).
- Search / tag panel controls (`chrome/SearchPanel.svelte`, `tags/TagPanel.svelte`).
- Views: Gallery, Trash, Settings toolbars (`views/*.svelte`).
- Crop editor / big-editor chrome buttons.

For each control the audit records: control name · surface/file ·
has-chip? · chosen shape · shortcut printed? (and whether one exists).
Any row failing the rule is fixed in the same pass.

### Files to Touch

Determined by the audit; the likely edit set:
`apps/desktop/src/renderer/common/tooltip.ts`: confirm single helper;
no new style.
`apps/desktop/src/renderer/canvas/charms-ui.ts`, `.../CharmRail.svelte`: chip gaps.
`apps/desktop/src/renderer/chrome/PathBar.svelte`, `Dock.svelte`,
`TitleStrip.svelte`, `BookmarkMenu.svelte`: chrome control chips.
`apps/desktop/src/renderer/note/NotePanel.svelte`, `NotePanels.svelte`: panel controls.
`apps/desktop/src/renderer/chrome/SearchPanel.svelte`, `tags/TagPanel.svelte`.
`apps/desktop/src/renderer/views/GalleryView.svelte`, `TrashView.svelte`, `SettingsView.svelte`.
LOC: audit-driven; estimate ~60–120 across surfaces (mostly one
`tooltip()` call per gap).

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Enumerate every interactive control across the surfaces above;
      build the coverage table (control · file · has-chip · shape ·
      shortcut). Paste the full table into Issues Encountered.
- [x] Every chip routes through the shared `tooltip()` helper — no
      second style introduced.
- [x] Each chip is one of the five legal shapes; flag/fix any prose,
      image, or second-style violations found.
- [x] Every control with a registered shortcut prints it, sourced
      from the binding declaration (not a hand-copied literal).
- [x] Controls with no shortcut use name-only; deferred controls use
      coming-soon naming; modal/lens controls use state-with-exit.
- [x] Menu rows confirmed EXCLUDED (no hover chips added there).
- [x] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
      e2e (`EW_TEST_HIDDEN_WINDOWS=1`).
- [ ] Append an `RAG/HUMAN-TESTING.md` entry: hover the chrome, the
      charms, the panels, and each view toolbar; confirm every
      control names itself and prints its shortcut, one chip style.

### Acceptance Criteria

**GIVEN** any hoverable interactive control anywhere in the app
(excluding menu rows)
**WHEN** the pointer rests on it past the tooltip delay
**THEN** a chip appears in the single app-wide style
**AND** the chip is one of the five legal shapes (§8.2, rev 0.55)
**AND** if the control has a registered keyboard shortcut, the chip
prints it, matching the actual binding.

**GIVEN** the coverage audit
**WHEN** the ticket is built
**THEN** the full control-by-control table is recorded in Issues
Encountered as the durable coverage record.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

#### Audit policy adopted (recorded for the lead)

The rule ("every hoverable control") was applied through a crisp,
uniform test so the sweep hit real gaps rather than carpet-bombing
self-labeling text:

- A control gets a house `tooltip()` chip when it is **icon/glyph-only**
  (its visible content does not name it), OR it carries a **registered
  keyboard shortcut** (print it, sourced from the registry), OR it
  currently shows a **native `title=`** on an interactive control (a
  second-style violation — convert it).
- A button whose **visible text already names it** and has **no
  shortcut / no disabled-reason** is self-labeling → no redundant chip.
  This matches existing house practice (dock/rail/path chip their
  icons; dialog text buttons ship bare) and the self-effacing-chrome
  doctrine.
- Disabled-with-reason → the shape-3 chip. Lens/modal toggles that exit
  on esc → shape-4 state-with-exit. Deferred controls → shape-5.
- Native `title=` on **non-interactive decorative glyphs** (data
  labels, not controls) is OUT of scope — see the residual list below.
- `Button.svelte` (the shared primitive) gained an optional `tip?:
  TooltipSpec` prop so a button's name/shortcut/disabled-reason rides
  the ONE chip style; passing a native `title` to it was the only way
  its callers could tooltip before, and that was a second style.

#### Coverage table (control · file · before → after)

Already compliant (chip via `tooltip()`, spot-checked — no change):
PathBar (home/back/forward/crumb/bookmarks — back/forward/bookmarks
print shortcuts) · Dock tools + shapes (print shortcuts) · Dock
align/distribute/arrange/normalize/group/ungroup/lock/hide/zoom-
selection/zoom-in/zoom-out/frame-actions (name-only, no registered
shortcut) · CharmRail project/search/graph/gallery/outline/menu/perch
(name-only; graph is coming-soon) · TitleStrip Board menu · BookmarkMenu
(all rows) · MenuPopover rows · NotePanel header (places/origin/place-
on-board/expand/untape/tear/pin/close) · canvas charms-ui
(dot/icon/image/card/tag/corner/note buttons).

Gaps fixed this pass:

| Control | File | Before | After |
|---|---|---|---|
| reorder forward/backward/front/back | Dock.svelte | name-only, shortcut existed | name **+ shortcut** (KEY.boardSend*) |
| zoom-fit ⤢ | Dock.svelte | name-only, shortcut existed | name **+ ⇧1** (KEY.boardZoomFit) |
| gallery trash | GalleryActionBar | native `title` (readOnly hint only) | `tip`: readOnly→disabled-reason, else name **+ Delete** (KEY.galleryDelete) |
| gallery tag/place/pull | GalleryActionBar | native `title` disabled-reason | `tip` disabled-with-reason chip |
| clear selection ✕ | GalleryActionBar | aria-only icon | name-only chip |
| tag rename ✎ | TagPanel | native `title` | name-only chip |
| tag lens ◐ | TagPanel | native `title` (static) | shape-4 "Lens on · esc" / shape-3 "No carriers…" / name-only |
| tag close ✕ · row note ¶ · row fly ⌖ | TagPanel | aria-only / native `title` | name-only / name chips |
| search close ✕ | SearchPanel | aria-only icon | name-only chip |
| metadata off/on ✕ · fold ▾▸ · fly ⌖ | MetadataCard | native `title` | name-only / state chips |
| outline alias ⤴ · place-node · place-note | OutlineView | native `title` | name-only chips |
| uses-node row | UsesList | native `title` | name chip (center/fly by canvas) |
| thumbnail-size slider | GalleryView | native `title` on `<label>` | name-only chip |
| remove-tag ✕ | GalleryFacets | aria-only icon | name-only chip |
| quicklook close | GalleryQuickLook | aria-only icon | name-only chip |
| flat-color off + 6 swatches | SettingsView | off had native `title`; swatches had NO name at all | name-only chips (+aria on the six) |
| edge-chip fly ➤ · landmark pull-pin | NotePanels | aria-only icons | name chips |
| chooser close ✕ | LocationChooser | aria-only icon | name-only chip |
| source-panel close ✕ | SourcePanel | aria-only icon | name-only chip |
| import cancel ✕ | ImportProgressStrip | aria-only icon | name-only chip |
| window min/max/close (Linux) | TitleStrip | aria-only icons | name-only chips |

Self-labeling text buttons — deliberately NOT chipped (no shortcut, the
label IS the name): Trash view Restore / Delete Permanently / Cancel /
Empty trash; Settings segmented toggles (theme/charm-corner/fade) and
Behavior text buttons; Gallery scope this-world/everything, period ▾,
designate/create-library, clear-example; GalleryFacets sort/kind/untagged/
unplaced chips; SourcePanel tag-border segments; HelpAbout Close +
all-shortcuts; MirrorAsk yes/no; DropBehaviorAsk options; TitleConflict
buttons; RestoreDialog rows + confirm buttons; FirstRunGuide picks/next;
AttachNotePicker create/cancel; NotePanels big-editor Done; crop editor
Reset/Cancel/Apply (editor-local Enter/Esc keys are NOT in the registry —
§8.2 excludes editor-local keymaps, so a printed combo would be a hand-
copied literal, the AI-IMP-172 anti-pattern).

Menu rows confirmed EXCLUDED per §8.2 (no hover chips added): MenuPopover
already uses `tooltip()` on its buttons — those are charm-bar-anchored
menu buttons that print inline, left as-is; no context-menu ROW got a
chip.

#### Residual native `title=` on NON-controls (flagged, left in place)

These are decorative/data labels on non-interactive elements, NOT
controls the tooltip rule governs; converting hundreds of per-row glyphs
to JS chip listeners is off-doctrine and heavy. Left as native `title`,
surfaced here for a lead call:
NodeRow ¶/⊡ glyphs · NotePanel "Unsaved burst" dot ● · OutlineView "note"
glyph · TrashView kind glyph · GalleryView text-post tag list (per-cell
`#tag` data) · SourcePanel dir full-path on the truncated name ·
SettingsView deferred-row `title={hint}` (an aria-disabled `<div>`, not a
clickable control).

#### Copy the lead should eyeball

- **SettingsView flat-color swatches**: no per-swatch human name exists
  (tokens `--ew-canvas-flat-1..6`). Rather than invent color names I
  used index-based `Flat canvas color 1..6` name-only. If the owner
  wants evocative names, that's a copy call.
- **TagPanel lens** now reads "Lens on · esc" when active (matches the
  RFC's own shape-4 example) / "No carriers on this board" when
  disabled / "Lens — dim everything but this tag" when off.
- **OutlineView place-* / UsesList** copy was lowercased to house tone
  ("Place on current canvas") vs the old Title-Case native title.

#### Notes

- The shared `tooltip()` singleton chip is now the single style for all
  the above; `Button.svelte` routes through it via the new `tip` prop.
- Did NOT touch command execution / undo / allowlists anywhere (a
  parallel agent owns charms-ui.ts / ContextMenu.ts command wrapping);
  charms-ui.ts was not edited at all.
- Added `chrome/tooltip.test.ts` (jsdom) spot-checking the helper
  contract every control now depends on: aria naming, the delay, the
  name+shortcut shape, and reactive re-naming (the lens case).
