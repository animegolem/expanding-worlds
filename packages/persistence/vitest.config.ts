import { defineConfig } from 'vitest/config'

// Windows CI runners are slow, shared, and AV-scanned: integration
// tests doing real filesystem+SQLite IO legitimately run 3-8x their
// local times under load (AI-IMP-249 rounds 4/6 — arbitrary tests
// exceeded the 5s default while passing in ~1s locally). The raised
// ceiling applies on CI only, so local development keeps the honest
// tight default that catches real hangs fast.
export default defineConfig({
  test: {
    testTimeout: process.env['CI'] ? 30_000 : 5_000,
    // beforeEach hooks doing the same real IO (fixture project
    // creation) hit vitest's SEPARATE 10s hook default on the same
    // slow runners — two Windows-only hook timeouts in run
    // 29094024841 (surfaced by AI-IMP-263's review; invariants.spec
    // and queries-structure). Same policy, same reasoning as above.
    hookTimeout: process.env['CI'] ? 30_000 : 10_000,
  },
})
