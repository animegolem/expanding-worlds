---
node_id: AI-IMP-075
tags:
  - IMP-LIST
  - Implementation
  - theming
kanban_status: planned
depends_on: []
parent_epic: [[AI-EPIC-013-global-views]]
confidence_score: 0.8
date_created: 2026-07-05
date_completed:
---

# AI-IMP-075-theme-tokens

## Summary of Issue #1

Every color in the chrome is a hardcoded hex value scattered across
Svelte components and the DOM adornment layers (charms-ui, panels,
toasts) — theming is impossible and §11.5's token requirement is
unmet. This ticket extracts the palette into CSS custom properties
on `:root` (surface, translucent surface, border, text, muted text,
accent, danger/warn, scrim — named for role, not color), sweeps
every renderer component and injected-DOM style to consume them,
and ships the three themes: dark (the current values, default),
light, and glass (macOS vibrancy window with translucent token
values; non-Mac falls back to dark). An `applyTheme(name)` export
stamps `data-theme` on the root and requests vibrancy over IPC;
074's picker consumes it. The WebGL canvas keeps its own drawing —
only the flat board clear color reads a token default. Covers
EPIC-013 FR-10. Done when: zero hardcoded chrome colors remain
outside the token sheet, all three theme values are defined, and
switching repaints live with no restart.

### Out of Scope

The settings surface and persistence (074). A theme engine — tokens
make one possible; none is built (§11.5). Re-skinning the note
editor's CM6 syntax theme beyond mapping its chrome to tokens.
In-canvas rendered colors (selection accent may read its token at
draw time if cheap, else stays).

### Design/Approach

One `theme.css` imported at the renderer entry defines tokens under
`:root` (dark defaults) and overrides under
`:root[data-theme='light']` and `:root[data-theme='glass']` (glass
uses alpha surfaces so vibrancy shows through). Mechanical sweep:
every `background: rgba(23, 25, 29, …)`, `#dde3ea`, `#2e3138`,
`#3a3e46`, accent `#4a9df0`, danger reds, warn ambers → `var(--ew-*)`
with role-appropriate mapping; injected DOM in charms-ui/pin-tool/
tooltip inherits since it lives under the same root. Scrim chips
stay scrims — tokens carry the alpha. `theme.ts` exports
`applyTheme('dark'|'light'|'glass')`: stamps data-theme, and for
glass calls a main IPC that sets BrowserWindow vibrancy +
transparency on macOS and returns whether it applied — a false
return falls back to dark (per §11.5) while remembering the user's
choice. All chrome must read over arbitrary art on every theme —
the light theme keeps chip scrims dark-on-light rather than
inverting art-adjacent surfaces naively. E2E asserts computed
styles flip with data-theme and no component still binds a raw hex
(a lint-style grep gate in the spec or a unit that scans built
CSS).

### Files to Touch

`apps/desktop/src/renderer/theme.css` + entry import: new — tokens,
three themes.
`apps/desktop/src/renderer/theme.ts`: new — applyTheme, vibrancy
handshake.
`apps/desktop/src/main/` + preload: vibrancy IPC (Mac-gated).
`apps/desktop/src/renderer/**/*.svelte`, `canvas/charms-ui.ts`,
`canvas/pin-tool.ts`, `chrome/tooltip.ts`: hex → var() sweep.
`apps/desktop/e2e/shell.spec.ts` (or theme.spec.ts): theme flip
assertions + no-raw-hex gate.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and
**think**. Have you validated all aspects are **implemented** and
**tested**?
</CRITICAL_RULE>

- [ ] theme.css: role-named tokens, dark values matching the
      current UI exactly (no visual diff on default theme).
- [ ] Full sweep: no hardcoded color remains in renderer Svelte
      styles or injected-DOM strings except inside theme.css;
      automated check (grep gate in a test) enforces it.
- [ ] Light theme: complete value set; chrome legible over dark and
      light art; toasts/perch/tooltips included.
- [ ] Glass: alpha tokens + vibrancy IPC on macOS; non-Mac or
      denied vibrancy falls back to dark values while reporting
      the fallback.
- [ ] applyTheme exported and idempotent; data-theme stamped on
      documentElement; live switch repaints without reload.
- [ ] Default experience unchanged: full e2e suite green with zero
      selector or visual-behavior diffs on dark.
- [ ] Theme flip test: computed background of a chrome surface
      changes across data-theme values; fallback path asserted
      (glass on a non-vibrancy run resolves dark).
- [ ] `pnpm -r build`, full gates green.

### Acceptance Criteria

**Scenario:** Switching themes live.
**GIVEN** the app on the default dark theme with chrome visible.
**WHEN** applyTheme('light') runs.
**THEN** rail, dock, strip, panels, toasts, and tooltips repaint
with light tokens in the same frame set, with no reload.
**WHEN** applyTheme('glass') runs on a non-macOS platform.
**THEN** the UI renders the dark fallback and reports fallback.
**AND** a source scan finds no raw hex colors outside theme.css.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
