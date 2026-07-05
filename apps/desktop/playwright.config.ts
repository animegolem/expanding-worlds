import { defineConfig } from '@playwright/test'

// Every spec spreads process.env into electron.launch, so this one
// flag makes ALL test windows invisible (main honors it with
// show:false + dock hide + backgroundThrottling off). A full suite
// launches ~19 apps; visible windows steal focus once a second and
// thrash Stage Manager — unusable machine, motion nausea (owner
// feedback). Set EW_TEST_HIDDEN_WINDOWS=0 to watch a run.
if (process.env['EW_TEST_HIDDEN_WINDOWS'] === undefined) {
  process.env['EW_TEST_HIDDEN_WINDOWS'] = '1'
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  // §12.1 perf numbers off software GL are noise, and the suite
  // THROWS on SwiftShader/llvmpipe by design (EPIC-001 lesson). CI
  // runners have no GPU, so perf stays a local hardware gate.
  ...(process.env['CI'] ? { testIgnore: ['**/perf.spec.ts'] } : {}),
  // Full-suite runs launch ~19 sequential Electron apps; under that
  // load, debounced UI re-renders (BoardToolbar's 120ms refresh) can
  // swallow a click and slow launches outrun expect.poll windows.
  // One retry absorbs machine-load noise; real regressions fail twice.
  retries: 1,
})
