import React from 'react';

/** Screen-space panel shell (§8.5 grammar): shadow = screen-space.
 * Menu surface, strong border, 9px radius, grab-cursor header, ✕. */
export function Panel({ title, headerExtra, width = 360, children, onClose, style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width,
        overflow: 'hidden',
        background: 'var(--ew-surface-menu)',
        border: '1px solid var(--ew-border-strong)',
        borderRadius: 9,
        boxShadow: '0 10px 30px var(--ew-shadow)',
        fontSize: '0.78rem',
        color: 'var(--ew-text)',
        fontFamily: 'var(--ew-font-ui)',
        ...style,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.4rem 0.4rem 0.4rem 0.7rem', borderBottom: '1px solid var(--ew-border)', cursor: 'grab', userSelect: 'none' }}>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {headerExtra}
          {onClose && (
            <button type="button" onClick={onClose} style={{ flex: 'none', padding: '0.1rem 0.4rem', background: 'transparent', color: 'var(--ew-text-muted)', border: 'none', borderRadius: 4, font: 'inherit', cursor: 'pointer' }}>✕</button>
          )}
        </span>
      </header>
      {children}
    </div>
  );
}
