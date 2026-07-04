import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/out/**',
      'spike/**',
      'RAG/**',
      'archive/**',
      '.claude/**',
      '**/*.svelte',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // RFC-0001 §11.1: the renderer never touches persistence or SQL.
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@ew/persistence', '@ew/persistence/*'], message: 'Renderer code must go through the Project API (RFC-0001 §11.1), never persistence.' },
            { group: ['better-sqlite3', 'node:sqlite', 'sqlite*'], message: 'No SQL in the renderer (RFC-0001 §11.1).' },
          ],
        },
      ],
    },
  },
)
