import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

/**
 * Main, preload, and the utility-process entry build as CJS: sandboxed
 * preloads must be CommonJS, and keeping all three uniform avoids
 * split-format loader trouble. The renderer stays browser ESM.
 */
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Overriding rollupOptions drops electron-vite's default
        // externals, so list them ourselves: the electron shim and
        // every node: builtin (the utility bundle uses node:sqlite).
        external: ['electron', /^node:/],
        input: {
          index: 'src/main/index.ts',
          utility: 'src/utility/index.ts',
        },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron', /^node:/],
        input: { index: 'src/preload/index.ts' },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [svelte({ compilerOptions: { runes: true } })],
  },
})
