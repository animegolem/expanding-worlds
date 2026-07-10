import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// AI-IMP-240 dedicated spike port (distinct from 217's 5199, dev 5173).
// Override with SPIKE_PORT. Tauri's devUrl in tauri.conf.json must match.
const port = Number(process.env.SPIKE_PORT ?? 5200)

// The harness imports the BUILT engine dist (run `pnpm -r build` at the
// repo root first). Alias the workspace specifier to the compiled entry.
const engineDist = fileURLToPath(
  new URL('../../packages/canvas-engine/dist/index.js', import.meta.url),
)
// SEAM (carried from AI-IMP-217): the engine dist imports `pixi.js` as a
// bare specifier and resolves it relative to its own location, while this
// app resolves `pixi.js` from its own node_modules. Two module instances
// → two `Container` classes → Pixi's event mixin lands on one prototype
// and hit-testing throws, silently freezing the canvas. Forcing ONE pixi
// instance (alias + dedupe) is mandatory for any bundler-based consumer.
const pixiEntry = fileURLToPath(new URL('./node_modules/pixi.js/lib/index.mjs', import.meta.url))

export default defineConfig({
  // Tauri: keep vite output clean and the dev port fixed.
  clearScreen: false,
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
