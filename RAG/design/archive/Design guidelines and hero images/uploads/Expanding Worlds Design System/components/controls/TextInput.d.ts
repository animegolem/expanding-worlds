/** Text input. Never <datalist>-backed. */
export interface TextInputProps {
  value?: string;
  placeholder?: string;
  /** Full-pill form (facet bars) */
  pill?: boolean;
  /** Leading glyph, e.g. '#' or '⌕' */
  prefix?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
