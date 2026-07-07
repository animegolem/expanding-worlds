/**
 * Every keybinding the app declares (RFC §8.2, AI-IMP-117). Importing
 * this module registers them all as a side effect; `main.ts` imports
 * it once at boot so the registry is populated before any tooltip or
 * the settings Keyboard section reads it. Listeners import the `KEY`
 * ids from here and consult the registry — this file is the single
 * place a binding's combo and human name live.
 *
 * Undo / Redo (Mod+Z, Shift+Mod+Z) are DECLARED here (AI-IMP-123) so
 * the settings Keyboard section lists them, but their DISPATCH stays
 * capture-phase in renderer/undo/undo-keys.ts (§10.2 editor boundary
 * needs the capture listener; declaration-only is this ticket's bar).
 * undo-keys.ts consults `matches(event, KEY.undo/redo)` so the printed
 * combo and the handled combo cannot drift.
 *
 * Deferred, intentionally NOT declared here:
 * - CodeMirror's editor-local keymap stays its own world (§8.2 /
 *   ticket out-of-scope); the settings page names it without listing it.
 */
import { declare } from './registry'

export const KEY = {
  // --- global ---
  quickOpen: 'quick-open',
  navBack: 'nav-back',
  navForward: 'nav-forward',
  bookmarkJump: 'bookmark-jump',
  bookmarkCurrent: 'bookmark-current',
  // --- board ---
  undo: 'undo',
  redo: 'redo',
  boardSelectAll: 'board-select-all',
  boardSendForward: 'board-send-forward',
  boardSendFront: 'board-send-front',
  boardSendBackward: 'board-send-backward',
  boardSendBack: 'board-send-back',
  boardFlipH: 'board-flip-h',
  boardFlipV: 'board-flip-v',
  boardDelete: 'board-delete',
  toolSelect: 'tool-select',
  toolText: 'tool-text',
  toolShapes: 'tool-shapes',
  toolDraw: 'tool-draw',
  toolLine: 'tool-line',
  toolArrow: 'tool-arrow',
  toolConnector: 'tool-connector',
  toolPin: 'tool-pin',
  // --- gallery ---
  gallerySelectAll: 'gallery-select-all',
  galleryMove: 'gallery-move',
  galleryBucketJump: 'gallery-bucket-jump',
  galleryPage: 'gallery-page',
  galleryOpen: 'gallery-open',
  galleryToggleSelect: 'gallery-toggle-select',
  galleryDelete: 'gallery-delete',
} as const

// ---- global ----
declare(KEY.quickOpen, {
  name: 'Quick open',
  scope: 'global',
  combo: { mod: true, shift: false, alt: false, key: 'p' },
})
declare(KEY.navBack, {
  name: 'Back',
  scope: 'global',
  combo: { mod: true, shift: false, alt: false, key: '[' },
})
declare(KEY.navForward, {
  name: 'Forward',
  scope: 'global',
  combo: { mod: true, shift: false, alt: false, key: ']' },
})
declare(KEY.bookmarkJump, {
  name: 'Jump to bookmark',
  scope: 'global',
  when: 'by current row order',
  // A family, not one literal key — dispatch stays inline in PathBar.
  combo: { mod: true, glyph: '1–9' },
})
declare(KEY.bookmarkCurrent, {
  name: 'Bookmark this board',
  scope: 'global',
  combo: { mod: true, shift: false, alt: false, key: 'd' },
})

// ---- board ----
// Dispatch lives in undo/undo-keys.ts (capture phase); these are the
// display + match declarations only (AI-IMP-123). Alt disqualifies —
// mirrors the handler's `if (event.altKey) return`.
declare(KEY.undo, {
  name: 'Undo',
  scope: 'board',
  combo: { mod: true, shift: false, alt: false, key: 'z' },
})
declare(KEY.redo, {
  name: 'Redo',
  scope: 'board',
  combo: { mod: true, shift: true, alt: false, key: 'z' },
})
declare(KEY.boardSelectAll, {
  name: 'Select all',
  scope: 'board',
  // Physical KeyA (code), mirroring the original gestures predicate —
  // fires whether or not Shift is held.
  combo: { mod: true, code: 'KeyA' },
})
declare(KEY.boardSendForward, {
  name: 'Send forward',
  scope: 'board',
  combo: { mod: true, shift: false, code: 'BracketRight' },
})
declare(KEY.boardSendFront, {
  name: 'Send to front',
  scope: 'board',
  combo: { mod: true, shift: true, code: 'BracketRight' },
})
declare(KEY.boardSendBackward, {
  name: 'Send backward',
  scope: 'board',
  combo: { mod: true, shift: false, code: 'BracketLeft' },
})
declare(KEY.boardSendBack, {
  name: 'Send to back',
  scope: 'board',
  combo: { mod: true, shift: true, code: 'BracketLeft' },
})
declare(KEY.boardFlipH, {
  name: 'Flip horizontal',
  scope: 'board',
  combo: { mod: false, shift: true, code: 'KeyH' },
})
declare(KEY.boardFlipV, {
  name: 'Flip vertical',
  scope: 'board',
  combo: { mod: false, shift: true, code: 'KeyV' },
})
declare(KEY.boardDelete, {
  name: 'Move selection to Trash',
  scope: 'board',
  combo: { mod: false, codes: ['Delete', 'Backspace'], glyph: 'Delete' },
})
declare(KEY.toolSelect, {
  name: 'Select tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'v' },
})
declare(KEY.toolText, {
  name: 'Text tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 't' },
})
declare(KEY.toolShapes, {
  name: 'Shape tools',
  scope: 'board',
  combo: { mod: false, alt: false, key: 's' },
})
declare(KEY.toolDraw, {
  name: 'Draw tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'd' },
})
declare(KEY.toolLine, {
  name: 'Line tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'l' },
})
declare(KEY.toolArrow, {
  name: 'Arrow tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'a' },
})
declare(KEY.toolConnector, {
  name: 'Connector tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'c' },
})
declare(KEY.toolPin, {
  name: 'Pin tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'n' },
})

// ---- gallery ----
declare(KEY.gallerySelectAll, {
  name: 'Select all',
  scope: 'gallery',
  combo: { mod: true, key: 'a' },
})
declare(KEY.galleryMove, {
  name: 'Move cursor',
  scope: 'gallery',
  combo: { glyph: '↑ ↓ ← →' },
})
declare(KEY.galleryBucketJump, {
  name: 'Jump between periods',
  scope: 'gallery',
  combo: { mod: true, glyph: '↑ ↓' },
})
declare(KEY.galleryPage, {
  name: 'Page up / down',
  scope: 'gallery',
  combo: { glyph: 'PgUp PgDn' },
})
declare(KEY.galleryOpen, {
  name: 'Open',
  scope: 'gallery',
  combo: { key: 'Enter' },
})
declare(KEY.galleryToggleSelect, {
  name: 'Toggle selection',
  scope: 'gallery',
  combo: { key: ' ', glyph: 'Space' },
})
declare(KEY.galleryDelete, {
  name: 'Move to Trash',
  scope: 'gallery',
  combo: { codes: ['Delete', 'Backspace'], glyph: 'Delete' },
})
