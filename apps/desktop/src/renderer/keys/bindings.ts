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
  boardLock: 'board-lock',
  boardOpenAsBoard: 'board-open-as-board',
  boardZoomFit: 'board-zoom-fit',
  boardDelete: 'board-delete',
  toolSelect: 'tool-select',
  toolText: 'tool-text',
  toolShapes: 'tool-shapes',
  toolDraw: 'tool-draw',
  toolLine: 'tool-line',
  toolArrow: 'tool-arrow',
  toolConnector: 'tool-connector',
  toolPin: 'tool-pin',
  toolFrame: 'tool-frame',
  // --- gallery ---
  gallerySelectAll: 'gallery-select-all',
  galleryMove: 'gallery-move',
  galleryBucketJump: 'gallery-bucket-jump',
  galleryPage: 'gallery-page',
  galleryOpen: 'gallery-open',
  galleryQuickLook: 'gallery-quick-look',
  galleryToggleSelect: 'gallery-toggle-select',
  galleryDelete: 'gallery-delete',
  // --- editor (note rich text) ---
  editorBold: 'editor-bold',
  editorItalic: 'editor-italic',
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
// EPIC-016 menu chords (AI-IMP-136): DECLARED here for the §8.4
// context-menu rows to print and the Settings Keyboard list to show;
// dispatch is wired where each verb's surface lives — lock and
// open-as-board in gestures-ui (board keys), zoom-fit in the dock
// (its ⤢ button). The rev 0.55 map assigns ⇧⌘L · ⏎ · ⇧1.
declare(KEY.boardLock, {
  name: 'Lock / unlock selection',
  scope: 'board',
  combo: { mod: true, shift: true, code: 'KeyL' },
})
declare(KEY.boardOpenAsBoard, {
  name: 'Open as board',
  scope: 'board',
  // ↵ derives from the code glyph; shift left "don't care" so the
  // gallery's own Enter never collides (gestures are dead in takeover).
  combo: { mod: false, alt: false, codes: ['Enter', 'NumpadEnter'] },
})
declare(KEY.boardZoomFit, {
  name: 'Zoom to fit',
  scope: 'board',
  // ⇧ prints from the shift flag; the printed key derives to "1".
  combo: { mod: false, alt: false, shift: true, code: 'Digit1' },
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
declare(KEY.toolFrame, {
  name: 'Frame tool',
  scope: 'board',
  combo: { mod: false, alt: false, key: 'f' },
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
// Bare Space opens Quick Look over the cursor cell (AI-IMP-168); the
// selection toggle moved to Mod+Space so the reserved key can finally
// spend itself on the preview it was held for (rev 0.25 → 0.55).
declare(KEY.galleryQuickLook, {
  name: 'Quick Look',
  scope: 'gallery',
  combo: { key: ' ', glyph: 'Space' },
})
declare(KEY.galleryToggleSelect, {
  name: 'Toggle selection',
  scope: 'gallery',
  combo: { mod: true, key: ' ', glyph: 'Space' },
})
declare(KEY.galleryDelete, {
  name: 'Move to Trash',
  scope: 'gallery',
  combo: { codes: ['Delete', 'Backspace'], glyph: 'Delete' },
})

// ---- editor (note rich text) ----
// DECLARED for the Settings Keyboard list only (AI-IMP-149, like Undo/
// Redo above). DISPATCH stays editor-local: TipTap's own mark keymaps
// (StarterKit Bold/Italic) already handle Mod+B / Mod+I inside the
// contenteditable per §10.2, so there is no renderer listener here —
// this is display + the printed combo, nothing more.
declare(KEY.editorBold, {
  name: 'Bold',
  scope: 'editor',
  when: 'while editing a note',
  combo: { mod: true, shift: false, alt: false, key: 'b' },
})
declare(KEY.editorItalic, {
  name: 'Italic',
  scope: 'editor',
  when: 'while editing a note',
  combo: { mod: true, shift: false, alt: false, key: 'i' },
})
