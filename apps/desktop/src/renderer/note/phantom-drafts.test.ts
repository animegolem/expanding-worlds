import { describe, expect, it } from 'vitest'
import { discardPhantomDraft, phantomDraft, rememberPhantomDraft } from './phantom-drafts'

describe('session phantom drafts (AI-IMP-284)', () => {
  it('survives close/reopen by title key and discards explicitly', () => {
    rememberPhantomDraft('harbor', 'fog at dawn')
    expect(phantomDraft('harbor')).toBe('fog at dawn')
    expect(phantomDraft('other')).toBe('')
    discardPhantomDraft('harbor')
    expect(phantomDraft('harbor')).toBe('')
  })
})
