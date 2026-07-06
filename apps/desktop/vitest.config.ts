import { defineConfig } from 'vitest/config'

// Renderer unit tests only — e2e/*.spec.ts belongs to Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
