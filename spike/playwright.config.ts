import { defineConfig } from '@playwright/test'

const port = Number(process.env.SPIKE_PORT ?? 5173)

export default defineConfig({
  testDir: './tests',
  timeout: 240_000,
  use: {
    baseURL: `http://localhost:${port}`,
    // Heap metrics need precise memory info; harness degrades without it.
    launchOptions: { args: ['--enable-precise-memory-info'] },
  },
  webServer: {
    command: 'npm run dev',
    port,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
