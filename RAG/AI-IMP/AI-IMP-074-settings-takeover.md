---
node_id: AI-IMP-074
tags:
  - IMP-LIST
  - Implementation
  - settings
kanban_status: completed
depends_on: [AI-IMP-068, AI-IMP-075]
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.7
date_created: 2026-07-05
date_completed: 2026-07-06
---

# AI-IMP-074-settings-takeover

## Summary of Issue #1

Settings exist nowhere: no project settings table, no app-config
store, no surface. This ticket builds §11.5 end to end. Storage is
two-tier by blast radius: a project `setting` table (migration
0006, key/value JSON) written through a dedicated non-undoable
project-API channel — settings changes never enter command history
— and an app-config JSON file in the application configuration
directory managed by the main process over IPC. The surface is the
☰ → Settings takeover: a translucent inset sheet with the board
visible at the edges and through it, commit-on-click with no
apply/save buttons, Esc closes, changes apply live to the world
behind the sheet. The full §11.5 inventory renders; controls whose
features exist wire live (theme via 075, charm corner, chrome fade
delay, title strip mode, window opacity, flat canvas color, trash
retention, Obsidian-vault + mirror-drops read-only display); the
rest render disabled with an "arrives with…" tooltip, matching how
the rail charms waited. Covers EPIC-013 FR-9. Done when: every
wired setting applies live and persists across relaunch in the
right tier, and a settings e2e spec passes.

### Out of Scope

Theme token definitions (075 — this wires the picker). Grid and
snap (no grid feature), window border/rounded corners (frameless
work), the vault/mirror behaviors themselves (their epics) — all
render disabled. Windows/Linux ☰ placement option ships but only
affects those platforms.

### Design/Approach

Persistence: migration 0006 creates `setting(key TEXT PRIMARY KEY,
value TEXT)` per project; `getSettings`/`setSetting` on the project
API beside (not inside) the command pipeline, with a
`settings-changed` push so open surfaces react. App tier: main
process owns `app-settings.json` (userData dir) with get/set IPC
and the same push; renderer wraps both in one
`settings.ts` store exposing typed accessors with defaults — the
tier is an implementation detail to consumers. Surface:
SettingsView mounted in the 068 TakeoverLayer for kind 'settings',
styled as an inset translucent sheet (board visible around and
through). Controls are plain clicks — segmented rows, swatches,
sliders — each writing on interaction; subscribers do the live
apply: theme → 075's applyTheme; charm corner → charms-ui reads the
setting; fade delay → engagement clock override (slider + never);
title strip mode → TitleStrip (hover/always/never); window opacity
→ BrowserWindow.setOpacity IPC; flat canvas color → default board
color behind boards with no background; trash retention (project
tier) → the GC/purge threshold. Disabled inventory items use the
deferred-tooltip grammar. Esc closes via the framework; nothing to
save.

### Files to Touch

`packages/persistence/src/migrations/0006-settings.ts` + index:
new.
`packages/persistence/src/settings.ts` (+ units): get/set, typed
defaults.
`apps/desktop/src/main/` (project API + app config): setting IPC
both tiers; window opacity IPC.
`apps/desktop/src/preload/`: expose settings API.
`apps/desktop/src/renderer/settings/settings.ts`: unified store.
`apps/desktop/src/renderer/views/SettingsView.svelte`: new — the
sheet + inventory.
`apps/desktop/src/renderer/chrome/` (engagement, TitleStrip,
CharmRail placement) + `canvas/charms-ui.ts`: read their settings.
`apps/desktop/e2e/settings.spec.ts`: new.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [x] Migration 0006 + project get/set outside command history —
      changing a setting adds no undo entry (unit). *(No migration:
      0001 already ships the `settings` table for exactly this — see
      Issues. The non-undoable channel is the `set-setting` service
      verb; units assert no command_log row and no revision bump.)*
