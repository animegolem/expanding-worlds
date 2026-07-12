import React from 'react';
import { Charm } from './Charm.jsx';

/** The vertical mode charm rail, upper-right (RFC §8.2): project ⧉ ·
 * search ⌕ · graph ⊛ · gallery ⊞ · outline ▤ · menu ☰. An ongoing-
 * condition ⚠ perch appends below only while a condition holds.
 * Chrome rests at 0.92 opacity on the shared engagement clock. */
export function CharmRail({ active, conditionCount = 0, floating = true, onSelect, style }) {
  const charms = [
    { id: 'project', glyph: '⧉', label: 'Library' },
    { id: 'search', glyph: '⌕', label: 'Search' },
    { id: 'graph', glyph: '⊛', label: 'Graph' },
    { id: 'gallery', glyph: '⊞', label: 'Gallery' },
    { id: 'outline', glyph: '▤', label: 'Outline' },
    { id: 'menu', glyph: '☰', label: 'Menu' },
  ];
  return (
    <div
      style={{
        position: floating ? 'absolute' : 'relative',
        ...(floating ? { top: '2.4rem', right: '0.6rem' } : {}),
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        opacity: 'var(--ew-chrome-rest-opacity)',
        ...style,
      }}
    >
      {charms.map((c) => (
        <Charm
          key={c.id}
          glyph={c.glyph}
          label={c.label}
          active={active === c.id}
          onClick={onSelect ? () => onSelect(c.id) : undefined}
        />
      ))}
      {conditionCount > 0 && <Charm glyph="⚠" label="Ongoing conditions" warn count={conditionCount} />}
    </div>
  );
}
