import React from 'react';

/** The one tooltip chip style, app-wide (RFC §8.2): every hoverable
 * control names itself and prints its shortcut. ~500ms delay in app. */
export function TooltipChip({ name, shortcut, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.22rem 0.55rem',
        background: 'var(--ew-tooltip-scrim)',
        color: 'var(--ew-chip-text)',
        border: '1px solid var(--ew-chip-border)',
        borderRadius: 5,
        fontSize: '0.72rem',
        fontFamily: 'var(--ew-font-ui)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {name}
      {shortcut && <span style={{ fontFamily: 'var(--ew-font-mono)', opacity: 0.65 }}>{shortcut}</span>}
    </span>
  );
}
