---
node_id: 2026-07-05-LOG-AI-release-engineering
tags:
  - AI-log
  - development-summary
  - infrastructure
  - release
closed_tickets:
  - AI-IMP-050
  - AI-IMP-051
  - AI-IMP-052
  - AI-EPIC-011
created_date: 2026-07-05
related_files:
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - apps/desktop/electron-builder.yml
  - apps/desktop/package.json
  - apps/desktop/playwright.config.ts
  - apps/desktop/e2e/board-tooling.spec.ts
  - apps/desktop/e2e/slice.spec.ts
  - apps/desktop/e2e/notes.spec.ts
  - packages/persistence/src/queries.ts
  - CLAUDE.md
confidence_score: 0.9
---

# 2026-07-05-LOG-AI-release-engineering

## Work Completed

AI-EPIC-011 activated and closed the same day: the owner called the
pre-alpha exit, so the project gained CI, packaging, and per-epic
point releases. The stale public remote
(github.com/animegolem/expanding-worlds) received the full local
history (~30 commits). CI now runs build + unit + lint + the desktop
e2e suite (31 tests, perf excluded) under xvfb on every push, green.
electron-builder packages out/** alone (node:sqlite = zero native
modules; all runtime deps bundle at build time and moved to
devDependencies, so pnpm workspace symlinks never reach the
packager). Unsigned targets: DMG (arm64), NSIS exe (x64), AppImage
(x64) — AppImage over Flatpak per owner decision (no Flathub
ambitions; manual check-releases update loop). A tag-push workflow
builds the three-OS matrix and attaches assets via gh; versioning is
minor = epic number, documented in CLAUDE.md. **v0.5.0 is live with
all three artifacts.** The packaged mac app passed an automated
Playwright smoke (boot, commands, import pipeline, decoration,
relaunch persistence).

## Session Commits

Ticket cut (382997d); CI e2e enablement (92eb9ec); five CI
iterations on the Electron binary and runner speed (55c22f6,
0435ad0, 356fa99, b7ee9d9, 8ec56fd, 238a93d, 8c4c6ab); latent test
fixes — settle attempt (12c9c59, superseded), redo key (f188fd2),
command-log assertions + listCommandLog query (f140e20, ab8f115);
packaging + release workflow + CLAUDE.md ritual (a88050d); Linux
executableName fix (a63a25f); v0.5.0 tag (recreated once, safe —
no release existed yet).

## Issues Encountered

CI needed eight iterations, all documented in AI-IMP-050's ticket.
Highlights: (1) Electron's postinstall on the runner cached a
truncated zip that @electron/get then cache-hit forever while
install.js "extracted" one file and exited 0 — CI purges the cache,
uses install.js only to fetch, and unzips itself. (2) The xvfb
runner is ~10x slower; CI scales test/expect timeouts and retries.
(3) The runner exposed latent test bugs the fast local machine
masked: exact revision-delta assertions race the debounced
SetCanvasCamera persist (unwinnable on slow machines — a settling
approach was tried first and was wrong), replaced by a new
listCommandLog(sinceRevision) read model asserting counts of
non-camera commands; and the notes-spec redo shortcut was mac-only
(CM binds Ctrl+y off-mac). The AppImage leg failed once on
executableName derived from "@ew/desktop". Windows/Linux artifacts
are BUILT BUT UNTESTED — flag when handing out links. The repo is
public, so release downloads need no account.

## Tests Added

listCommandLog unit test (persistence, 351 total). The e2e suite
gained no new tests but three specs became timing-immune
(command-log assertions), and the whole suite now also runs on CI —
effectively doubling the environments every future regression must
survive.

## Next Steps

EPIC-006 (navigation & discovery) remains the queued next product
phase — see the EPIC-005 log for its hand-off notes. Release ritual
from here: close epic → bump apps/desktop version → tag → push tag.
The owner plans to link the artist friend (he/him, arriving on the
M1) after EPIC-006 lands as v0.6.0; the DMG in dist-artifacts/ and
the v0.5.0 release are ready for the owner's own visual pass now
(default Electron icon until the artist's icon lands). Watch CI
wall-clock (~14 min) as the suite grows; consider sharding if it
passes ~20.
