---
node_id: AI-IMP-289
tags:
  - IMP-LIST
  - Implementation
  - dock
  - chrome
  - design-adoption
kanban_status: completed
depends_on: [AI-IMP-286, AI-IMP-288]
parent_epic: [[AI-EPIC-029-the-kit-adoption-push]]
confidence_score: 0.75
date_created: 2026-07-12
date_completed: 2026-07-12
---

# AI-IMP-289-dock-rebuild

## Summary of Issue #1

The dock is the app's most kit-divorced surface (SURFACE-REVIEW #1:
SEVERE on all three axes): 11 native controls, 25 selection buttons
plus 3 frame buttons wrapping to 78vw, dead text-tool controls, and
4px inputs. The proposed sort-on-drop diagnosis was false: the
surviving frame charm already owns the live settings subscription;
the stale Dock row retires with the contextual rows. The kit's ruling (letter 2):
the dock stays PURE — toolbelt only — plus ONE kit-drawn defaults
row above it while a tool is armed (what the NEXT thing gets); the
stacking contextual rows retire entirely (selection restyle moves
to the charm bar, AI-IMP-291). The eyedropper ⊙ joins beside the
dock (lead-cosigned; samples any board color as the ink). Done
means: dock = one row of tools at rest; armed tool = defaults row
(band 64→112 via the 286 token); zero natives (font `<select>` →
PickerList, colors → SwatchRow/ColorPicker, numbers → Stepper);
stale-toggle bug fixed; dead controls gone.

### Out of Scope

- The shape flyout and shape-set fill-out (AI-IMP-290).
- The ⌗ arrange / ◧ restyle charm panels (AI-IMP-291) — this
  ticket only DELETES the word-button rows they replace; landing
  order within the wave must keep the verbs reachable (291 lands
  before or with the row removal — brief will sequence).
- Tool-mode semantics (escape ladder, re-click disarm) — shipped
  in AI-IMP-282; unchanged.

### Design/Approach

Dock.svelte slims to the toolbelt (glyph buttons, kit geometry,
tooltips with the armed exit clause). The defaults row renders
above the dock from the armed tool's default set: text → font
(PickerList) + 0.5–3× multiplier over legibleFontSize + ink
(SwatchRow); shape → stroke/weight/fill; line-family → stroke/weight.
Defaults are session/host-local; no project persistence is invented.
Ink uses recents windows 3/6/9 per kit code plus a picker block and
eyedropper ⊙ in a Dock slot after the tools (Electron's Chromium ships
`window.EyeDropper`; sample commits to the ink). The pipette SVG is
ported inline from the kit; DESIGN-1.3-QUEUE item 1 remains the later
canonical-master swap. "Add from library" moves to the frame charm
and frame context menu in AI-IMP-291, in the same commit that removes
its Dock row. Dead text-tool
stroke/weight/fill controls are removed with their plumbing.

### Files to Touch

`apps/desktop/src/renderer/chrome/Dock.svelte`: the rebuild.
`apps/desktop/src/renderer/canvas/board-tooling.ts` /
  `text-entry.ts` / `decorations-ui.ts`: tool-default reads (the
  defaults row writes tool defaults, not selection state).
`apps/desktop/src/renderer/canvas/system-fonts.ts`: PickerList
  data source.
`apps/desktop/src/renderer/chrome/Dock`-related tests + e2e specs
  that click dock controls (enumerate in round-1; the tool-mode
  e2e from 282 must stay green).
`apps/desktop/src/renderer/theme.css`: only via 286's tokens.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Round-1: verified the 11 natives, 25 selection + 3 frame
      buttons, exonerated the alleged dead subscription, dead controls,
      and the kit's defaults-row drawing (1d) + preflight F4;
      record corrections here; confirm 291's landing order keeps
      selection verbs reachable.
- [x] Toolbelt: kit geometry, tooltips, no natives, no contextual
      rows at rest.
- [x] Defaults row per armed tool from kit components (288); dock
      band grows 64→112 via the 286 token; row disarms with the
      tool.
- [x] Ink row: last-3 + ColorPicker block + eyedropper ⊙ sampling
      via window.EyeDropper with a fallback disabled state (why-
      tooltip) if the API is absent.
- [x] Sort-on-drop remains fresh through the frame charm's existing
      settings subscription; pin that surviving door with a regression.
- [x] Dead text-tool controls and their plumbing removed.
- [x] Word-button contextual rows removed (sequenced with 291).
- [x] Unit + e2e updated; tool-mode (282) suite green; full local
      gate green with counts read.

### Acceptance Criteria

**Scenario:** arming the text tool.
**GIVEN** a board with the dock at rest showing only the toolbelt
**WHEN** the user arms T
**THEN** one defaults row appears above the dock (font PickerList,
size Stepper, ink SwatchRow) and the dock band reports the grown
token value
**AND** picking a font uses the kit PickerList (no `<select>` in
the DOM)
**AND** pressing esc disarms to select and the row leaves.
**Scenario:** sort-on-drop stays fresh.
**GIVEN** the charm bar toggles sort-on-drop
**WHEN** the dock's control is inspected
**THEN** it reflects the new value without a reload.

### Issues Encountered

- Round-1 sequencing correction: contextual rows remain through 289
  and 290. AI-IMP-291 installs every replacement door before removing
  all 28 contextual buttons in its own atomic commit.
- Final gate: persistence 658, canvas-engine 409, desktop 541, and
  hidden-window Playwright 268 passed; the native guard leaves only
  TitleStrip's reserved `bg-color` tuple.
- Kit 1.4 delta (2026-07-13, post-close): the eyedropper glyph
  master landed (`assets/eyedropper.svg`, DESIGN-1.3-QUEUE item 1).
  The interim inline pipette swaps to the master in the phase-C
  wave — one file, recorded here because this ticket shipped the
  interim.