- [x] App-tier store in userData with IPC get/set/push; corrupt or
      missing file falls back to defaults (unit or e2e).
      *(EW_APP_CONFIG_DIR env override isolates e2e; corrupt-file
      fallback e2e'd.)*
- [x] Unified renderer settings store with typed defaults and
      change subscription.
- [x] SettingsView renders the full §11.5 inventory: Appearance
      (theme · grid · flat canvas color · window opacity), Behavior
      (charm corner · fade delay · snap · vault · mirror drops),
      Window (title strip · border · rounded corners),
      Windows/Linux ☰ row; unbuilt features disabled with
      "arrives with…" tooltips.
- [ ] Live apply wired: theme repaint behind the sheet; charm
      corner flips existing charms; fade delay (and "never")
      honored by the engagement clock; title strip always/never
      modes honored; window opacity changes the window; flat
      canvas color shows on a background-less board; trash
      retention respected by purge (unit at the persistence seam).
      *(Everything live and validated EXCEPT the final clause: no
      automatic purge-by-retention exists anywhere to respect the
      setting — a pre-existing §9 gap, not introduced here. The
      retention write path (SetTrashRetention command) and read
      (getTrashRetention) are wired and e2e'd; the enforcement unit
      belongs to whichever ticket builds retention GC.)*
- [x] Commit-on-click only — no apply/save/cancel controls; Esc
      closes; settings survive relaunch in the correct tier
      (project setting stays with the project DB, theme follows
      the app).
- [x] e2e: change theme + charm corner + title strip mode, close,
      relaunch, assert persistence; assert no undo entry appeared.
      *(Plus: real BrowserWindow opacity, live charm-corner flip,
      title-strip never mode, flat-color stage repaint via
      __ewDebug.stage().fallbackColor.)*
- [x] `pnpm -r build`, full gates green. *(65 e2e, 389 persistence
      incl. 4 settings units, 11 desktop units, lint.)*

### Acceptance Criteria

**Scenario:** Tuning the app without a save button.
**GIVEN** a board with placements and default settings.
**WHEN** the user opens ☰ → Settings and clicks the light theme
swatch.
**THEN** the board and chrome behind the translucent sheet repaint
immediately, and no undo entry is created.
**WHEN** the user sets charm corner to upper-right and presses Esc.
**THEN** the sheet closes and existing node charms sit upper-right.
**WHEN** the app relaunches on the same project.
**THEN** theme and charm corner persist, and the disabled grid row
still names the feature it waits for.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

**The ticket's storage assumptions were stale.** Migration 0001 had
already created the `settings` table (commented "§11.5 project-tier
settings"), and trash retention was already an UNDOABLE command
(SetTrashRetention, AI-IMP-013) writing into it. Reconciliation:
no migration 0006; retention KEEPS its command (it is
project-data-affecting per the §11.5 blast-radius rule, and §9's
Trash view will expose the same control) and the SettingsView row
dispatches it; only NEW preference keys go through the non-undoable
`set-setting` verb — one write grammar per key, never two.
EPIC-007 (undo UI) is still backlog, so "undoable" today means an
inverse in the command result, not a visible history entry.

**No purge-by-retention exists** (pre-existing): gc.ts never reads
trash_retention, so the "respected by purge" unit cannot be written
yet — checklist item left unchecked with the caveat inline.

**Consumers were sequenced around parallel agents**: charms-ui
(charm corner) landed only after the 071 merge and TitleStrip
(strip mode) after the 070 merge, to avoid stepping on their files;
the ticket shipped across four commits instead of one for the same
reason (WIP checkpoint precedent from 069).

**e2e isolation gap found and fixed**: without EW_APP_CONFIG_DIR,
every test instance shares Electron's DEFAULT userData for the
app-settings file — launches now default to a fresh temp config dir
in helpers.ts, with tests that need relaunch persistence passing
their own.

**Title-strip assertions must precede opening the takeover** — the
068 ChromeLayer unmounts TitleStrip under any takeover; the first
draft of the relaunch e2e asserted the strip while Settings was
open and failed.

**Deferred rows honestly deferred**: grid/snap (no grid feature),
border/rounded corners (frameless work), vault (§16), session
snapshots (§11.4 rev 0.24), mirror drops (§14.4) — all
aria-disabled with "arrives with…" tooltips; vault/mirror rows
display current project values via getSettings. The ☰ placement
row is Windows/Linux-only and renders disabled on macOS.
