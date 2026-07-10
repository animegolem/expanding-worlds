import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertManagedPath,
  assertManagedProjectLayout,
  UnsafeManagedPathError,
} from './path-safety'

describe('managed project path safety', () => {
  let parent: string
  let project: string
  let outside: string

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'ew-path-safety-'))
    project = join(parent, 'project')
    outside = join(parent, 'outside')
    mkdirSync(project)
    mkdirSync(outside)
  })

  afterEach(() => rmSync(parent, { recursive: true, force: true }))

  it('accepts a missing descendant after checking its existing ancestors', () => {
    mkdirSync(join(project, 'notes'))
    expect(assertManagedPath(project, join(project, 'notes', 'New.md'))).toBe(
      join(project, 'notes', 'New.md'),
    )
  })

  it('rejects a managed directory redirected outside the project', () => {
    symlinkSync(outside, join(project, 'notes'), 'junction')
    expect(() => assertManagedProjectLayout(project)).toThrow(UnsafeManagedPathError)
  })

  it('rejects a symlink nested below a real managed root', () => {
    mkdirSync(join(project, 'assets'))
    symlinkSync(outside, join(project, 'assets', 'aa'), 'junction')
    expect(() => assertManagedProjectLayout(project)).toThrow(/symbolic links are not allowed/)
  })

  it.runIf(process.platform !== 'win32')('rejects a managed file symlink', () => {
    writeFileSync(join(outside, 'body.md'), 'external')
    mkdirSync(join(project, 'notes'))
    symlinkSync(join(outside, 'body.md'), join(project, 'notes', 'Body.md'))
    expect(() => assertManagedPath(project, join(project, 'notes', 'Body.md'))).toThrow(
      UnsafeManagedPathError,
    )
  })

  it('rejects lexical traversal before touching the filesystem', () => {
    expect(() => assertManagedPath(project, join(project, '..', 'outside', 'x'))).toThrow(
      /outside the project root/,
    )
  })
})
