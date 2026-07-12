---
node_id: AI-IMP-300
tags:
  - IMP-LIST
  - Implementation
  - settings
  - design-adoption
kanban_status: planned
depends_on: [AI-IMP-286, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.8
date_created: 2026-07-12
date_completed:
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

- [ ] Round-1: verify SettingsView's current rows against the kit
      sheet; adjudicate each placeholder row (live control vs
      leaves) and record the table here; check stale-key
      tolerance.
- [ ] Sheet anatomy: folding sections, scope chips, no-save header
      copy, kit toggles/segmented/swatches; no natives.
- [ ] Density segment: switches data-density live (bands + row
      heights respond without reload), persists at app tier.
- [ ] Placeholder rows resolved per the round-1 table; no row
      presents a control that does nothing.
- [ ] menuPlacement row + stored value removed safely.
- [ ] Guard allowlist settings entries removed.
- [ ] Unit + e2e green; full local gate green with counts read.

### Acceptance Criteria

**Scenario:** density is a setting.
**GIVEN** the settings sheet open at desktop density
**WHEN** the user switches density to comfortable
**THEN** rows and bands grow live (44px targets) and the choice
survives a restart
**AND** every visible settings row operates a real behavior
**AND** the sheet's sections fold and remember their fold state
per the kit.

### Issues Encountered
