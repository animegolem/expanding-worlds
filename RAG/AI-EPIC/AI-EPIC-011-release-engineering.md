---
node_id: AI-EPIC-011
tags:
  - EPIC
  - AI
  - infrastructure
  - release
date_created: 2026-07-05
date_completed: 2026-07-05
kanban_status: completed
AI_IMP_spawned:
  - AI-IMP-050
  - AI-IMP-051
  - AI-IMP-052
---

# AI-EPIC-011-release-engineering

## Problem Statement/Feature Scope

The project is exiting pre-alpha: the owner's artist friend becomes
the first outside tester soon, and validation currently lives only on
the owner's machine. There is no CI, no packaged build, and the
remote (github.com/animegolem/expanding-worlds, public) is ~23
commits stale. The project needs a pipeline so every epic close
produces a downloadable point release the tester can run.

## Proposed Solution(s)

Three tickets. CI on GitHub Actions runs the full gate suite (build,
unit, lint, e2e minus the perf benchmarks, which refuse software GL
by design) on every push to main, on Ubuntu for cost. Packaging via
electron-builder produces unsigned artifacts for the three desktop
platforms — DMG (macOS arm64, the testers' machines), NSIS exe
(Windows x64), AppImage (Linux x64; chosen over Flatpak because we
are not targeting Flathub and the check-GitHub-releases update model
wants a single self-contained file). A tag-triggered release workflow
builds all three and attaches them to a GitHub Release. Versioning:
minor = epic number (EPIC-005 done → v0.5.0 now; EPIC-006 will ship
v0.6.0), patch for hotfixes; the ritual is documented in CLAUDE.md.

## Path(s) Not Taken

Code signing / notarization (no Apple Developer account; testers
right-click-open past Gatekeeper). Auto-update (checking the GitHub
page manually is the loop for now). Flatpak/Flathub. MSI (NSIS is
the electron-builder convention; MSI is a config flag away if ever
needed). Crash reporting / telemetry.

## Success Metrics

- A push to main runs build + unit + lint + e2e (minus perf) on a
  GitHub runner and goes green.
- Pushing tag v0.5.0 produces a GitHub Release carrying a DMG, an
  NSIS exe, and an AppImage.
- The DMG installs and launches on macOS (validated locally on the
  owner's machine from the packaged artifact).

## Requirements

### Functional Requirements

- [x] FR-1: main pushed to origin; CI workflow green on GitHub Actions.
- [x] FR-2: perf suite cleanly excluded on CI, still a local gate.
- [x] FR-3: `pnpm dist` builds an unsigned DMG locally; packaged app launches with a working project.
- [x] FR-4: Tag-triggered release workflow uploads DMG + NSIS + AppImage to a GitHub Release.
- [x] FR-5: v0.5.0 released; versioning ritual documented in CLAUDE.md.

### Non-Functional Requirements

- CI wall-clock under ~15 minutes on the default runner.
- No native modules in the packaged app (node:sqlite keeps it pure).

## Implementation Breakdown

- AI-IMP-050 — push remote + CI workflow (Ubuntu, xvfb e2e, perf
  excluded via config). (FR-1, FR-2)
- AI-IMP-051 — electron-builder packaging: three targets, runtime
  deps confirmed bundle-only, local dist validation. (FR-3)
- AI-IMP-052 — tag-triggered release workflow, CLAUDE.md ritual,
  v0.5.0. (FR-4, FR-5)
