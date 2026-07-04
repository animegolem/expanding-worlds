import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index'

describe('@ew/canvas-engine stub', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@ew/canvas-engine')
  })
})
