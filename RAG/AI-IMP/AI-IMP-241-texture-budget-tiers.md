---
node_id: AI-IMP-241
tags:
  - IMP-LIST
  - Implementation
  - spike
  - performance
  - canvas
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.6
date_created: 2026-07-09
---


# AI-IMP-241-texture-budget-tiers

## Summary of Issue #1

The 217 spike's headline: 500 images = 4.7GB RESIDENT texture
memory (the TextureBudget's 512MB cap trims only the idle pool) —
the 2020 iPad has 6GB total, and a desktop board with alph's real
hoard will hit the same wall. Owner greenlit the de-risk spike:
prototype DOWNSCALE/EVICTION TIERS in the 217 harness — resident
textures degrade to capped resolutions by screen contribution
(an image rendering at 300px doesn't need its 2048px texture),
with the full-res texture re-acquired on zoom-in — and measure
the ceiling vs visual cost. Done means the harness has a tiering
mode (off / tiered), the sweep reports peak resident bytes and a
visual-integrity note for both modes at 100/300/500 images, and
the spike report states whether tiering holds 500 images under a
named budget (target: <1.5GB) with acceptable swap latency —
plus the seam list for landing it in the real engine
(TextureBudget/Culler are the homes).

### Out of Scope

- Landing tiering in packages/canvas-engine (the spike CONVICTS
  or ACQUITS the approach; a real ticket follows).
- Tile-pyramid/mipmap-file formats (runtime downscale only).
- The 195 crispness work (separate; note interactions).

### Design/Approach

In the harness (spike/webkit-renderer — coordinate: a sibling
agent COPIES from it for Tauri; you may MODIFY it, additively):
a tier ladder (e.g. full / 1024 / 512 / 256) chosen per texture
from rendered-px contribution each cull pass; downscale via
createImageBitmap(resizeQuality high) or canvas draw; evict the
higher tier when the budget demands (LRU by contribution);
re-acquire full on demand with the swap instrumented (count +
worst-case visible-lowres duration). Extend the sweep JSON:
peakResidentBytes, tierHistogram, swapCount, swapWorstMs. Run
both modes × three sizes in Chromium; report the table +
subjective visual note + engine-seam list.

### Files to Touch

`spike/webkit-renderer/**` (additive), `RAG/spike-reports/
texture-budget-tiers.md`, this ticket.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [ ] Tiering mode in the harness; ladder + eviction + re-acquire
      instrumented.
- [ ] Both modes × 100/300/500 measured in Chromium; table in the
      report.
- [ ] Verdict vs the named budget + engine-seam list.
- [ ] Repo untouched outside spike/ + report + this ticket.

### Acceptance Criteria

**GIVEN** the spike report
**THEN** we know whether runtime tiering holds a 500-image board
under ~1.5GB resident with acceptable swap behavior — and what it
costs to land in the engine.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->
