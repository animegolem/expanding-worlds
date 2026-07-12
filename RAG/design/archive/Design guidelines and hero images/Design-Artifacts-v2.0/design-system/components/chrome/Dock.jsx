import React from 'react';

const toolBtn = (active) => ({
  minWidth: '1.9rem',
  height: '1.9rem',
  display: 'inline-grid',
  placeItems: 'center',
  fontSize: '0.95rem',
  padding: '0.15rem 0.45rem',
  background: active ? 'var(--ew-accent)' : 'var(--ew-surface-raised)',
  color: active ? 'var(--ew-on-accent)' : 'var(--ew-text)',
  border: `1px solid ${active ? 'var(--ew-accent)' : 'var(--ew-border-strong)'}`,
  borderRadius: 5,
  cursor: 'pointer',
  fontFamily: 'var(--ew-font-ui)',
});

/** The floating dock, bottom-center (RFC §8.2): tool modes (shapes
 * behind one flyout) · divider · zoom cluster. Nothing docks; the
 * dock floats over the board and never reflows it. */
export function Dock({ activeTool = 'select', zoomPct = 100, shapeGlyph = '▭', floating = true, onTool, onZoom, style }) {
  const tools = [
    { kind: 'select', glyph: '⬚', label: 'Select' },
    { kind: 'text', glyph: 'T', label: 'Text' },
    { kind: 'shapes', glyph: shapeGlyph, label: 'Shapes' },
    { kind: 'path', glyph: '✎', label: 'Draw' },
    { kind: 'line', glyph: '╱', label: 'Line' },
    { kind: 'arrow', glyph: '↗', label: 'Arrow' },
    { kind: 'connector', glyph: '⌁', label: 'Connector' },
    { kind: 'pin', glyph: '◉', label: 'Pin' },
  ];
  return (
    <div
      style={{
        position: floating ? 'absolute' : 'relative',
        ...(floating ? { bottom: '0.6rem', left: '50%', transform: 'translateX(-50%)' } : {}),
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.3rem 0.45rem',
        background: 'var(--ew-surface)',
        border: '1px solid var(--ew-border)',
        borderRadius: 9,
        fontSize: '0.75rem',
        color: 'var(--ew-text)',
        opacity: 'var(--ew-chrome-rest-opacity)',
        ...style,
      }}
    >
      {tools.map((t) => (
        <button key={t.kind} type="button" title={t.label} style={toolBtn(activeTool === t.kind)} onClick={onTool ? () => onTool(t.kind) : undefined}>
          {t.glyph}
        </button>
      ))}
      <span style={{ width: 1, height: '1.4rem', background: 'var(--ew-border-strong)', margin: '0 0.25rem' }}></span>
      <button type="button" title="Zoom out" style={toolBtn(false)} onClick={onZoom ? () => onZoom(-1) : undefined}>−</button>
      <span style={{ minWidth: '3.1rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>{zoomPct}%</span>
      <button type="button" title="Zoom in" style={toolBtn(false)} onClick={onZoom ? () => onZoom(1) : undefined}>+</button>
      <button type="button" title="Zoom to fit" style={toolBtn(false)} onClick={onZoom ? () => onZoom(0) : undefined}>⤢</button>
    </div>
  );
}
