import { lstatSync, readdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const MANAGED_ROOT_ENTRIES = [
  'project.sqlite',
  'project.sqlite-wal',
  'project.sqlite-shm',
  '.gitignore',
  'notes',
  'assets',
  'cache',
  'derivatives',
] as const

export class UnsafeManagedPathError extends Error {
  readonly code = 'EW_UNSAFE_MANAGED_PATH'

  constructor(readonly path: string, reason: string) {
    super(`unsafe managed project path ${path}: ${reason}`)
    this.name = 'UnsafeManagedPathError'
  }
}

/**
 * Validate one project-managed path without following symlinks. Missing
 * descendants are allowed after every existing ancestor has been checked,
 * which makes the helper usable immediately before a create as well as a
 * read/delete. Returns the normalized absolute target.
 */
export function assertManagedPath(projectDir: string, target: string): string {
  const root = resolve(projectDir)
  const absolute = resolve(target)
  const rel = relative(root, absolute)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new UnsafeManagedPathError(absolute, 'outside the project root')
  }

  const parts = rel === '' ? [] : rel.split(sep)
  let cursor = root
  assertExistingComponent(cursor)
  for (const part of parts) {
    cursor = join(cursor, part)
    if (!assertExistingComponent(cursor, true)) break
  }
  return absolute
}

/** Validate every existing descendant without traversing a symlink. */
export function assertManagedTree(projectDir: string, target: string): void {
  const absolute = assertManagedPath(projectDir, target)
  let stat
  try {
    stat = lstatSync(absolute)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (!stat.isDirectory()) return
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(absolute, entry.name)
    if (entry.isSymbolicLink()) {
      throw new UnsafeManagedPathError(child, 'symbolic links are not allowed')
    }
    if (entry.isDirectory()) assertManagedTree(projectDir, child)
  }
}

/** Refuse an existing project before any lock, migration, or recovery IO. */
export function assertManagedProjectLayout(projectDir: string): void {
  assertManagedPath(projectDir, projectDir)
  for (const entry of MANAGED_ROOT_ENTRIES) {
    assertManagedTree(projectDir, join(projectDir, entry))
  }
}

function assertExistingComponent(path: string, missingAllowed = false): boolean {
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      throw new UnsafeManagedPathError(path, 'symbolic links are not allowed')
    }
    return true
  } catch (error) {
    if (missingAllowed && (error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
