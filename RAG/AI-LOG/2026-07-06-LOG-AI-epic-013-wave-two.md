---
node_id: 2026-07-06-LOG-AI-epic-013-wave-two
tags:
  - AI-log
  - development-summary
  - settings
  - tags
  - search
  - process
closed_tickets:
  - AI-IMP-070
  - AI-IMP-071
  - AI-IMP-073
  - AI-IMP-074
created_date: 2026-07-06
related_files:
  - RAG/AI-EPIC/AI-EPIC-013-global-views.md
  - apps/desktop/src/renderer/settings/settings.ts
  - apps/desktop/src/renderer/views/SettingsView.svelte
  - apps/desktop/e2e/settings.spec.ts
confidence_score: 0.9
---

# 2026-07-06-LOG-AI-epic-013-wave-two

## Work Completed

EPIC-013 wave two closed the epic's remaining four tickets — all
ten FRs now delivered. Agent-built in parallel worktrees: **070
placement flows** (outline rows are the §6.10 placement source —
row actions close the takeover first, HTML5 drag rides the existing
NODE/NOTE drag MIME branches in import-surfaces; the interim
PlacementSourcePanel and its Sources button retired, e2e migrated),
**071 tag panel** (§4.8 — getTagView gains batched per-carrier
placements with canvas labels; single-instance panel store; fly-to
via requestCenterPlacements; the 072 lens toggle wired live through
the host seam, closing its two riding checklist items; layered
capture-Escape so lens peels before the panel closes; doors from
charm tag chips and NotePanel chips), and **073 search/quick-open**
(⌕ goes live; Mod+P registered capture-phase with a takeoverActive
guard so it works from CodeMirror focus; four kind-grouped
searchProject results under one flat cursor; `#` flips to tag mode
as the third §4.8 door; canvas-text centers through the existing
onCenterPlacements seam). Lead-built: **074 settings takeover** —
two-tier storage by blast radius (project tier = the migration-0001
settings table via a NEW non-undoable `set-setting` service verb;
app tier = main-owned app-settings.json in EW_APP_CONFIG_DIR ??
userData, broadcast on change), a unified typed renderer store, and
the full §11.5 inventory as a commit-on-click translucent sheet:
theme, charm corner, fade delay (incl. never), title strip
hover/always/never, window opacity (real BrowserWindow.setOpacity,
clamped ≥0.3), flat canvas color (six theme tokens + stage fallback
repaint), trash retention (keeps its undoable SetTrashRetention
command as the single writer), deferred rows honestly disabled.

Process changes this session: **epic close now ships as a PR** —
wave two pushed as `epic-013-wave-two`, PR #1 open; the owner
configures Codex's GitHub PR review; the lead polls for the review,
triages, merges with a MERGE COMMIT (never squash — per-ticket
history is load-bearing), and only then flips the epic to
completed. From EPIC-014 on, cut an explicit `epic-NNN` branch at
epic start. A pre-PR Codex review already paid for itself: P2 —
DeletePlacement/DeleteContent undo restored placements unlocked
(RestorePlacement inverse predated migration 0004); fixed with a
pinning unit. Owner tooling: the idle bell gained model triage
(gemma3:1b via ollama classifies the last assistant message
YES/NO, verdict-cached, fail-open) plus an ~30 s first ring and a
busy-guard on transcript mtime change, after two live missed-ping
reports.

## Session Commits

b86abd8 (074 WIP: both storage tiers) → 907441c/d920416/7c7305a
(071 agent branch, merge, close — 60 e2e) → d0af68e (074 charm
corner + flat color) → ab35232 (locked-flag review fix) → 882006b
(Design-Artifacts v1.0 zip) → ca33718/02954dc/1aa8771/af5c443 (073
agent branch, merge, ⌕-mode-switch follow-up, close — 64 e2e) →
f7d492c/1dfcf51/62243fd (070 agent branch, merge, close — 65 e2e)
→ ae08e53 (074 close: title-strip consumer + e2e app-config
isolation) → 4c3ea58 (epic FRs checked; stays in-progress pending
PR review). Final gates: 65 desktop e2e, 389 persistence units, 11
desktop units, lint, `pnpm -r build`.

## Issues Encountered

**074's storage assumptions were stale**: migration 0001 already
ships the settings table and trash retention was already an
UNDOABLE command (AI-IMP-013). Reconciled as one-write-grammar-
per-key — retention keeps its command, only new preference keys use
the non-undoable verb; no migration 0006. **No purge-by-retention
exists anywhere** (pre-existing §9 gap) — 074's "respected by
purge" clause left honestly unchecked; the enforcement unit belongs
to whichever ticket builds retention GC. **e2e isolation gap**:
every test instance shared Electron's default userData for
app-settings.json; helpers.ts now defaults EW_APP_CONFIG_DIR to a
fresh temp dir per launch. **Title-strip assertions must run with
the takeover closed** — ChromeLayer unmounts TitleStrip under any
takeover (068). **Drag-out closes the takeover at the originating
row's bounds**, not the sheet edge (full-bleed sheet makes the
literal edge unreachable) — accepted deviation, documented in 070.
**Worktree dist copy trap** (070 agent): `cp -R main/dist wt/dist`
nests dist/dist when the destination partially exists — future
briefs must check for `dist/Electron.app/Contents/MacOS/Electron`.
**`git push -u origin main:branch` retargets main's upstream** —
restored with `git branch --set-upstream-to=origin/main main`.

## Tests Added

settings.spec (3: commit-on-click + live apply + two-tier relaunch
persistence with real BrowserWindow opacity; live charm-corner
flip; corrupt app-config fallback), tags.spec, search.spec (+ ⌕
mode-switch assertion), 4 persistence settings units (no
command_log row, no revision bump, roundtrip, validation), the
locked-flag pinning unit (place→lock→delete→undo→locked=1), and
getNodeLocations units. outline/import/slice specs migrated off the
retired Sources panel — coverage moved, not weakened.

## Next Steps

**PR #1 is the gate**: when the Codex GitHub review lands, triage
findings (fix on branch / cut ticket / reject with a reasoned
reply), merge with a merge commit, pull local main, THEN flip
AI-EPIC-013 to completed and regenerate the index. If Codex hits
its rate limit, ping the owner (he can reset it). Backlog carried
forward: purge-by-retention enforcement (074/§9), EPIC-007 undo UI,
session snapshots + end-session surface (rev 0.24), crop editor,
owner eyeball on light-theme legibility over art, v0.6.0 release
workflow re-verification, unifying the two zero-node-note dot
tokens (070 review flag). EPIC-014 (library/gallery) should distill
the artist tester's 2026-07-05/06 feedback: Allusion import script
(nested → flat booru tags), booru-link drop grabbing clip + tags,
global gallery with per-world-or-library tags, "import tags on
place" setting, advanced search as user-composed views, monthly
archive/date-bucket grouping over infinite scroll, text posts in
the gallery.
