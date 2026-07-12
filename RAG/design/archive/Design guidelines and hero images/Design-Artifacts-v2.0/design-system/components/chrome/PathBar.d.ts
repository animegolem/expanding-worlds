/** Navigation path bar (RFC §8.1) — entry route, not ancestry. */
export interface PathBarProps {
  /** Back-stack crumbs, current board last */
  crumbs?: string[];
  /** Bookmark teardrop pressed state (menu open) */
  pinOpen?: boolean;
  floating?: boolean;
  onCrumb?: (index: number) => void;
  onPin?: () => void;
  style?: React.CSSProperties;
}
