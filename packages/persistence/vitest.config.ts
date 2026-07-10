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
  },
})
