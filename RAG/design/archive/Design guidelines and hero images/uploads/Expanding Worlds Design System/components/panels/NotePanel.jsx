import React from 'react';
import { TagChip } from '../controls/TagChip.jsx';

/** Note panel (§8.5): notes are light PAPER even in dark theme.
 * Tethered = a glance (one at a time, dashed tail to its node);
 * pinned = a commitment (accumulate, stronger border + shadow, ⇱).
 * Header always shows ⌖ n places; origin label appears only when the
 * node lives on another board. */
export function NotePanel({ title, tags = [], places = 1, pinned, origin, dirty, width = 340, height, children, onPin, onClose, style }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width,
        height,
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: 'var(--ew-paper-surface)',
        border: `1px solid ${pinned ? 'var(--ew-paper-pinned-border)' : 'var(--ew-paper-border-strong)'}`,
        borderRadius: 9,
        boxShadow: pinned ? '0 10px 30px var(--ew-shadow)' : '0 6px 22px var(--ew-shadow)',
        fontFamily: 'var(--ew-font-ui)',
        ...style,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.45rem 0.25rem', cursor: pinned ? 'grab' : 'default' }}>
        {origin && (
          <span style={{ flex: 'none', maxWidth: '9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0.05rem 0.4rem', border: '1px solid var(--ew-paper-info-border)', borderRadius: 9, background: 'var(--ew-paper-info-panel)', color: 'var(--ew-paper-info-text)', fontSize: '0.7rem', cursor: 'pointer' }}>⌂ {origin}</span>
        )}
        <h2 style={{ flex: 1, margin: 0, overflow: 'hidden', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ew-paper-text-heading)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
          {dirty && <span style={{ marginLeft: '0.3rem', color: 'var(--ew-paper-dirty)', fontSize: '0.6rem', verticalAlign: 'middle' }}>●</span>}
        </h2>
        <button type="button" style={paperBtn} title={`${places} places`}>⌖ {places} {places === 1 ? 'place' : 'places'}</button>
        {onPin && <button type="button" onClick={onPin} style={paperBtn} title={pinned ? 'Unpin' : 'Pin'}>⇱</button>}
        {onClose && <button type="button" onClick={onClose} style={paperBtn} title="Close">✕</button>}
      </header>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', padding: '0 0.55rem 0.3rem' }}>
          {tags.map((t) => <TagChip key={t} tag={t} on="paper" />)}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', fontSize: '0.85rem', background: 'var(--ew-paper-page)', color: 'var(--ew-paper-text)', padding: '0.5rem 0.65rem', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

const paperBtn = {
  flex: 'none',
  padding: '0 0.3rem',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: '0.72rem',
  color: 'var(--ew-paper-text-muted)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/** Wiki-link span for note bodies: bound blue · unresolved purple ·
 * broken red+wavy (grey = recoverable-trashed). */
export function WikiLink({ state = 'bound', children }) {
  const color = `var(--ew-link-${state})`;
  const deco = state === 'broken' ? 'underline wavy' : 'underline';
  return (
    <span style={{ color, textDecoration: deco, textDecorationColor: `var(--ew-link-${state}-decoration)`, textUnderlineOffset: 2, cursor: 'pointer' }}>{children}</span>
  );
}
