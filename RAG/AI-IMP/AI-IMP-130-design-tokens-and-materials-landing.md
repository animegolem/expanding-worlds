---
node_id: AI-IMP-130
tags:
  - IMP-LIST
  - Implementation
  - design-pass
  - tokens
  - theme
kanban_status: planned
depends_on:
parent_epic:
confidence_score: 0.85
date_created: 2026-07-07
date_completed:
---


# AI-IMP-130-design-tokens-and-materials-landing

## Summary of Issue #1

Rev 0.55 ratified the design pass; its token additions exist only
in the kit (Design System 1.0, STYLE-GUIDE ■ TECH blocks). Nothing
consumes them yet — this ticket lands the definitions so every
downstream visual ticket (icons 132, paper 134, sweep 141) builds
on real tokens. The 2026-07-07 audit verified the kit's theme.css
is byte-identical to shipped plus additions, so this is additive.
Done means: the new tokens exist in `theme.css`, the beat/z
constants exist as TS, the void derivation matches the designed
value, and all guards stay green.

### Out of Scope

- WIRING any consumer (each visual ticket wires its own).
- The z-ladder refactor of existing literals (AI-IMP-143).
- Maple Mono font files (AI-IMP-131).
- The kit's oxlint adherence config (stays with the kit — audit
  verdict: redundant with our vitest guard, wrong AST for our
  cssText styling).

### Design/Approach

Per the audit: land in `theme.css` — tape/torn
(`--ew-tape-surface/border`, `--ew-paper-torn`), the six
`--ew-obj-{color}-hi/-lo/-stroke` pairs + `--ew-obj-gloss` (.42;
normalize the SVG masters' hand-tuned .35–.45 glosses to the token
at atlas-bake time, not here) + accents (pin-hole, flag-pole,
leaf-vein, pushpin-stem), note headings `--ew-note-h1/h2/h3` for
`:root` and `glass` (deliberate call recorded: light inherits
`:root` — both are light paper), `--ew-drag-shadow`, and the
void-grid alpha. Beats land as TS constants beside feel.ts
(`EW_BEAT_TEAR_MS 300`, `EW_BEAT_BLOOM_MS ~240`,
`EW_BEAT_STAGE_EDGE_MS ~180`; cover beat stays a musing) — timing
consumed by imperative code, not CSS. Z-ladder constants
(`Z = { world:0 … tooltip:800 }`) export from a small module for
143 to consume; no existing literal changes here. **Void
reconciliation (owner call, rev 0.55):** `STAGE_VOID_MIX` moves
from 0.55-toward-black sRGB to the designed ~22%-toward-black in
oklab — implement the oklab mix in `stage-extent.ts`'s `voidTone`
(or approximate within 1 ΔE and note it), update its units, and
disable the void entirely on the glass theme (read the effective
theme; §6.7). Kit `chrome.css` presentation tokens that duplicate
shipped TS constants are NOT landed (single source of truth stays
TS); the handful of genuinely-CSS tokens fold INTO theme.css so
the raw-color guard's allowlist stays exactly one file.

### Files to Touch

`apps/desktop/src/renderer/theme.css`: all color/material tokens.
`apps/desktop/src/renderer/chrome/feel.ts` (or sibling
`beats.ts`): beat constants.
`apps/desktop/src/renderer/z.ts` (new): the named ladder export.
`packages/canvas-engine/src/stage-extent.ts` (+ test): void mix →
oklab 0.22; glass-off seam surfaced to the host.
`apps/desktop/src/renderer/canvas/host.ts`: pass the glass-theme
fact to the stage drawing if not already readable.
`apps/desktop/src/renderer/theme.test.ts`: new tokens covered by
the defined-token guard.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] theme.css additions land for :root/light/glass as designed;
      raw-hex guard + undefined-token guard green.
- [ ] Beat constants (TS) + Z module land, unconsumed but
      exported; unit asserts the ladder's §8.8 order.
- [ ] voidTone: oklab ~0.22 mix, unit-proven against 2–3 reference
      colors; void off on glass (e2e or unit at the host seam).
- [ ] Gates: `pnpm -r build`, `pnpm -r test`, `pnpm lint`, desktop
      e2e hidden.
- [ ] HUMAN-TESTING entry appended at merge by the lead (the new
      void subtlety on real art, both themes).

### Acceptance Criteria

**GIVEN** the merged branch
**THEN** every ■ TECH color token from STYLE-GUIDE §2/§5 resolves
in all three themes and the guards pass.
**GIVEN** a board with content on the dark theme
**THEN** the void renders at the designed ~22% oklab step
**AND** on glass no void renders at all.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
