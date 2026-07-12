/** Facet/filter chip. */
export interface FacetChipProps {
  label: string;
  on?: boolean;
  /** Active-tag form with a ✕ clear button */
  tag?: boolean;
  onToggle?: () => void;
  onClear?: () => void;
  style?: React.CSSProperties;
}
