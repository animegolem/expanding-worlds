/** Segmented pill control. */
export interface SegmentedProps {
  options?: string[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
