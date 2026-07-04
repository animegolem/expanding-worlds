import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index'

describe('@ew/shared-ui stub', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@ew/shared-ui')
  })
})
