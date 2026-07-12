import React from 'react';

/** Tag chip. Two habitats: on='paper' (note panel header — paper chip
 * tokens, 8px radius) and on='dark' (chrome scrim chip). Mono #tag. */
export function TagChip({ tag, on = 'paper', onClick, style }) {
  const paper = on === 'paper';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: paper ? '0 0.45rem' : '0.14rem 0.55rem',
        border: `1px solid ${paper ? 'var(--ew-paper-chip-border)' : 'var(--ew-chip-border)'}`,
        borderRadius: paper ? 8 : 9,
        background: paper ? 'var(--ew-paper-chip-surface)' : 'var(--ew-chip-scrim)',
        color: paper ? 'var(--ew-paper-chip-text)' : 'var(--ew-chip-text)',
        fontSize: '0.7rem',
        fontFamily: 'var(--ew-font-mono)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      #{String(tag).replace(/^#/, '')}
    </button>
  );
}
