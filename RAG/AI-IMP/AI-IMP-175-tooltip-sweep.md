---
node_id: AI-IMP-175
tags:
  - IMP-LIST
  - Implementation
  - tooltip
  - a11y
  - polish
kanban_status: planned
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

- [ ] Enumerate every interactive control across the surfaces above;
      build the coverage table (control · file · has-chip · shape ·
      shortcut). Paste the full table into Issues Encountered.
- [ ] Every chip routes through the shared `tooltip()` helper — no
      second style introduced.
- [ ] Each chip is one of the five legal shapes; flag/fix any prose,
      image, or second-style violations found.
- [ ] Every control with a registered shortcut prints it, sourced
      from the binding declaration (not a hand-copied literal).
- [ ] Controls with no shortcut use name-only; deferred controls use
      coming-soon naming; modal/lens controls use state-with-exit.
- [ ] Menu rows confirmed EXCLUDED (no hover chips added there).
- [ ] Gates: `pnpm -r build && pnpm -r test && pnpm lint` + hidden
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
