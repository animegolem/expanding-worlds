import React from 'react';

/** Mode-rail charm button (RFC §8.2). 2rem square, 7px radius,
 * rail surface; active = accent fill + on-accent ink; deferred rests
 * at .45 opacity. Glyphs: ⧉ ⌕ ⊛ ⊞ ▤ ☰ (rail) · ⚠ (perch). */
export function Charm({ glyph, label, active, deferred, warn, count, onClick, style }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        position: 'relative',
        width: '2rem',
        height: '2rem',
        display: 'grid',
        placeItems: 'center',
        fontSize: '1rem',
        fontFamily: 'var(--ew-font-ui)',
        background: active ? 'var(--ew-accent)' : 'var(--ew-surface-rail)',
        color: warn ? 'var(--ew-warn)' : active ? 'var(--ew-on-accent)' : 'var(--ew-text)',
        border: `1px solid ${active ? 'var(--ew-accent)' : warn ? 'var(--ew-warn-border)' : 'var(--ew-border)'}`,
        borderRadius: 7,
        cursor: deferred ? 'default' : 'pointer',
        opacity: deferred ? 0.45 : 1,
        ...style,
      }}
    >
      {glyph}
      {count != null && count > 0 && (
        <span
          style={{
            position: 'absolute',
            top: '-0.3rem',
            right: '-0.3rem',
            minWidth: '0.9rem',
            height: '0.9rem',
            padding: '0 0.15rem',
            display: 'grid',
            placeItems: 'center',
            background: 'var(--ew-danger)',
            color: 'var(--ew-on-danger)',
            borderRadius: '0.45rem',
            fontSize: '0.6rem',
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
