/** Tag chip (#tag, mono). */
export interface TagChipProps {
  tag: string;
  /** 'paper' (note panels) | 'dark' (chrome) */
  on?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
