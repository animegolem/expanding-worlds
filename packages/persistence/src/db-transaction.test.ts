import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Db } from './db'

describe('Db.transaction failure cleanup', () => {
  let db: Db

  beforeEach(() => {
    db = Db.open(':memory:')
  })

  afterEach(() => db.close())

  it('rolls back a deferred outer COMMIT failure and remains reusable', () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        parent_id INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED
      );
    `)

    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO child (parent_id) VALUES (99)')
      }),
    ).toThrow(/FOREIGN KEY constraint failed/)

    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO parent (id) VALUES (99)')
        db.run('INSERT INTO child (parent_id) VALUES (99)')
      }),
    ).not.toThrow()
    expect(db.get<{ n: number }>('SELECT count(*) AS n FROM child')?.n).toBe(1)
  })

  it('restores the outer depth after a caught nested rollback', () => {
    db.exec('CREATE TABLE item (id INTEGER PRIMARY KEY)')

    db.transaction(() => {
      db.run('INSERT INTO item (id) VALUES (1)')
      try {
        db.transaction(() => {
          db.run('INSERT INTO item (id) VALUES (2)')
          throw new Error('refuse inner')
        })
      } catch {
        // The outer transaction remains usable after savepoint rollback.
      }
      db.run('INSERT INTO item (id) VALUES (3)')
    })

    expect(db.all<{ id: number }>('SELECT id FROM item ORDER BY id')).toEqual([
      { id: 1 },
      { id: 3 },
    ])
  })
})
