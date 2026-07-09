import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// AI-IMP-217: dedicated spike port. Documented in the report; picked so
// it never collides with dev (5173), the other spike (SPIKE_PORT), or
// preview (4173). Override with SPIKE_PORT if 5199 is taken.
const port = Number(process.env.SPIKE_PORT ?? 5199)

// The harness imports the BUILT engine dist (run `pnpm -r build` at the
// repo root first). We alias the workspace specifier to the compiled
// entry so vite resolves it without pulling in the pnpm workspace — the
// spike stays a standalone npm project (its own node_modules carries
// pixi.js, which the dist imports at runtime). `@ew/commands` is
// type-only in the engine dist, so no alias is needed for it.
const engineDist = fileURLToPath(
  new URL('../../packages/canvas-engine/dist/index.js', import.meta.url),
)
// SEAM (AI-IMP-217): the engine dist imports `pixi.js` as a bare
// specifier and resolves it relative to its own location (the repo's
// pnpm-hoisted copy), while the harness resolves `pixi.js` from its own
// node_modules. Two module instances → two `Container` classes → the
// Pixi event system's `isInteractive` mixin lands on only one prototype
// and hit-testing throws. Forcing a single pixi instance is mandatory
// for any bundler-based consumer of the engine (Tauri port note).
const pixiEntry = fileURLToPath(new URL('./node_modules/pixi.js/lib/index.mjs', import.meta.url))

export default defineConfig({
  build: { target: 'es2022' },
  server: { host: true, port, strictPort: true },
  preview: { host: true, port, strictPort: true },
  resolve: {
    dedupe: ['pixi.js'],
    alias: {
      '@ew/canvas-engine': engineDist,
      'pixi.js': pixiEntry,
    },
  },
})
