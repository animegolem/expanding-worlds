import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * Shared e2e plumbing (AI-IMP-057): specs used to hand-roll the
 * command envelope and project lookup inline in every win.evaluate —
 * copy-paste drift bait. `exec` builds the envelope once, correctly.
 */

export async function launchApp(
  prefix: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; win: Page; projectDir: string }> {
  return launchAppInDir(mkdtempSync(join(tmpdir(), prefix)), extraEnv)
}

/** Relaunch flavor: reuse an existing project directory. */
export async function launchAppInDir(
  projectDir: string,
  extraEnv: Record<string, string> = {},
): Promise<{ app: ElectronApplication; win: Page; projectDir: string }> {
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir, ...extraEnv },
  })
  const win = await app.firstWindow()
  await expect(win.getByTestId('canvas-host')).toBeVisible()
  await win.waitForFunction(() => window.__ewDebug !== undefined)
  return { app, win, projectDir }
}

/** Execute one command; throws on any non-committed outcome. */
export async function exec(win: Page, commandType: string, payload: unknown): Promise<void> {
  const status = await win.evaluate(
    async (input: { commandType: string; payload: unknown }) => {
      const project = await window.ew.project.query('getProject')
      if (!project.ok) throw new Error(project.message)
      const result = await window.ew.project.execute({
        commandId: window.ew.util.newId(),
        projectId: (project.result as { id: string }).id,
        commandType: input.commandType,
        commandVersion: 1,
        issuedAt: new Date().toISOString(),
        payload: input.payload,
      })
      return result.status === 'error'
        ? `${result.status}: ${result.code} ${result.message}`
        : result.status
    },
    { commandType, payload },
  )
  if (status !== 'committed') throw new Error(`${commandType}: ${status}`)
}

export async function runQuery<T>(win: Page, name: string, args?: unknown): Promise<T> {
  return win.evaluate(
    async (q: { name: string; args?: unknown }) => {
      const response = await window.ew.project.query(q.name, q.args)
      if (!response.ok) throw new Error(`${q.name} failed: ${response.message}`)
      return response.result
    },
    { name, args },
  ) as Promise<T>
}

export async function revision(win: Page): Promise<number> {
  const project = await runQuery<{ revision: number }>(win, 'getProject')
  return project.revision
}

/** Note + dot node + placement (attach), ids generated here. */
export async function seedPlacedNote(
  win: Page,
  title: string,
  body: string,
  at: { x: number; y: number },
): Promise<{ noteId: string; nodeId: string }> {
  const noteId = crypto.randomUUID()
  const nodeId = crypto.randomUUID()
  const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  await exec(win, 'CreateNote', { noteId, title, body })
  await exec(win, 'CreatePin', {
    nodeId,
    canvasId,
    placementId: crypto.randomUUID(),
    x: at.x,
    y: at.y,
    appearance: { kind: 'dot', color: '#ff7700' },
    note: { kind: 'attach', noteId },
  })
  return { noteId, nodeId }
}
