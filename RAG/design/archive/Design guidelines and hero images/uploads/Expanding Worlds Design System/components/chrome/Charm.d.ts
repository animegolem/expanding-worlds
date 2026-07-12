/** Mode-rail charm button (RFC §8.2). */
export interface CharmProps {
  /** Unicode glyph: ⧉ ⌕ ⊛ ⊞ ▤ ☰ ⚠ */
  glyph: string;
  /** Tooltip rule: every control names itself */
  label?: string;
  active?: boolean;
  /** Not-yet-shipped rows rest at .45 opacity */
  deferred?: boolean;
  /** Perch styling: warn color + warn border */
  warn?: boolean;
  /** Danger badge count (perch conditions) */
  count?: number;
  onClick?: () => void;
  style?: React.CSSProperties;
}
