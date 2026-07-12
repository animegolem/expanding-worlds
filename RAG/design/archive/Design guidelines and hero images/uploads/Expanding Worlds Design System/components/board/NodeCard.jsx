import React from 'react';

/** Drawn hint charms (§4.1) — built from bordered divs, not glyphs.
 * page = has a note · frame = has a nested canvas. */
export function HintCharm({ kind = 'page', muted, style }) {
  const ink = muted ? 'var(--ew-text-muted)' : 'rgba(255,255,255,.92)';
  const bg = muted ? 'var(--ew-chip-bg, var(--ew-control-tint))' : 'var(--ew-art-chip-scrim)';
  if (kind === 'frame')
    return (
      <div style={{ width: 17, height: 17, border: `1.5px solid ${ink}`, borderRadius: 2.5, background: bg, position: 'relative', overflow: 'hidden', ...style }}>
        <div style={{ position: 'absolute', left: 3, top: 3, width: 4, height: 4, border: `1.2px solid ${ink}`, borderRadius: '50%' }}></div>
        <div style={{ position: 'absolute', left: 5, bottom: -1, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `8px solid ${ink}` }}></div>
      </div>
    );
  return (
    <div style={{ width: 14, height: 17, border: `1.5px solid ${ink}`, borderRadius: 2.5, background: bg, position: 'relative', ...style }}>
      <div style={{ position: 'absolute', left: 3, top: 4, right: 3, borderTop: `1.5px solid ${ink}` }}></div>
      <div style={{ position: 'absolute', left: 3, top: 8, right: 5, borderTop: `1.5px solid ${ink}` }}></div>
    </div>
  );
}

/** A placed node on the board (world content: FLAT, 3px radius, soft
 * drop shadow, never a panel). Selection = thin accent outline, no
 * drawn handles ever. Hint charms sit INSIDE the lower-right corner
 * at rest opacity .7 — a glanceable census. */
export function NodeCard({ title, src, stripes = '115deg,#4a5560,#414b55', width = 190, height = 250, label, hasNote, hasCanvas, selected, hit, dimmed, onClick, style }) {
  const [angle, c1, c2] = stripes.split(',');
  const outline = selected ? '2px solid var(--ew-accent)' : hit ? '2px solid var(--ew-node-dot-orange)' : 'none';
  return (
    <div style={{ width, opacity: dimmed ? 0.18 : 1, ...style }} onClick={onClick}>
      <div
        style={{
          position: 'relative',
          width,
          height,
          borderRadius: 3,
          background: src ? `center/cover no-repeat url(${src})` : `repeating-linear-gradient(${angle}, ${c1} 0 12px, ${c2} 12px 24px)`,
          boxShadow: dimmed ? 'none' : 'var(--ew-node-shadow)',
          outline,
          outlineOffset: 3,
          cursor: onClick ? 'pointer' : 'default',
        }}
      >
        {!src && label && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '11px var(--ew-font-mono)', color: 'rgba(255,255,255,.38)' }}>{label}</span>
        )}
        {(hasNote || hasCanvas) && (
          <div style={{ position: 'absolute', right: 6, bottom: 6, display: 'flex', gap: 4, opacity: 'var(--ew-hint-charm-rest-opacity)' }}>
            {hasNote && <HintCharm kind="page" />}
            {hasCanvas && <HintCharm kind="frame" />}
          </div>
        )}
      </div>
      {title && (
        <div style={{ marginTop: 6, textAlign: 'center', fontSize: 12, color: 'var(--ew-text-muted)', fontFamily: 'var(--ew-font-ui)' }}>{title}</div>
      )}
    </div>
  );
}
