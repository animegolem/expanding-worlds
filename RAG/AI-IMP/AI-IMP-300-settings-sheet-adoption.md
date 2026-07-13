---
node_id: AI-IMP-300
tags:
  - IMP-LIST
  - Implementation
  - settings
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-286, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed: 2026-07-13
---

# AI-IMP-300-settings-sheet-adoption

## Summary of Issue #1

The Settings document is ratified and the kit push 1.2 drew the
sheet (letter 31): inset translucent sheet, folding sections,
segmented theme/grid/DENSITY controls (the 286 token pair becomes
a user-visible setting), flat-canvas swatches live, kit-drawn
toggles, "this world" scope chips, no-save header copy. The
shipped SettingsView carries known lies the sweep retires:
placeholder rows presenting no live control (Grid, Snap, Border,
Rounded), and menuPlacement recording a value nothing reads. Done
means: the sheet matches the kit, density switches live through
the 286 token, every visible row is a live control (placeholders
either gain their real control or leave), menuPlacement's dead
value is removed, and natives are gone (guard shrinks).

### Out of Scope

- New settings semantics: rows keep their §11.5 storage tiers.
- The ☰ Export row (AI-IMP-292 owns the menu side; the Settings
  export surface itself is shipped and stays).
- Retention/GC controls (their behavior shipped at rev 0.70).

### Design/Approach

SettingsView adopts the kit sheet anatomy: folding sections
(fold handles are drawn and waiting per SURFACE-REVIEW), scope
chips marking this-world vs app tier, segmented controls from ui/,
swatches via SwatchRow, toggles kit-drawn, header copy states the
no-save contract. Density segment writes the data-density root
attribute + persists at the app tier (286's switch). Placeholder
rows: round-1 adjudicates each (Grid/Snap/Border/Rounded) — if
its backing behavior exists, wire the real control; if not, the
row LEAVES (GR-2's disabled-forever retirement; it returns with
its feature). menuPlacement: remove the row and the dead stored
value (a settings read of the stale key must not error — round-1
checks the settings store's tolerance).

### Files to Touch

`apps/desktop/src/renderer/settings/SettingsView.svelte` (round-1
  confirms path): the adoption.
`apps/desktop/src/renderer/theme.ts` / density wiring from 286.
Settings store (app tier) for density; menuPlacement removal.
Guard allowlist: settings has only range controls, not the prohibited
select/color/number/datalist natives; no settings entry needs retiring.
e2e: density switch + folding + placeholder-rows-gone; existing
  settings specs updated.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verify SettingsView's current rows against the kit
      sheet; adjudicate each placeholder row (live control vs
      leaves) and record the table here; check stale-key
      tolerance.
- [x] Sheet anatomy: folding sections, scope chips, no-save header
      copy, kit toggles/segmented/swatches; no natives.
- [x] Density segment: switches data-density live (bands + row
      heights respond without reload), persists at app tier.
- [x] Placeholder rows resolved per the round-1 table; no row
      presents a control that does nothing.
- [x] menuPlacement row + stored value removed safely.
- [x] Guard allowlist settings entries removed.
- [x] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** density is a setting.
**GIVEN** the settings sheet open at desktop density
**WHEN** the user switches density to comfortable
**THEN** rows grow live (44px targets), bands reflow through the
286 density contract, and the choice
survives a restart
**AND** every visible settings row operates a real behavior
**AND** the sheet's sections fold and remember their fold state
per the kit.

### Round-1 source verification (2026-07-13)

The actual surface is `renderer/views/SettingsView.svelte`. It currently
defines a local segmented snippet (`:344-364`) and flat sections, so
round 2 adopts the shared Segmented from 299 plus kit sheet/fold anatomy.
Fold memory has no specified durable tier and the wave forbids new
persistence; proposed contract is renderer-session memory (survives
closing/reopening Settings in the process, resets on restart).

| Placeholder | Source truth | Round-2 ruling |
| --- | --- | --- |
| Grid | row is explicitly deferred (`SettingsView.svelte:391-396`); host always draws its adaptive grid when eligible (`renderer/canvas/host.ts:1325-1414`) with no setting seam | leaves |
| Snap to grid | row is explicitly deferred (`SettingsView.svelte:515-520`); board gestures install shipped snapping unconditionally | leaves |
| Border | frameless-window placeholder only (`SettingsView.svelte:749-754`) | leaves |
| Rounded corners | frameless-window placeholder only (`SettingsView.svelte:756-761`) | leaves |

`menuPlacement` is confirmed dead: it is typed/defaulted/sanitized in
`renderer/settings/settings.ts:18-22,31-57,70-99`, while the visible row
admits that no consumer exists (`SettingsView.svelte:763-781`). Removing
that known property is safe because `sanitize` constructs defaults and
copies only recognized keys, so an old JSON key is ignored without error.
This is a codec cleanup, not a schema migration.

Density has a partial live seam, not a setting. `data-density` already
changes reservation geometry and is observed without reload
(`renderer/chrome/reservation.ts:44-63,93-119`), and comfortable tokens
already exist (`renderer/theme.css:304-306`), but `AppSettings` carries no
density. Round-1 ruling: the app-tier codec is exactly
`'compact' | 'comfortable'`; persist the selected token and apply the root
attribute as a settings side effect. `auto` is deferred until a real
modality detector exists—shipping an indistinguishable alias would be a
quiet lie.

The guard claims are stale here too: both relevant allowlists are already
empty (`ui/input-styling-guard.test.ts:16-21` and
`ui/no-native-inputs.test.ts:6-10`). Round 2 preserves the absolute guards;
there is no Settings exception to remove.

### Issues Encountered

- The acceptance text said comfortable made both rows and bands
  "grow," but AI-IMP-286's ratified comfortable value sets the strip
  reservation to `0`. The implementation preserves that existing
  contract through `setReservationDensity`: row/control targets grow
  to 44px while anchored/takeover geometry reflows live. No parallel
  reservation semantics were invented.
- The four-row round-1 table was not the whole inert inventory.
  `Obsidian vault beside the project` and `Mirror drops to library`
  were also non-interactive `deferredRow` instances. The accepted
  ruling said all placeholder rows leave and every visible row must
  operate, so both left with Grid/Snap/Border/Rounded/menu placement.
- The first focused e2e run was 3/4 because the Keyboard section's
  new fold button correctly made the old whole-section "zero
  controls" assertion false. The product surface was sound; the pin
  was narrowed to the read-only section body and the rerun passed
  4/4. Focused final evidence: desktop build green; 33 settings/UI
  units; 8/8 settings, reservation-frame, and shared-input e2e.
- Full `CI=true pnpm check` passed: shared-ui 1, commands 19, domain
  60, protocol 1, canvas-engine 410, persistence 659, desktop unit
  570, hidden-window e2e 274/274 in 6.1m; ESLint and spike typecheck
  green. The isolated-clone `git main` diagnostic remained harmless
  and the known Svelte warning baseline was unchanged.
