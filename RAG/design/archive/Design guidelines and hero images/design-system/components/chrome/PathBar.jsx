import React from 'react';

/** Navigation path bar, upper-left (RFC §8.1): renders the ENTRY
 * ROUTE (a back-stack), not structural ancestry. ⌂ home at the head,
 * hover-revealed ‹ › arrows, bookmark pin (teardrop) at the tail —
 * pins mean places, everywhere. */
export function PathBar({ crumbs = ['Homeworld'], pinOpen, floating = true, onCrumb, onPin, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: floating ? 'absolute' : 'relative',
        ...(floating ? { top: '0.55rem', left: '0.6rem' } : {}),
        width: 'fit-content',
        display: 'flex',
        alignItems: 'center',
        gap: '0.15rem',
        padding: '0.15rem 0.3rem',
        background: 'var(--ew-surface-subtle)',
        border: '1px solid var(--ew-border)',
        borderRadius: 7,
        fontSize: '0.75rem',
        color: 'var(--ew-text)',
        fontFamily: 'var(--ew-font-ui)',
        ...style,
      }}
    >
      <button type="button" title="Home" style={crumbBtn}>⌂</button>
      <span style={{ display: 'flex', opacity: hover ? 1 : 0, transition: 'opacity 120ms ease-out' }}>
        <button type="button" title="Back" style={crumbBtn}>‹</button>
        <button type="button" title="Forward" style={{ ...crumbBtn, opacity: 0.35 }}>›</button>
      </span>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ opacity: 0.4 }}>▸</span>}
          <button
            type="button"
            onClick={onCrumb ? () => onCrumb(i) : undefined}
            style={{ ...crumbBtn, color: i === crumbs.length - 1 ? 'var(--ew-accent-soft)' : 'var(--ew-text)' }}
          >
            {c}
          </button>
        </React.Fragment>
      ))}
      <button type="button" title="Bookmarks" onClick={onPin} style={{ ...crumbBtn, display: 'inline-grid', placeItems: 'center', minWidth: '1.6rem', minHeight: '1.3rem', marginLeft: '0.15rem' }}>
        <span
          style={{
            width: 9,
            height: 9,
            border: `1.5px solid ${pinOpen ? 'var(--ew-accent-soft)' : 'var(--ew-text)'}`,
            background: pinOpen ? 'var(--ew-accent-soft)' : 'transparent',
            borderRadius: '50% 50% 50% 0',
            transform: `rotate(-45deg) translateY(${pinOpen ? 1 : -1}px)`,
            transition: 'background 120ms ease-out, transform 120ms ease-out',
            display: 'block',
          }}
        ></span>
      </button>
    </div>
  );
}

const crumbBtn = {
  padding: '0.1rem 0.4rem',
  background: 'transparent',
  color: 'var(--ew-text)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  font: 'inherit',
};
