import { describe, expect, it } from 'vitest'
import {
  LANDMARK_KEY_PREFIX,
  landmarkSettingKey,
  parseLandmarkFact,
  tornEdgeSide,
} from './lifecycle'

describe('landmark facts (§8.5 rev 0.55, AI-IMP-135)', () => {
  it('builds namespaced settings keys per placement', () => {
    expect(landmarkSettingKey('p-1')).toBe(`${LANDMARK_KEY_PREFIX}p-1`)
  })

  it('parses a well-formed fact and defaults label + tornFrom', () => {
    const fact = parseLandmarkFact({
      noteId: 'n',
      canvasId: 'c',
      sourcePlacementId: 's',
    })
    expect(fact).toEqual({
      noteId: 'n',
      canvasId: 'c',
      sourcePlacementId: 's',
      label: '',
      tornFrom: 'right',
    })
    expect(
      parseLandmarkFact({
        noteId: 'n',
        canvasId: 'c',
        sourcePlacementId: 's',
        label: 'Portrait',
        tornFrom: 'below',
      }),
    ).toMatchObject({ label: 'Portrait', tornFrom: 'below' })
    // An unknown side falls back rather than poisoning the overlay.
    expect(
      parseLandmarkFact({ noteId: 'n', canvasId: 'c', sourcePlacementId: 's', tornFrom: 'up' }),
    ).toMatchObject({ tornFrom: 'right' })
  })

  it('rejects malformed persisted values (settings are user files)', () => {
    expect(parseLandmarkFact(null)).toBeNull()
    expect(parseLandmarkFact('torn')).toBeNull()
    expect(parseLandmarkFact({})).toBeNull()
    expect(parseLandmarkFact({ noteId: 'n', canvasId: 'c' })).toBeNull()
    expect(parseLandmarkFact({ noteId: '', canvasId: 'c', sourcePlacementId: 's' })).toBeNull()
    expect(parseLandmarkFact({ noteId: 7, canvasId: 'c', sourcePlacementId: 's' })).toBeNull()
  })
})

describe('tornEdgeSide (the scar faces the old binding)', () => {
  it('maps each bind side to the page edge that tore', () => {
    expect(tornEdgeSide('right')).toBe('left')
    expect(tornEdgeSide('left')).toBe('right')
    expect(tornEdgeSide('below')).toBe('top')
  })
})
