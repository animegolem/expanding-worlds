import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NodeAppearance } from '@ew/commands'
import { describe, expect, it } from 'vitest'
import {
  ALL_APPEARANCE_KINDS,
  decodeAppearanceColumns,
  encodeAppearanceColumns,
  validateNodeAppearance,
} from './node-appearance'

const OPTIONS = {
  allowedKinds: ALL_APPEARANCE_KINDS,
  allowNull: true,
  kindMessage: 'appearance kind must be dot, icon, image, card, or frame',
}

describe('node appearance codec (AI-IMP-252)', () => {
  it('round-trips null and every appearance kind through fixed columns', () => {
    const appearances: Array<NodeAppearance | null> = [
      null,
      { kind: 'dot', color: 'paper-red' },
      { kind: 'icon', icon: 'castle' },
      { kind: 'image', assetId: 'asset-a', crop: null },
      { kind: 'image', assetId: 'asset-b', crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
      { kind: 'card' },
      { kind: 'frame' },
    ]

    for (const appearance of appearances) {
      expect(decodeAppearanceColumns(encodeAppearanceColumns(appearance))).toEqual(appearance)
    }
  })

  it('rejects empty dot/icon values and malformed normalized crops', () => {
    for (const value of [
      { kind: 'dot', color: '' },
      { kind: 'icon', icon: '' },
      { kind: 'image', assetId: 'asset', crop: { x: 0, y: 0, width: Number.NaN, height: 1 } },
      { kind: 'image', assetId: 'asset', crop: { x: 0.9, y: 0, width: 0.2, height: 1 } },
    ]) {
      expect(() => validateNodeAppearance(value, OPTIONS)).toThrowError()
    }
  })

  it('refuses malformed durable columns instead of decoding them as null', () => {
    expect(() =>
      decodeAppearanceColumns({ kind: 'hologram', color: null, icon: null, assetId: null, crop: null }),
    ).toThrow(/stored appearance kind is invalid/)
    expect(() =>
      decodeAppearanceColumns({ kind: 'image', color: null, icon: null, assetId: 'asset', crop: '{' }),
    ).toThrow(/stored image appearance crop is malformed/)
  })
})

describe('appearance adoption guard', () => {
  it('keeps node appearance updates and crop encoding inside the codec', () => {
    for (const file of ['./pin.ts', './nodes.ts']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
      expect(source, `${file} contains a local appearance update`).not.toMatch(
        /UPDATE node SET appearance_kind/,
      )
      expect(source, `${file} contains a local crop encoder`).not.toMatch(
        /JSON\.stringify\([^)]*\.crop/,
      )
    }
  })
})
