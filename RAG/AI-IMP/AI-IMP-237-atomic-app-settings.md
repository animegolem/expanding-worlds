---
node_id: AI-IMP-237
tags:
  - IMP-LIST
  - Implementation
  - main
  - settings
  - P3
kanban_status: planned
depends_on: []
parent_epic:
confidence_score: 0.85
date_created: 2026-07-09
---


# AI-IMP-237-atomic-app-settings

## Summary of Issue #1

Sol audit CA-015 (P3, lead-verified): app settings writes rewrite
`app-settings.json` in place (main/index.ts ~223-263) — a crash
or full disk mid-write leaves truncated JSON that the next launch
silently treats as EMPTY settings (theme, library designation,
first-run state, navigation scheme all reset, unexplained). The
renderer's optimistic set discards the persistence promise, so
failures neither roll back nor notify. Done means settings writes
are atomic (temp + fsync + rename), a parse failure on load is
LOUD (settings reset to defaults with a visible notice, and the
corrupt file is preserved beside as `.corrupt` for inspection),
and a failed persist surfaces to the renderer as a typed result
instead of vanishing.

### Out of Scope

- Settings schema/UI.
- Project-side settings (different store, already transactional).

### Design/Approach

Main: write `${path}.tmp-${pid}`, fsync, rename; on load-parse
failure, move the bad file to `.corrupt-<ts>`, seed defaults,
include a `recovered: true` flag the renderer turns into a §8.6
toast. Renderer: `setAppSetting` awaits the IPC result; on
failure, revert the optimistic value and toast (keep the
optimistic apply — the revert is the new part). Unit: truncated-
file load; e2e: a set → relaunch (existing harness pattern)
persists.

### Files to Touch

`apps/desktop/src/main/index.ts` (settings seam),
`renderer/settings/settings.ts`, specs + one e2e assert.

### Implementation Checklist

<CRITICAL_RULE>
Before marking an item complete on the checklist MUST **stop** and **think**. Have you validated all aspects are **implemented** and **tested**?
</CRITICAL_RULE>

- [x] Atomic write path; truncated-load recovery loud + file
      preserved.
- [x] Failed persist reverts + notifies (typed).
- [x] Gates: build, per-package units, lint, e2e in 4+ foreground
      shards.
- [ ] HUMAN-TESTING entry appended at merge by the lead.

### Acceptance Criteria

**GIVEN** a crash during a settings write
**WHEN** the app relaunches
**THEN** settings are either the old values or the new ones —
never silently empty — and any reset announces itself.

### Issues Encountered

<!--
The comments under the 'Issues Encountered' heading are the only comments you MUST not remove
This section is filled out post work as you fill out the checklists.
You SHOULD document any issues encountered and resolved during the sprint.
You MUST document any failed implementations, blockers or missing tests.
-->

- `main/index.ts` is the Electron entry (`app.whenReady()` runs at
  module top level), so it cannot be imported by a plain vitest run —
  there is no seam to unit-test the truncated-load recovery in place.
  Extracted the file-level logic (parse/corrupt-preserve, atomic
  write) into a new electron-free `apps/desktop/src/main/app-settings.ts`
  (same pattern as the existing `net-guard.ts`/`snapshot.ts`
  split), with `app-settings.test.ts` covering it directly. `index.ts`
  now only owns the in-memory cache, the once-only "recovered" IPC
  flag, and cross-window broadcast — no export-handler or snapshot
  wiring touched. This is a deviation from the ticket's literal file
  list ("index.ts, renderer/settings/settings.ts, specs"); flagging it
  since it's a new file, not just new specs.
- `app-settings:set`'s IPC result type changed from `Promise<boolean>`
  to `Promise<{ ok: boolean; message?: string }>`, so the preload
  bridge (`setApp`) changed too, per the ticket's "preload settings
  channel if the result type changes" allowance. Checked every other
  `window.ew.settings.setApp` caller (first-run.ts, GalleryView.svelte)
  — none inspect the resolved value as a boolean, only await for
  sequencing, so the type change is source-compatible for them.
- Also added `apps/desktop/src/renderer/settings/settings.test.ts`
  (new file, same directory as the ticket's editable
  `renderer/settings/settings.ts`) covering the revert-on-failure and
  recovered-toast paths, plus a test-only `__resetSettingsForTests`
  export (mirrors `chrome/status.ts`'s existing
  `__resetStatusForTests`).
- `app-settings:get` surfaces `recovered: true` as a one-shot flag,
  consumed on the read that discovers it — a second window or a later
  re-fetch after boot sees a normal result. This matches "a transient
  toast, not an ongoing §8.6 perch," but means a recovery is only ever
  announced to whichever window's `initSettings()` happens to win the
  race for the first `app-settings:get` call (there is normally only
  one window at cold boot, so this is not observable in practice).
- e2e: extended the existing "corrupt app-settings file falls back to
  defaults" spec (now also asserts the `app-settings-recovered` toast
  text, that the bad file survives as `app-settings.json.corrupt-<ts>`
  rather than vanishing, that no `.tmp-*` file is ever left behind,
  and that a setting written after recovery persists through a
  relaunch and does NOT re-announce recovery on the clean second
  boot) rather than adding a wholly separate spec — it was already the
  natural home for this behavior and duplicating the launch felt like
  ticket-padding.
- Pre-existing, unrelated e2e flake found during validation (shard
  `e2e/[a-d]*`, run twice independently, same failure both times):
  `decorations.spec.ts:25` — the text-family picker's system-font
  enumeration polls for `> 3` `<option>`s and times out at exactly 3
  in this sandbox. Nothing here touches decorations, fonts, or that
  spec; not fixed, not in scope (`views/**`/decorations are MUST NOT
  TOUCH regardless). `frames.spec.ts:287` (shard `e2e/[e-i]*`) also
  flaked once on a hover-dim alpha timing assertion and passed clean
  on Playwright's automatic retry — likely a rendering-timing flake,
  also unrelated to this ticket's surface.
