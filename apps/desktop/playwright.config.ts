import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  // Full-suite runs launch ~19 sequential Electron apps; under that
  // load, debounced UI re-renders (BoardToolbar's 120ms refresh) can
  // swallow a click and slow launches outrun expect.poll windows.
  // One retry absorbs machine-load noise; real regressions fail twice.
  retries: 1,
})
