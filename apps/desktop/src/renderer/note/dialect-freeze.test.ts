// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { MARKDOWN_DIALECT } from '@ew/domain'
import { describe, expect, it } from 'vitest'
import { baseNoteExtensions } from './editor-markdown'

/**
 * The §7.1 dialect FREEZE guard (AI-IMP-150, EPIC-018 FR-5).
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ IF THIS TEST FAILS, YOU CHANGED THE CANONICAL MARKDOWN DIALECT.     │
 * │                                                                    │
 * │ The frozen dialect is a RATIFIED RFC-0001 §7.1 DECISION, not a      │
 * │ refactor. TipTap normalizes Markdown (render-identical, not         │
 * │ byte-identical), so note bodies are canonicalized ONCE on first     │
 * │ open into exactly this flavour and the round-trip corpus            │
 * │ (markdown-dialect.ts + editor-markdown.test.ts) is its permanent    │
 * │ regression gate. Adding/removing a TipTap extension, changing the   │
 * │ StarterKit schema surface, or altering a markdown-it knob SILENTLY  │
 * │ shifts what every existing note re-canonicalizes to — a data        │
 * │ migration disguised as a dependency bump or a "small" editor tweak. │
 * │                                                                    │
 * │ Do not update these snapshots to make the test pass. Take the       │
 * │ change to RFC-0001 §7.1 first; if it is ratified, update the        │
 * │ frozen values AND the corpus in the SAME commit, and expect every   │
 * │ pre-existing note to re-canonicalize on its next open.              │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * The mechanism is TRUTHFUL rather than a hand-maintained string dump:
 * it builds the REAL shipped editor and reads back what it actually
 * loaded — the ProseMirror extension names, the compiled schema's node
 * and mark names (the exact serializable surface: nothing else can enter
 * a note body), and the LIVE markdown extension options (so a
 * `Markdown.configure({ ...override })` that bypasses MARKDOWN_DIALECT
 * still trips the guard). If TipTap/StarterKit/tiptap-markdown drifts
 * under a version bump, the loaded surface changes and this fails.
 */

function buildEditor(): Editor {
  const element = document.createElement('div')
  return new Editor({ element, extensions: baseNoteExtensions(), content: '' })
}

describe('frozen dialect guard (§7.1 — RFC decision, not a refactor)', () => {
  it('the TipTap extension set is frozen', () => {
    const editor = buildEditor()
    try {
      const loaded = editor.extensionManager.extensions
        .map((e) => `${e.type}:${e.name}`)
        .sort()
      expect(loaded).toEqual([
        'extension:clipboardTextSerializer',
        'extension:commands',
        'extension:drop',
        'extension:dropCursor',
        'extension:editable',
        'extension:focusEvents',
        'extension:formatBar',
        'extension:gapCursor',
        'extension:headingFold',
        'extension:history',
        'extension:keymap',
        'extension:markdown',
        'extension:markdownClipboard',
        'extension:markdownTightLists',
        'extension:paste',
        'extension:starterKit',
        'extension:tabindex',
        'mark:bold',
        'mark:code',
        // AI-IMP-170: the §7.1 URL cluster + highlight (rev 0.66). These
        // three grow the frozen serializable surface by ruling.
        'mark:highlight',
        'mark:italic',
        'mark:link',
        'mark:strike',
        'node:blockquote',
        'node:bulletList',
        'node:codeBlock',
        'node:doc',
        'node:hardBreak',
        'node:heading',
        'node:horizontalRule',
        'node:image',
        'node:listItem',
        'node:orderedList',
        'node:paragraph',
        'node:text',
      ])
    } finally {
      editor.destroy()
    }
  })

  it('the schema serializable surface (nodes + marks) is frozen', () => {
    const editor = buildEditor()
    try {
      // These are the ONLY nodes/marks that can appear in a note body, so
      // they bound exactly what the serializer can emit into the dialect.
      expect(Object.keys(editor.schema.nodes).sort()).toEqual([
        'blockquote',
        'bulletList',
        'codeBlock',
        'doc',
        'hardBreak',
        'heading',
        'horizontalRule',
        // AI-IMP-170: the non-fetching image chip (`![alt](url)`).
        'image',
        'listItem',
        'orderedList',
        'paragraph',
        'text',
      ])
      expect(Object.keys(editor.schema.marks).sort()).toEqual([
        'bold',
        'code',
        // AI-IMP-170: `==highlight==` and the inline URL `link` mark.
        'highlight',
        'italic',
        'link',
        'strike',
      ])
    } finally {
      editor.destroy()
    }
  })

  it('the frozen markdown-it knobs are the single source of truth', () => {
    // The pinned dialect object itself (packages/domain). Every knob is
    // load-bearing; see markdown-dialect.ts for the per-knob rationale.
    expect(MARKDOWN_DIALECT).toEqual({
      html: false,
      tightLists: true,
      bulletListMarker: '-',
      linkify: false,
      breaks: false,
      transformPastedText: false,
      transformCopiedText: false,
    })
  })

  it('the LIVE editor consumes exactly the frozen knobs (no config bypass)', () => {
    const editor = buildEditor()
    try {
      const md = editor.extensionManager.extensions.find((e) => e.name === 'markdown')
      expect(md, 'markdown extension present').toBeTruthy()
      const live = md!.options as Record<string, unknown>
      // Assert every frozen knob is live at its frozen value. A subset
      // check (tiptap-markdown adds its own defaults like tightListClass)
      // that still catches any override of a MARKDOWN_DIALECT knob.
      for (const [key, value] of Object.entries(MARKDOWN_DIALECT)) {
        expect(live[key], `markdown knob "${key}"`).toEqual(value)
      }
    } finally {
      editor.destroy()
    }
  })

  it('StarterKit is configured for all six heading levels, stock text off', () => {
    const editor = buildEditor()
    try {
      // §7.1 org folding maps levels 1–6; the loaded StarterKit config
      // must carry every one (and hand `text` off to WikiText so the
      // source-preserving serializer owns token bytes). Reads the config
      // the editor ACTUALLY loaded, not the source literal.
      const starter = editor.extensionManager.extensions.find((e) => e.name === 'starterKit')
      expect(starter, 'starterKit present').toBeTruthy()
      const opts = starter!.options as { text?: unknown; heading?: { levels?: number[] } }
      expect(opts.text).toBe(false)
      expect(opts.heading?.levels).toEqual([1, 2, 3, 4, 5, 6])
    } finally {
      editor.destroy()
    }
  })
})
