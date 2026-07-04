import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  use: {
    baseURL: 'http://localhost:5173',
    // Heap metrics need precise memory info; harness degrades without it.
    launchOptions: { args: ['--enable-precise-memory-info'] },
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
