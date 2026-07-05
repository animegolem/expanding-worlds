import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import type { EwApi } from '../src/preload/index'

declare global {
  interface Window {
    ew: EwApi
  }
}

/**
 * AI-IMP-006 acceptance: renderer → preload → main → utility process
 * round-trip, sandboxed renderer, correct window title.
 * AI-IMP-007 acceptance: Svelte shell regions render and the status
 * strip shows the live ping result.
 * AI-IMP-010 acceptance: the Project API executes a real command
 * against a real project with revision, conflict, and event flow.
 */

test('shell launches and the Project API round-trips', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-project-'))
  const app = await electron.launch({
    args: ['out/main/index.cjs'],
    env: { ...process.env, EW_PROJECT_DIR: projectDir },
  })
  const win = await app.firstWindow()

  await expect(win).toHaveTitle('Expanding Worlds')

  const response = await win.evaluate(() => window.ew.project.ping())
  expect(response).toEqual({ pong: true, from: 'utility' })

  // Sandbox: no node globals leak into the page context.
  const requireType = await win.evaluate(
    () => typeof (window as unknown as Record<string, unknown>)['require'],
  )
  expect(requireType).toBe('undefined')

  // The three shell regions of the provisional layout (RFC-0001 §8.2).
  await expect(win.getByTestId('note-pane')).toBeVisible()
  await expect(win.getByTestId('workspace')).toBeVisible()
  await expect(win.getByTestId('status-strip')).toBeVisible()

  // The status strip renders the live seam result.
  await expect(win.getByTestId('status-strip')).toContainText('{"pong":true,"from":"utility"}')

  // AI-IMP-010: execute CreateNode end to end and observe revision,
  // query visibility, the pushed project-changed event, and a stale
  // -revision conflict.
  const outcome = await win.evaluate(async () => {
    const events: unknown[] = []
    window.ew.project.onChanged((event) => events.push(event))

    const projectQuery = await window.ew.project.query('getProject')
    if (!projectQuery.ok) throw new Error(`getProject failed: ${projectQuery.message}`)
    const project = projectQuery.result as { id: string; revision: number }

    const nodeId = crypto.randomUUID()
    const executed = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: project.id,
      commandType: 'CreateNode',
      commandVersion: 1,
      expectedProjectRevision: project.revision,
      issuedAt: new Date().toISOString(),
      payload: { nodeId },
    })

    const stale = await window.ew.project.execute({
      commandId: window.ew.util.newId(),
      projectId: project.id,
      commandType: 'CreateNode',
      commandVersion: 1,
      expectedProjectRevision: project.revision,
      issuedAt: new Date().toISOString(),
      payload: { nodeId: crypto.randomUUID() },
    })

    const nodesQuery = await window.ew.project.query('listNodes')
    const nodeIds = nodesQuery.ok
      ? (nodesQuery.result as Array<{ id: string }>).map((n) => n.id)
      : []

    // The event is pushed utility → main → renderer; give it a beat.
    const deadline = Date.now() + 2_000
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    return { executed, stale, nodeIds, nodeId, events }
  })

  expect(outcome.executed).toMatchObject({ status: 'committed', revision: 1 })
  expect(outcome.stale).toMatchObject({ status: 'conflict', actualRevision: 1 })
  expect(outcome.nodeIds).toContain(outcome.nodeId)
  expect(outcome.events.length).toBeGreaterThanOrEqual(1)
  expect(outcome.events[0]).toMatchObject({
    type: 'project-changed',
    revision: 1,
    commandType: 'CreateNode',
  })

  await app.close()
})
