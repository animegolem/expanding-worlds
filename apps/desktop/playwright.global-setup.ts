import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Runs ONCE before any spec (wired as playwright.config globalSetup), so a
// fresh worktree self-heals the "husk electron" that pnpm+macOS leave behind
// WITHOUT changing how `npx playwright test <spec>` is invoked. See
// scripts/repair-electron.sh for the five landmines it defends. A healthy
// tree pays <1s; the repair path only runs on a broken tree.
//
// macOS only: the husk bug is macOS+pnpm specific, so on Linux/Windows (incl.
// CI runners) we skip the script entirely rather than let it fail and abort
// the run — electron installs normally there.
export default function globalSetup(): void {
  if (process.platform !== 'darwin') return

  const here = dirname(fileURLToPath(import.meta.url))
  const script = resolve(here, '../../scripts/repair-electron.sh')
  execFileSync('bash', [script], { stdio: 'inherit' })
}
